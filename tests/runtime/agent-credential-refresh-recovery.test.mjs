import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import { observeClaudeCredentialState } from "../../runtime/claude-credential-state.mjs";
import { readJobFile, resolveJobFile, writeJobFile } from "../../runtime/job-store.mjs";

const roots = [];
const sharedRuntimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "hd-agent-credential-recovery-home-"));

after(() => fs.rmSync(sharedRuntimeHome, { recursive: true, force: true }));
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function writeCredential(claudeConfigDir, expiresAt) {
  const temporary = path.join(claudeConfigDir, `.credentials.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify({
    claudeAiOauth: {
      accessToken: "test-token-never-projected",
      refreshToken: "test-refresh-never-projected",
      expiresAt,
      refreshTokenExpiresAt: expiresAt + 86_400_000,
    },
  }), { mode: 0o600 });
  fs.renameSync(temporary, path.join(claudeConfigDir, ".credentials.json"));
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hd-agent-credential-recovery-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, "claude");
  const envFile = path.join(root, "runtime.env");
  const ownerRootId = `root-agent-credential-recovery-${path.basename(root)}`;
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  writeCredential(claudeConfigDir, Date.now() - 60_000);
  roots.push(root);
  const env = {
    CODEX_THREAD_ID: ownerRootId,
    CODEX_HARNESSDOCK_RUNTIME_HOME: sharedRuntimeHome,
    CLAUDE_CONFIG_DIR: claudeConfigDir,
  };
  const runtime = createAgentRuntime({ cwd: workspace, envFile, env });
  return { runtime, workspace, claudeConfigDir, ownerRootId, env };
}

function readiness(runtime) {
  return {
    ready: true,
    availability: { available: true },
    compatibility: {
      staticCompatible: true,
      fingerprint: "test-compatible-claude",
      executable: process.execPath,
      version: "test",
    },
    auth: { loggedIn: true, liveValidated: false },
    cwd: runtime.jobs.cwd,
    claudeConfigDir: runtime.jobs.env.CLAUDE_CONFIG_DIR,
    sourceRoot: runtime.jobs.sourceRoot,
  };
}

function establishAuthFailure(options = {}) {
  const setupState = setup();
  const { runtime, workspace, ownerRootId, env } = setupState;
  const credentialObservation = observeClaudeCredentialState({ env });
  const created = runtime.store.createAgent({
    task_name: options.taskName ?? "credential_refresh_target",
    selectedModel: "claude-sonnet-5",
    delegationMode: "leaf",
    initialMessage: "perform the original bounded task",
  });
  const jobId = options.jobId ?? "job-auth-failure";
  const activation = runtime.store.reserveActivation(created.agentId, jobId, { initial: true });
  assert.equal(activation.reserved, true);
  runtime.store.markMessageDispatched(created.agentId, activation.assignedMessages[0].messageId, {
    jobId,
    receipt: { delivery: "initial_prompt" },
  });
  const timestamp = new Date().toISOString();
  const toolUses = options.toolUses ?? [];
  const touchedFiles = options.touchedFiles ?? [];
  const assistantOutputObserved = options.assistantOutputObserved ?? false;
  writeJobFile(workspace, jobId, {
    id: jobId,
    workspaceRoot: workspace,
    ownerRootId,
    agentId: created.agentId,
    harnessId: "claude-code",
    harnessInstanceKey: options.failedInstanceKey ?? fs.realpathSync.native(setupState.claudeConfigDir),
    claudeConfigDir: fs.realpathSync.native(setupState.claudeConfigDir),
    driverVersion: "claude-code@1",
    harnessCapabilities: created.capabilities,
    parentJobId: options.parentJobId ?? null,
    status: "failed",
    phase: "failed",
    threadId: "native-auth-failure-session",
    preClaudeLaunch: false,
    acceptingSteering: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    request: {
      prompt: "perform the original bounded task",
      model: "claude-sonnet-5",
      effort: "low",
      delegationMode: "leaf",
      write: false,
      profile: "terminal-parity",
    },
    recoverability: {
      resumable: false,
      mode: "blocked",
      exactSessionId: null,
      reason: "auth_or_permission",
    },
    result: {
      status: "failed",
      failureClass: "auth_or_permission",
      failureReason: "OAuth access token has expired",
      rawOutput: "OAuth access token has expired",
      partialOutput: "OAuth access token has expired",
      assistantOutputObserved,
      toolUses,
      touchedFiles,
      attempts: [{ assistantOutputObserved, toolUses, touchedFiles }],
      runtimeReceipt: options.omitCredentialObservation ? {} : { credentialObservation },
    },
  });
  runtime.reconcile();
  const failedAgent = runtime.store.resolveTarget(created.agentId);
  assert.equal(failedAgent.status, "errored");
  assert.equal(failedAgent.continuation.mode, "blocked");
  assert.equal(runtime.store.listMessages(created.agentId)[0].state, "acknowledged");
  return { ...setupState, agent: failedAgent, jobId, credentialObservation };
}

describe("credential-refresh Agent recovery", () => {
  it("requeues the first side-effect-free auth turn and activates it once after credential rotation", async () => {
    const { runtime, workspace, claudeConfigDir, agent, jobId } = establishAuthFailure();
    assert.equal(agent.claudeSessionId, null, "an auth-failed native session must not become a resume target");
    const historicalJob = fs.readFileSync(resolveJobFile(workspace, jobId), "utf8");

    writeCredential(claudeConfigDir, Date.now() + 3_600_000);
    runtime.jobs.assertReady = () => readiness(runtime);
    let launchedPrompt = null;
    runtime.jobs.launchPreparedStart = async (prepared, prompt) => {
      launchedPrompt = prompt;
      return { jobId: prepared.jobId, agentId: prepared.agentId, status: "queued" };
    };

    const receipt = await runtime.followupTask({
      target: agent.agentId,
      message: "credentials were refreshed; retry the same task",
    });

    assert.deepEqual(receipt, { agent_name: agent.path, delivery: "new_turn" });
    assert.equal(
      launchedPrompt,
      "perform the original bounded task\n\ncredentials were refreshed; retry the same task",
    );
    const recovered = runtime.store.resolveTarget(agent.agentId);
    assert.equal(recovered.status, "running");
    assert.equal(recovered.claudeSessionId, null);
    assert.notEqual(recovered.activeJobId, jobId);
    const messages = runtime.store.listMessages(agent.agentId);
    assert.deepEqual(messages.map((message) => message.sequence), [1, 2]);
    assert.ok(messages.every((message) =>
      message.assignedJobId === recovered.activeJobId && message.state === "dispatched"
    ));
    assert.equal(fs.readFileSync(resolveJobFile(workspace, jobId), "utf8"), historicalJob);
    assert.equal(readJobFile(workspace, jobId).result.failureClass, "auth_or_permission");
  });

  it("does not mutate mailbox or jobs when the credential generation is unchanged", async () => {
    const { runtime, agent } = establishAuthFailure({ taskName: "unchanged_credential" });
    const beforeAgent = runtime.store.resolveTarget(agent.agentId);
    const beforeMessages = runtime.store.listMessages(agent.agentId);
    await assert.rejects(
      runtime.followupTask({ target: agent.agentId, message: "retry without operator refresh" }),
      /reason=auth_required, scope=harness, retry=operator_required/,
    );
    assert.deepEqual(runtime.store.resolveTarget(agent.agentId), beforeAgent);
    assert.deepEqual(runtime.store.listMessages(agent.agentId), beforeMessages);
  });

  it("keeps an expired replacement blocked", async () => {
    const { runtime, claudeConfigDir, agent } = establishAuthFailure({ taskName: "expired_replacement" });
    writeCredential(claudeConfigDir, Date.now() - 1);
    await assert.rejects(
      runtime.followupTask({ target: agent.agentId, message: "must remain blocked" }),
      /reason=auth_required, scope=harness, retry=operator_required/,
    );
  });

  it("keeps foreign config identity and legacy missing evidence blocked", async () => {
    for (const options of [
      { taskName: "foreign_config", failedInstanceKey: "/foreign/claude-config" },
      { taskName: "legacy_missing_evidence", omitCredentialObservation: true },
    ]) {
      const { runtime, claudeConfigDir, agent } = establishAuthFailure(options);
      writeCredential(claudeConfigDir, Date.now() + 3_600_000);
      await assert.rejects(
        runtime.followupTask({ target: agent.agentId, message: "must remain blocked" }),
        /reason=auth_required, scope=harness, retry=operator_required/,
      );
    }
  });

  it("does not let non-activating send_message consume credential rotation", () => {
    const { runtime, claudeConfigDir, agent } = establishAuthFailure({ taskName: "send_stays_blocked" });
    writeCredential(claudeConfigDir, Date.now() + 3_600_000);
    assert.throws(
      () => runtime.sendMessage({ target: agent.agentId, message: "must not activate" }),
      /reason=auth_required, scope=harness, retry=operator_required/,
    );
    assert.equal(runtime.store.listMessages(agent.agentId).length, 1);
    assert.equal(runtime.store.listMessages(agent.agentId)[0].state, "acknowledged");
  });

  for (const [label, evidence] of [
    ["native tool use", { toolUses: [{ name: "Bash" }] }],
    ["file touch", { touchedFiles: ["/tmp/touched"] }],
    ["assistant output", { assistantOutputObserved: true }],
    ["a later activation", { parentJobId: "job-prior-turn" }],
  ]) {
    it(`fails closed after credential rotation when the failed turn records ${label}`, async () => {
      const { runtime, claudeConfigDir, agent } = establishAuthFailure({
        ...evidence,
        taskName: `unsafe_${label.replaceAll(" ", "_")}`,
      });
      writeCredential(claudeConfigDir, Date.now() + 3_600_000);
      await assert.rejects(
        runtime.followupTask({ target: agent.agentId, message: "must not replay" }),
        /reason=auth_required, scope=harness, retry=operator_required/,
      );
      assert.equal(runtime.store.listMessages(agent.agentId)[0].state, "acknowledged");
    });
  }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import { resolveCompletionInboxFile } from "../../runtime/completion-inbox.mjs";
import { createInternalClaudeRuntime } from "../../runtime/internal-runtime.mjs";
import {
  cleanupOldJobs,
  readJobFile,
  resolveJobFile,
  writeJobFile,
} from "../../runtime/job-store.mjs";

const sourceRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const originalRuntimeHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
let fixture;

before(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-root-isolation-"));
  const codexHome = path.join(root, ".codex");
  const runtimeHome = path.join(root, "runtime-home");
  const claudeConfigDir = path.join(root, ".claude");
  fs.mkdirSync(codexHome);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(path.join(codexHome, ".env"), [
    `CLAUDE_CONFIG_DIR=${claudeConfigDir}`,
    `CC_RUNTIME_CHECKOUT=${sourceRoot}`,
    "",
  ].join("\n"));
  process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = runtimeHome;
  fixture = { root, codexHome, runtimeHome, claudeConfigDir };
});

after(() => {
  if (originalRuntimeHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = originalRuntimeHome;
  if (fixture) fs.rmSync(fixture.root, { recursive: true, force: true });
  fixture = null;
});

function setup(label) {
  assert.ok(fixture);
  const { codexHome, runtimeHome, claudeConfigDir } = fixture;
  const workspace = path.join(fixture.root, `workspace-${label}`);
  fs.mkdirSync(workspace);

  const envFor = (ownerRootId) => {
    // A CC-bootstrapped parent exports its own trusted root and native config
    // dir ambiently. Strip them so the fixture's explicit CODEX_THREAD_ID and
    // claudeConfigDir govern isolation the same way inside and outside CC.
    const inheritedEnv = { ...process.env };
    delete inheritedEnv.CC_TRUSTED_OWNER_ROOT_ID;
    delete inheritedEnv.CLAUDE_NATIVE_CONFIG_DIR;
    return {
      ...inheritedEnv,
      CODEX_HOME: codexHome,
      CODEX_THREAD_ID: ownerRootId,
      CODEX_HARNESSDOCK_RUNTIME_HOME: runtimeHome,
    };
  };
  const ownerA = `root-${label}-a`;
  const ownerB = `root-${label}-b`;
  return {
    workspace,
    runtimeHome,
    claudeConfigDir,
    ownerA,
    ownerB,
    runtimeA: createAgentRuntime({ cwd: workspace, env: envFor(ownerA) }),
    runtimeB: createAgentRuntime({ cwd: workspace, env: envFor(ownerB) }),
    internalA: createInternalClaudeRuntime({ cwd: workspace, env: envFor(ownerA) }),
  };
}

function terminalJob({ workspace, ownerRootId, agentId, id, sessionId, overrides = {} }) {
  const timestamp = "2026-07-25T00:00:00.000Z";
  return {
    id,
    workspaceRoot: workspace,
    ownerRootId,
    agentId,
    claudeConfigDir: overrides.claudeConfigDir,
    status: "completed",
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    summary: `summary ${id}`,
    rendered: `result ${id}`,
    threadId: sessionId,
    recoverability: {
      resumable: true,
      mode: "exact_session",
      exactSessionId: sessionId,
      reason: "completed_exact_session",
    },
    ...overrides,
  };
}

function snapshotFiles(root) {
  if (!fs.existsSync(root)) return {};
  const files = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files[path.relative(root, absolute)] = fs.readFileSync(absolute, "utf8");
    }
  };
  visit(root);
  return files;
}

function writeOldJob(workspace, job) {
  fs.writeFileSync(resolveJobFile(workspace, job.id), `${JSON.stringify(job)}\n`);
}

describe("owner-scoped Agent reconciliation", () => {
  it("keeps foreign terminal state byte-stable across list, wait, and status until its owner repairs it", async () => {
    const {
      workspace,
      runtimeHome,
      claudeConfigDir,
      ownerA,
      ownerB,
      runtimeA,
      runtimeB,
      internalA,
    } = setup("terminal");
    assert.deepEqual(runtimeA.listAgents(), { agents: [] });
    assert.equal((await runtimeA.waitAgent({ timeout_ms: 0 })).timedOut, true);
    assert.deepEqual(internalA.status().active, []);
    const foreign = runtimeB.store.createAgent({
      task_name: "foreign_terminal",
      selectedModel: "claude-sonnet-5",
    });
    const jobId = "cc-agent-foreign-terminal";
    runtimeB.store.reserveActivation(foreign.agentId, jobId, { initial: true });
    writeJobFile(workspace, jobId, terminalJob({
      workspace,
      ownerRootId: ownerB,
      agentId: foreign.agentId,
      id: jobId,
      sessionId: "foreign-claude-session",
      overrides: { claudeConfigDir },
    }));

    const before = snapshotFiles(runtimeHome);
    assert.deepEqual(runtimeA.listAgents(), { agents: [] });
    assert.deepEqual(await runtimeA.waitAgent({ timeout_ms: 0 }), {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
    const status = internalA.status();
    assert.equal(status.workspaceRoot, workspace);
    assert.deepEqual(status.active, []);
    assert.deepEqual(status.recent, []);
    assert.deepEqual(status.unreadCompletions.events, []);
    assert.deepEqual(snapshotFiles(runtimeHome), before);
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), false);
    assert.equal(runtimeB.store.readAgent(foreign.agentId)?.claudeSessionId, null);
    assert.equal(readJobFile(workspace, jobId)?.agentProjectionReconciledAt, undefined);

    const observed = runtimeB.listAgents().agents[0];
    assert.equal(observed.agent_status, "completed");
    assert.equal(runtimeB.store.readAgent(foreign.agentId)?.claudeSessionId, null);
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), false);
    assert.equal(readJobFile(workspace, jobId)?.agentProjectionReconciledAt, undefined);

    const repaired = await runtimeB.waitAgent({ timeout_ms: 0 });
    assert.equal(repaired.update?.agent_status, "completed");
    assert.equal(runtimeB.store.readAgent(foreign.agentId)?.claudeSessionId, "foreign-claude-session");
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), true);
    assert.ok(readJobFile(workspace, jobId)?.agentProjectionReconciledAt);
    assert.equal(runtimeA.ownerRootId, ownerA);
  });

  it("does not reap a stale job through list but lets the owning wait path reap it", async () => {
    const { workspace, ownerB, runtimeA, runtimeB } = setup("stale");
    const old = "2026-07-25T00:00:00.000Z";
    const jobId = "cc-agent-foreign-stale";
    writeJobFile(workspace, jobId, {
      id: jobId,
      workspaceRoot: workspace,
      ownerRootId: ownerB,
      status: "queued",
      createdAt: old,
    });
    writeOldJob(workspace, {
      ...readJobFile(workspace, jobId),
      updatedAt: old,
    });

    runtimeA.listAgents();
    assert.equal(readJobFile(workspace, jobId)?.status, "queued");
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), false);

    runtimeB.listAgents();
    assert.equal(readJobFile(workspace, jobId)?.status, "queued");
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), false);

    await runtimeB.waitAgent({ timeout_ms: 0 });
    const reaped = readJobFile(workspace, jobId);
    assert.equal(reaped?.status, "failed");
    assert.match(reaped?.errorMessage ?? "", /Auto-reaped/);
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), true);
  });

  it("observes legacy owners without mutation and migrates only on an owning wait", async () => {
    const { workspace, ownerA, ownerB, runtimeA } = setup("legacy");
    const local = runtimeA.store.createAgent({
      task_name: "local_legacy",
      selectedModel: "claude-sonnet-5",
    });
    runtimeA.store.reserveActivation(local.agentId, "cc-agent-local-legacy", { initial: true });
    const localJob = terminalJob({
      workspace,
      ownerRootId: undefined,
      agentId: local.agentId,
      id: "cc-agent-local-legacy",
      sessionId: "local-claude-session",
      overrides: { sessionId: ownerA },
    });
    delete localJob.ownerRootId;
    writeJobFile(workspace, localJob.id, localJob);

    const foreignLegacy = terminalJob({
      workspace,
      ownerRootId: undefined,
      agentId: "foreign-agent",
      id: "cc-agent-foreign-legacy",
      sessionId: "foreign-claude-session",
      overrides: { sessionId: ownerB },
    });
    delete foreignLegacy.ownerRootId;
    writeJobFile(workspace, foreignLegacy.id, foreignLegacy);

    const explicitForeign = terminalJob({
      workspace,
      ownerRootId: ownerB,
      agentId: "foreign-explicit-agent",
      id: "cc-agent-explicit-foreign",
      sessionId: "explicit-foreign-claude-session",
      overrides: { sessionId: ownerA },
    });
    writeJobFile(workspace, explicitForeign.id, explicitForeign);
    const foreignLegacyBefore = readJobFile(workspace, foreignLegacy.id);
    const explicitForeignBefore = readJobFile(workspace, explicitForeign.id);

    const listed = runtimeA.listAgents().agents;
    assert.equal(listed[0]?.agent_status, "completed");
    assert.equal(readJobFile(workspace, localJob.id)?.ownerRootId, undefined);
    assert.deepEqual(readJobFile(workspace, foreignLegacy.id), foreignLegacyBefore);
    assert.deepEqual(readJobFile(workspace, explicitForeign.id), explicitForeignBefore);

    await runtimeA.waitAgent({ timeout_ms: 0 });
    assert.equal(readJobFile(workspace, localJob.id)?.ownerRootId, ownerA);
    assert.equal(readJobFile(workspace, localJob.id)?.sessionId, ownerA);
    assert.deepEqual(readJobFile(workspace, foreignLegacy.id), foreignLegacyBefore);
    assert.deepEqual(readJobFile(workspace, explicitForeign.id), explicitForeignBefore);
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), false);
  });

  it("keeps explicit worker cleanup global across owner roots", () => {
    const { workspace, ownerA, ownerB } = setup("global-cleanup");
    const old = "2026-07-25T00:00:00.000Z";
    for (const [jobId, ownerRootId] of [
      ["cc-agent-global-a", ownerA],
      ["cc-agent-global-b", ownerB],
    ]) {
      writeJobFile(workspace, jobId, {
        id: jobId,
        workspaceRoot: workspace,
        ownerRootId,
        status: "queued",
        createdAt: old,
      });
      writeOldJob(workspace, { ...readJobFile(workspace, jobId), updatedAt: old });
    }

    cleanupOldJobs(workspace);

    assert.equal(readJobFile(workspace, "cc-agent-global-a")?.status, "failed");
    assert.equal(readJobFile(workspace, "cc-agent-global-b")?.status, "failed");
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerA)), true);
    assert.equal(fs.existsSync(resolveCompletionInboxFile(workspace, ownerB)), true);
  });
});

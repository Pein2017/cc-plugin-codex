import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import {
  acknowledgeAgentCompletionEvents,
  readUnreadAgentCompletionSummaries,
  reconcileTerminalJobCompletion,
  resolveCompletionInboxFile,
} from "../../runtime/completion-inbox.mjs";
import { readJobFile, writeJobFile } from "../../runtime/job-store.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-wait-persistence-"));
const codexHome = path.join(root, ".codex");
const runtimeHome = path.join(root, "runtime-home");
fs.mkdirSync(codexHome);

after(() => fs.rmSync(root, { recursive: true, force: true }));

async function observePersistenceIo(operation) {
  const names = [
    "writeFileSync",
    "appendFileSync",
    "renameSync",
    "linkSync",
    "unlinkSync",
    "mkdirSync",
    "chmodSync",
    "fsyncSync",
  ];
  const originals = new Map();
  const counts = Object.fromEntries(names.map((name) => [name, 0]));
  for (const name of names) {
    originals.set(name, fs[name]);
    fs[name] = (...args) => {
      counts[name] += 1;
      return originals.get(name)(...args);
    };
  }
  try {
    return { counts, result: await operation() };
  } finally {
    for (const name of names) fs[name] = originals.get(name);
  }
}

function setup(label) {
  const fixtureRoot = path.join(root, label);
  const workspace = path.join(fixtureRoot, "workspace");
  const claudeConfigDir = path.join(fixtureRoot, ".claude");
  const ownerRootId = `root-agent-wait-persistence-${label}`;
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(claudeConfigDir);
  const runtime = createAgentRuntime({
    cwd: workspace,
    env: {
      CODEX_HOME: codexHome,
      CODEX_THREAD_ID: ownerRootId,
      CODEX_HARNESSDOCK_RUNTIME_HOME: runtimeHome,
      CC_RUNTIME_CHECKOUT: "",
      CC_RUNTIME_SOURCE_ROOT: "",
      CLAUDE_CONFIG_DIR: claudeConfigDir,
    },
  });
  return { runtime, workspace, ownerRootId };
}

function terminalJob(workspace, ownerRootId, agentId, id, overrides = {}) {
  return {
    id,
    ownerRootId,
    agentId,
    workspaceRoot: workspace,
    status: "completed",
    createdAt: "2026-07-26T00:00:00.000Z",
    completedAt: "2026-07-26T00:00:00.000Z",
    completionSummary: `settled completion ${id}`,
    result: { status: "completed", rawOutput: `settled result ${id}`, resumable: false },
    recoverability: { resumable: false, reason: "test_terminal" },
    ...overrides,
  };
}

const zeroPersistenceIo = {
  writeFileSync: 0,
  appendFileSync: 0,
  renameSync: 0,
  linkSync: 0,
  unlinkSync: 0,
  mkdirSync: 0,
  chmodSync: 0,
  fsyncSync: 0,
};

const jobStoreUrl = new URL("../../runtime/job-store.mjs", import.meta.url).href;

function startProjectionRepairWorker(workspace, jobId, barrierFile, readyFile) {
  const source = [
    'import fs from "node:fs";',
    `import { markAgentProjectionReconciled } from ${JSON.stringify(jobStoreUrl)};`,
    "const [workspace, jobId, barrierFile, readyFile] = process.argv.slice(1);",
    'fs.writeFileSync(readyFile, "ready", "utf8");',
    "while (!fs.existsSync(barrierFile)) {",
    "  await new Promise((resolve) => setTimeout(resolve, 2));",
    "}",
    "const result = markAgentProjectionReconciled(workspace, jobId);",
    "process.stdout.write(JSON.stringify({ updated: result.updated }));",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--input-type=module",
      "-e",
      source,
      workspace,
      jobId,
      barrierFile,
      readyFile,
    ], {
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        CODEX_HARNESSDOCK_RUNTIME_HOME: runtimeHome,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `projection repair worker exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function waitForFiles(filePaths) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (filePaths.every((filePath) => fs.existsSync(filePath))) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("Projection repair workers did not reach the synchronization barrier.");
}

describe("Agent wait persistence", () => {
  it("reconciles an identical unfrozen completion without persistence mutation", async () => {
    const { workspace, ownerRootId } = setup("identical-unfrozen");
    const job = terminalJob(
      workspace,
      ownerRootId,
      "agent-identical-unfrozen",
      "cc-identical-unfrozen"
    );
    reconcileTerminalJobCompletion(workspace, ownerRootId, job);
    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const before = fs.readFileSync(inboxFile, "utf8");

    const observed = await observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, job)
    );

    assert.equal(observed.result.reconciled, false);
    assert.equal(observed.result.reason, "already-present");
    assert.deepEqual(observed.counts, zeroPersistenceIo);
    assert.equal(fs.readFileSync(inboxFile, "utf8"), before);
  });

  it("retains durable append and mutable-correction paths", async () => {
    const { workspace, ownerRootId } = setup("durable-repairs");
    const job = terminalJob(
      workspace,
      ownerRootId,
      "agent-durable-repairs",
      "cc-durable-repairs"
    );

    const appended = await observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, job)
    );
    assert.equal(appended.result.reconciled, true);
    assert.equal(appended.result.reason, "appended");
    assert.equal(appended.counts.renameSync, 1);
    assert.ok(appended.counts.linkSync > 0);
    assert.ok(appended.counts.fsyncSync > 0);

    const corrected = await observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, {
        ...job,
        completionSummary: "corrected completion fact",
        result: { ...job.result, rawOutput: "corrected result" },
      })
    );
    assert.equal(corrected.result.reconciled, true);
    assert.equal(corrected.result.reason, "corrected_unacknowledged_event");
    assert.equal(corrected.counts.renameSync, 1);
    assert.ok(corrected.counts.linkSync > 0);
    assert.ok(corrected.counts.fsyncSync > 0);
  });

  it("lists a settled Agent with an identical unread completion without persistence mutation", async () => {
    const { runtime, workspace, ownerRootId } = setup("list-unread-agent");
    const created = runtime.store.createAgent({
      task_name: "list_unread_agent",
      selectedModel: "claude-haiku-4-5",
    });
    runtime.store.updateAgent(created.agentId, (agent) => ({
      ...agent,
      status: "completed",
      latestJobId: "cc-list-unread-agent",
      lastTerminalJobId: "cc-list-unread-agent",
      finalizedJobIds: ["cc-list-unread-agent"],
    }));
    const job = terminalJob(
      workspace,
      ownerRootId,
      created.agentId,
      "cc-list-unread-agent",
      { agentProjectionReconciledAt: "2026-07-26T00:00:01.000Z" }
    );
    writeJobFile(workspace, job.id, job);
    reconcileTerminalJobCompletion(workspace, ownerRootId, job);
    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const before = fs.readFileSync(inboxFile, "utf8");

    const observed = await observePersistenceIo(() => runtime.listAgents());

    assert.deepEqual(observed.result, {
      agents: [{
        agent_name: created.path,
        agent_status: "completed",
        model: "claude-haiku-4-5",
        reasoning_effort: null,
        authority: "unknown",
        delegation_mode: "leaf",
        phase: null,
        started_at: null,
        last_activity_at: null,
        elapsed_seconds: null,
      }],
    });
    assert.deepEqual(observed.counts, zeroPersistenceIo);
    assert.equal(fs.readFileSync(inboxFile, "utf8"), before);
  });

  it("observes an active assigned mailbox without dispatching or acknowledging it", async () => {
    const { runtime, workspace, ownerRootId } = setup("list-assigned-mailbox");
    const created = runtime.store.createAgent({
      task_name: "list_assigned_mailbox",
      selectedModel: "claude-sonnet-5",
    });
    const jobId = "cc-list-assigned-mailbox";
    runtime.store.reserveActivation(created.agentId, jobId, { initial: true });
    const assigned = runtime.store.enqueueMessage(created.agentId, "remain assigned", {
      kind: "send_message",
    });
    writeJobFile(workspace, jobId, {
      id: jobId,
      ownerRootId,
      agentId: created.agentId,
      workspaceRoot: workspace,
      status: "running",
      startedAt: "2026-07-26T00:00:00.000Z",
      request: { model: "claude-sonnet-5", effort: "high", write: false },
    });

    const observed = await observePersistenceIo(() => runtime.listAgents());

    assert.equal(observed.result.agents[0].agent_status, "working");
    assert.deepEqual(observed.counts, zeroPersistenceIo);
    assert.deepEqual(runtime.store.listMessages(created.agentId).map((message) => ({
      messageId: message.messageId,
      state: message.state,
      assignedJobId: message.assignedJobId,
      dispatchedAt: message.dispatchedAt,
      acknowledgedAt: message.acknowledgedAt,
    })), [{
      messageId: assigned.message.messageId,
      state: "assigned",
      assignedJobId: jobId,
      dispatchedAt: null,
      acknowledgedAt: null,
    }]);
  });

  it("lists across identical quarantined legacy completion evidence without persistence mutation", async () => {
    const { runtime, workspace, ownerRootId } = setup("list-legacy");
    const job = terminalJob(
      workspace,
      ownerRootId,
      null,
      "cc-list-legacy"
    );
    writeJobFile(workspace, job.id, job);
    reconcileTerminalJobCompletion(workspace, ownerRootId, job);
    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const before = fs.readFileSync(inboxFile, "utf8");

    const observed = await observePersistenceIo(() => runtime.listAgents());

    assert.deepEqual(observed.result, { agents: [] });
    assert.deepEqual(observed.counts, zeroPersistenceIo);
    assert.equal(fs.readFileSync(inboxFile, "utf8"), before);
  });

  it("performs no persistence mutation for a fully settled terminal Agent", async () => {
    const { runtime, workspace, ownerRootId } = setup("settled");
    const created = runtime.store.createAgent({
      task_name: "settled_terminal",
      selectedModel: "claude-haiku-4-5",
    });
    runtime.store.updateAgent(created.agentId, (agent) => ({
      ...agent,
      status: "completed",
      latestJobId: "cc-settled-terminal",
      lastTerminalJobId: "cc-settled-terminal",
      finalizedJobIds: ["cc-settled-terminal"],
    }));
    const job = terminalJob(
      workspace,
      ownerRootId,
      created.agentId,
      "cc-settled-terminal",
      {
      agentProjectionReconciledAt: "2026-07-26T00:00:01.000Z",
      }
    );
    writeJobFile(workspace, job.id, job);
    const completion = reconcileTerminalJobCompletion(workspace, ownerRootId, job).event;
    readUnreadAgentCompletionSummaries(workspace, ownerRootId);
    acknowledgeAgentCompletionEvents(workspace, ownerRootId, [completion.deliveryToken]);

    const observed = await observePersistenceIo(
      () => runtime.waitAgent({ timeout_ms: 600 })
    );

    assert.deepEqual(observed.result, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
    assert.deepEqual(observed.counts, zeroPersistenceIo);
  });

  it("performs no persistence mutation on the additional final-observation read for a settled timeout", async () => {
    const { runtime, workspace, ownerRootId } = setup("settled-final-observation");
    const created = runtime.store.createAgent({
      task_name: "settled_final_observation",
      selectedModel: "claude-haiku-4-5",
    });
    runtime.store.updateAgent(created.agentId, (agent) => ({
      ...agent,
      status: "completed",
      latestJobId: "cc-settled-final-observation",
      lastTerminalJobId: "cc-settled-final-observation",
      finalizedJobIds: ["cc-settled-final-observation"],
    }));
    const job = terminalJob(
      workspace,
      ownerRootId,
      created.agentId,
      "cc-settled-final-observation",
      { agentProjectionReconciledAt: "2026-07-26T00:00:01.000Z" }
    );
    writeJobFile(workspace, job.id, job);
    const completion = reconcileTerminalJobCompletion(workspace, ownerRootId, job).event;
    readUnreadAgentCompletionSummaries(workspace, ownerRootId);
    acknowledgeAgentCompletionEvents(workspace, ownerRootId, [completion.deliveryToken]);

    // Confirm the additional zero-time completion-only read this change adds
    // actually runs, and that it alone still costs no inbox lock, fsync, or
    // durable write.
    const originalWait = runtime.jobs.wait.bind(runtime.jobs);
    let waitCalls = 0;
    runtime.jobs.wait = (jobId, options) => {
      waitCalls += 1;
      return originalWait(jobId, options);
    };

    const observed = await observePersistenceIo(
      () => runtime.waitAgent({ timeout_ms: 0 })
    );

    assert.equal(waitCalls, 2);
    assert.deepEqual(observed.result, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
    assert.deepEqual(observed.counts, zeroPersistenceIo);
  });

  it("repairs a crash-window projection marker before returning to zero-write waits", async () => {
    const { runtime, workspace, ownerRootId } = setup("marker-repair");
    const created = runtime.store.createAgent({
      task_name: "marker_repair",
      selectedModel: "claude-haiku-4-5",
    });
    const oldJobId = "cc-marker-repair-oldest";
    runtime.store.updateAgent(created.agentId, (agent) => ({
      ...agent,
      status: "completed",
      latestJobId: oldJobId,
      lastTerminalJobId: oldJobId,
      finalizedJobIds: [oldJobId],
    }));
    const oldJob = terminalJob(workspace, ownerRootId, created.agentId, oldJobId);
    writeJobFile(workspace, oldJob.id, oldJob);
    const oldCompletion = reconcileTerminalJobCompletion(
      workspace,
      ownerRootId,
      oldJob
    ).event;
    readUnreadAgentCompletionSummaries(workspace, ownerRootId);
    acknowledgeAgentCompletionEvents(workspace, ownerRootId, [oldCompletion.deliveryToken]);

    const repaired = await observePersistenceIo(
      () => runtime.waitAgent({ timeout_ms: 0 })
    );
    assert.equal(repaired.counts.renameSync, 1);
    assert.ok(repaired.counts.linkSync > 0);
    assert.ok(readJobFile(workspace, oldJobId)?.agentProjectionReconciledAt);

    const settled = await observePersistenceIo(
      () => runtime.waitAgent({ timeout_ms: 0 })
    );
    assert.deepEqual(settled.counts, zeroPersistenceIo);
  });

  it("serializes concurrent crash-window marker repair to one durable rewrite", async () => {
    const { workspace, ownerRootId } = setup("marker-repair-race");
    const jobId = "cc-marker-repair-race";
    writeJobFile(workspace, jobId, terminalJob(
      workspace,
      ownerRootId,
      "agent-marker-repair-race",
      jobId
    ));
    const barrierFile = path.join(root, "marker-repair-race.go");
    const readyFiles = [
      path.join(root, "marker-repair-race-1.ready"),
      path.join(root, "marker-repair-race-2.ready"),
    ];
    const workers = readyFiles.map((readyFile) =>
      startProjectionRepairWorker(workspace, jobId, barrierFile, readyFile)
    );
    await waitForFiles(readyFiles);
    fs.writeFileSync(barrierFile, "go", "utf8");
    const results = await Promise.all(workers);

    assert.equal(results.filter((result) => result.updated).length, 1);
    assert.ok(readJobFile(workspace, jobId)?.agentProjectionReconciledAt);
  });
});

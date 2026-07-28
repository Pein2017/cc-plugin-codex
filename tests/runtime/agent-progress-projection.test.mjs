import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import { appendCompletionEvent } from "../../runtime/completion-inbox.mjs";
import { readJobFile, writeJobFile } from "../../runtime/job-store.mjs";
import { getProcessIdentity } from "../../runtime/process-control.mjs";

const roots = [];
const sharedRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-progress-runtime-"));
const sharedCodexHome = path.join(sharedRuntimeRoot, ".codex");
const sharedRuntimeHome = path.join(sharedRuntimeRoot, "runtime-home");
fs.mkdirSync(sharedCodexHome);

after(() => fs.rmSync(sharedRuntimeRoot, { recursive: true, force: true }));

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-progress-projection-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, ".claude");
  const codexHome = sharedCodexHome;
  const envFile = path.join(root, "runtime.env");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  roots.push(root);
  const ownerRootId = "root-agent-progress-projection";
  const runtime = createAgentRuntime({
    cwd: workspace,
    envFile,
    env: {
      CODEX_HOME: codexHome,
      CODEX_THREAD_ID: ownerRootId,
      CC_RUNTIME_HOME: sharedRuntimeHome,
      CC_RUNTIME_CHECKOUT: "",
      CC_RUNTIME_SOURCE_ROOT: "",
      CLAUDE_CONFIG_DIR: claudeConfigDir,
    },
    abortSignal: options.abortSignal,
  });
  const agent = runtime.store.createAgent({
    task_name: "progress",
    selectedModel: "claude-sonnet-5",
  });
  runtime.store.updateAgent(agent.agentId, (current) => ({
    ...current,
    status: "running",
    activeJobId: "cc-progress",
    latestJobId: "cc-progress",
  }));
  writeJobFile(workspace, "cc-progress", {
    id: "cc-progress",
    ownerRootId,
    agentId: agent.agentId,
    workspaceRoot: workspace,
    status: "running",
    workerPid: process.pid,
    workerPidIdentity: getProcessIdentity(process.pid),
    phase: "tool",
    publicProgressDeliveredRevision: 0,
    publicProgress: {
      revision: 3,
      activity: "tool",
      phase: "tool",
      summary: "Claude is using Read.",
      updatedAt: "2026-07-26T00:00:03.000Z",
    },
  });
  return { runtime, workspace, ownerRootId, agent };
}

describe("Agent progress projection", () => {
  it("delivers one safe progress revision and suppresses normal repeats", async () => {
    const { runtime, workspace, agent } = setup();
    writeJobFile(workspace, "cc-foreign", {
      id: "cc-foreign",
      ownerRootId: "another-root",
      agentId: "foreign-agent",
      workspaceRoot: workspace,
      status: "running",
      publicProgressDeliveredRevision: 0,
      publicProgress: {
        revision: 9,
        activity: "tool",
        phase: "tool",
        summary: "Claude is using SecretForeignTool.",
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
    });

    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0 }), {
      message: "CC Agent progress is available.",
      timedOut: false,
      update: {
        kind: "progress",
        agent_name: agent.path,
        agent_status: "running",
        progress: {
          revision: 3,
          activity: "tool",
          phase: "tool",
          summary: "Claude is using Read.",
          updated_at: "2026-07-26T00:00:03.000Z",
        },
      },
    });
    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0 }), {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
  });

  it("adaptively backs off routine progress while urgent phase changes reset delivery", async () => {
    const { runtime, workspace } = setup();
    assert.equal((await runtime.waitAgent({ timeout_ms: 0 })).update.progress.revision, 3);
    let job = readJobFile(workspace, "cc-progress");
    assert.equal(job.publicProgressDeliveryIntervalMs, 5_000);

    writeJobFile(workspace, "cc-progress", {
      ...job,
      publicProgress: {
        revision: 4,
        activity: "hook",
        phase: "hook",
        summary: "Claude completed a hook.",
        updatedAt: "2026-07-26T00:00:04.000Z",
      },
    });
    assert.equal((await runtime.waitAgent({ timeout_ms: 0 })).timedOut, true);

    job = readJobFile(workspace, "cc-progress");
    writeJobFile(workspace, "cc-progress", {
      ...job,
      publicProgressNextDeliveryAt: new Date(Date.now() - 1).toISOString(),
    });
    assert.equal((await runtime.waitAgent({ timeout_ms: 0 })).update.progress.revision, 4);
    job = readJobFile(workspace, "cc-progress");
    assert.equal(job.publicProgressDeliveryIntervalMs, 10_000);

    writeJobFile(workspace, "cc-progress", {
      ...job,
      publicProgress: {
        revision: 5,
        activity: "retrying",
        phase: "retry",
        summary: "Claude is retrying an API request.",
        updatedAt: "2026-07-26T00:00:05.000Z",
      },
    });
    const urgent = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(urgent.update.progress.activity, "retrying");
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveryIntervalMs, 5_000);
  });

  it("caps public Agent wait at one hour", async () => {
    const { runtime } = setup();
    await assert.rejects(
      runtime.waitAgent({ timeout_ms: 3_600_001 }),
      /between 0 and 3600000/
    );
  });

  it("cancels only the current wait observation", async () => {
    const controller = new AbortController();
    const { runtime, workspace, agent } = setup({ abortSignal: controller.signal });
    assert.equal((await runtime.waitAgent({ timeout_ms: 0 })).update.kind, "progress");
    const waiting = runtime.waitAgent({ timeout_ms: 60_000 });
    controller.abort();
    await assert.rejects(waiting, (error) => error?.name === "AbortError");
    assert.equal(runtime.store.resolveTarget(agent.agentId).status, "running");
    assert.equal(readJobFile(workspace, "cc-progress").status, "running");
  });

  it("prioritizes a durable completion over pending progress", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();
    assert.equal((await runtime.waitAgent({ timeout_ms: 0 })).update.kind, "progress");
    writeJobFile(workspace, "cc-progress", {
      ...readJobFile(workspace, "cc-progress"),
      publicProgress: {
        revision: 4,
        activity: "hook",
        phase: "hook",
        summary: "Claude completed a hook.",
        updatedAt: "2026-07-26T00:00:04.000Z",
      },
    });
    runtime.store.updateAgent(agent.agentId, (current) => ({
      ...current,
      status: "completed",
      activeJobId: null,
    }));
    appendCompletionEvent(workspace, ownerRootId, {
      jobId: "cc-progress",
      agentId: agent.agentId,
      terminalStatus: "completed",
      completedAt: "2026-07-26T00:00:04.000Z",
      summary: "done",
      finalMessage: "authoritative completion",
      resumability: { classification: "resumable", claudeSessionId: "session-progress" },
      detailedResultAvailable: true,
      resultPointer: "cc-progress",
    });

    const waited = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(waited.update.kind, "completion");
    assert.equal(waited.update.completion_message, "authoritative completion");
  });

  it("atomically claims one progress revision across concurrent waits", async () => {
    const { runtime, workspace } = setup();
    const waits = await Promise.all([
      runtime.waitAgent({ timeout_ms: 0 }),
      runtime.waitAgent({ timeout_ms: 0 }),
    ]);
    assert.equal(waits.filter((receipt) => receipt.update?.kind === "progress").length, 1);
    assert.equal(waits.filter((receipt) => receipt.timedOut).length, 1);
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 3);
  });

  it("refreshes active Agent turns while a root-wide wait is blocked", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    writeJobFile(workspace, "cc-progress", {
      ...readJobFile(workspace, "cc-progress"),
      publicProgressDeliveredRevision: 3,
    });
    const waiting = runtime.waitAgent({ timeout_ms: 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 75));
    const lateAgent = runtime.store.createAgent({
      task_name: "late_progress",
      selectedModel: "claude-sonnet-5",
    });
    runtime.store.updateAgent(lateAgent.agentId, (current) => ({
      ...current,
      status: "running",
      activeJobId: "cc-late-progress",
      latestJobId: "cc-late-progress",
    }));
    writeJobFile(workspace, "cc-late-progress", {
      id: "cc-late-progress",
      ownerRootId,
      agentId: lateAgent.agentId,
      workspaceRoot: workspace,
      status: "running",
      workerPid: process.pid,
      workerPidIdentity: getProcessIdentity(process.pid),
      phase: "responding",
      publicProgressDeliveredRevision: 0,
      publicProgress: {
        revision: 1,
        activity: "responding",
        phase: "responding",
        summary: "Claude is preparing a response.",
        updatedAt: "2026-07-26T00:00:04.000Z",
      },
    });

    const receipt = await waiting;
    assert.equal(receipt.update?.kind, "progress");
    assert.equal(receipt.update.agent_name, lateAgent.path);
    assert.equal(receipt.update.progress.revision, 1);
  });

  it("lets concurrent waits claim different pending Agent progress", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const second = runtime.store.createAgent({
      task_name: "second_progress",
      selectedModel: "claude-sonnet-5",
    });
    runtime.store.updateAgent(second.agentId, (current) => ({
      ...current,
      status: "running",
      activeJobId: "cc-second-progress",
      latestJobId: "cc-second-progress",
    }));
    writeJobFile(workspace, "cc-second-progress", {
      id: "cc-second-progress",
      ownerRootId,
      agentId: second.agentId,
      workspaceRoot: workspace,
      status: "running",
      workerPid: process.pid,
      workerPidIdentity: getProcessIdentity(process.pid),
      phase: "responding",
      publicProgressDeliveredRevision: 0,
      publicProgress: {
        revision: 2,
        activity: "responding",
        phase: "responding",
        summary: "Claude is preparing a response.",
        updatedAt: "2026-07-26T00:00:04.000Z",
      },
    });

    const receipts = await Promise.all([
      runtime.waitAgent({ timeout_ms: 1_000 }),
      runtime.waitAgent({ timeout_ms: 1_000 }),
    ]);
    assert.equal(receipts.filter((receipt) => receipt.update?.kind === "progress").length, 2);
    assert.deepEqual(
      new Set(receipts.map((receipt) => receipt.update.agent_name)),
      new Set([runtime.store.resolveTarget("progress").path, second.path])
    );
  });
});

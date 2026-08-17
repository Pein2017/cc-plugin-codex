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
      CODEX_HARNESSDOCK_RUNTIME_HOME: sharedRuntimeHome,
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
  it("lists a safe Agent Card without claiming progress or completion delivery", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();
    const first = runtime.listAgents();
    const second = runtime.listAgents();
    assert.deepEqual(first, second);
    assert.deepEqual(first.agents[0], {
      agent_name: agent.path,
      harness: "claude-code",
      route_maturity: null,
      model: "claude-sonnet-5",
      reasoning_effort: null,
      authority: "unknown",
      delegation_mode: "leaf",
      phase: "tool",
      started_at: null,
      last_activity_at: "2026-07-26T00:00:03.000Z",
      elapsed_seconds: null,
      agent_status: "working",
    });
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 0);
    appendCompletionEvent(workspace, ownerRootId, {
      jobId: "cc-card-completion",
      agentId: agent.agentId,
      terminalStatus: "completed",
      completedAt: "2026-07-26T00:00:04.000Z",
      summary: "done",
      finalMessage: "completion remains unread",
      resumability: { classification: "resumable", claudeSessionId: "session-card" },
      detailedResultAvailable: true,
      resultPointer: "cc-card-completion",
    });
    runtime.listAgents();
    assert.equal((await runtime.waitAgent({ timeout_ms: 0 })).update?.kind, "completion");
  });

  it("keeps mismatched and foreign-owner retained job evidence out of Agent Cards", () => {
    const { runtime, workspace, agent } = setup();
    const poisonJob = (overrides) => ({
      id: "cc-progress",
      ownerRootId: "another-root",
      agentId: agent.agentId,
      workspaceRoot: workspace,
      status: "running",
      startedAt: "2026-07-26T00:00:00.000Z",
      request: { effort: "max", write: true },
      publicProgress: {
        activity: "tool",
        updatedAt: "2026-07-26T00:00:03.000Z",
      },
      ...overrides,
    });
    writeJobFile(workspace, "cc-progress", poisonJob({}));
    const foreignBefore = readJobFile(workspace, "cc-progress");
    assert.deepEqual(runtime.listAgents().agents[0], {
      agent_name: agent.path,
      harness: "claude-code",
      route_maturity: null,
      model: "claude-sonnet-5",
      reasoning_effort: null,
      authority: "unknown",
      delegation_mode: "leaf",
      phase: null,
      started_at: null,
      last_activity_at: null,
      elapsed_seconds: null,
      agent_status: "working",
    });
    assert.deepEqual(readJobFile(workspace, "cc-progress"), foreignBefore);

    writeJobFile(workspace, "cc-progress", poisonJob({
      ownerRootId: "root-agent-progress-projection",
      agentId: "different-agent",
    }));
    assert.equal(runtime.listAgents().agents[0].authority, "unknown");
    assert.equal(runtime.listAgents().agents[0].reasoning_effort, null);
    assert.equal(runtime.listAgents().agents[0].started_at, null);
  });

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
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 0);

    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true }), {
      message: "CC Agent progress is available.",
      timedOut: false,
      update: {
        kind: "progress",
        agent_name: agent.path,
        agent_status: "working",
        progress: {
          revision: 3,
          activity: "tool",
          phase: "tool",
          summary: "Claude is using Read.",
          updated_at: "2026-07-26T00:00:03.000Z",
        },
      },
    });
    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true }), {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
  });

  it("scopes targeted progress and completion observation to the snapshotted job", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();
    const other = runtime.store.createAgent({
      task_name: "unrelated_progress",
      selectedModel: "claude-sonnet-5",
    });
    runtime.store.updateAgent(other.agentId, (current) => ({
      ...current,
      status: "running",
      activeJobId: "cc-unrelated-progress",
      latestJobId: "cc-unrelated-progress",
    }));
    writeJobFile(workspace, "cc-unrelated-progress", {
      id: "cc-unrelated-progress",
      ownerRootId,
      agentId: other.agentId,
      workspaceRoot: workspace,
      status: "running",
      workerPid: process.pid,
      workerPidIdentity: getProcessIdentity(process.pid),
      publicProgressDeliveredRevision: 0,
      publicProgress: {
        revision: 1,
        activity: "responding",
        phase: "responding",
        summary: "Claude is preparing a response.",
        updatedAt: "2026-07-26T00:00:01.000Z",
      },
    });
    const unrelated = appendCompletionEvent(workspace, ownerRootId, {
      jobId: "cc-unrelated-completion",
      agentId: "unrelated-agent",
      terminalStatus: "completed",
      completedAt: "2026-07-26T00:00:02.000Z",
      summary: "unrelated completion",
      finalMessage: "unrelated completion remains unread",
      resumability: { classification: "resumable", claudeSessionId: "session-unrelated" },
      detailedResultAvailable: true,
      resultPointer: "cc-unrelated-completion",
    }).event;

    const receipt = await runtime.waitAgent({
      targets: [agent.path],
      timeout_ms: 0,
      wake_on_progress: true,
    });
    assert.equal(receipt.update?.kind, "progress");
    assert.equal(receipt.update.agent_name, agent.path);
    assert.equal(receipt.update.progress.revision, 3);
    assert.equal(readJobFile(workspace, "cc-unrelated-progress").publicProgressDeliveredRevision, 0);

    const stillUnread = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(stillUnread.update.delivery_token, unrelated.deliveryToken);
    assert.equal(stillUnread.update.completion_message, "unrelated completion remains unread");
  });

  it("uses the existing one-progress budget for a targeted observation", async () => {
    const { runtime, workspace, agent } = setup();
    const first = await runtime.waitAgent({
      targets: [agent.path],
      timeout_ms: 0,
      wake_on_progress: true,
    });
    const second = await runtime.waitAgent({
      targets: [agent.path],
      timeout_ms: 0,
      wake_on_progress: true,
    });
    assert.equal(first.update?.kind, "progress");
    assert.equal(second.timedOut, true);
    assert.equal("update" in second, false);
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 3);
  });

  it("rejects progress-enabled multi-target waits before claiming progress", async () => {
    const { runtime, workspace, agent } = setup();
    await assert.rejects(
      runtime.waitAgent({
        targets: [agent.path, "/root/another"],
        timeout_ms: 0,
        wake_on_progress: true,
      }),
      /requires exactly one target/
    );
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 0);
  });

  it("keeps hook progress private without consuming the job progress budget", async () => {
    const { runtime, workspace } = setup();
    let job = readJobFile(workspace, "cc-progress");
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
    assert.equal((await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true })).timedOut, true);
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 0);

    job = readJobFile(workspace, "cc-progress");
    writeJobFile(workspace, "cc-progress", {
      ...job,
      publicProgress: {
        revision: 5,
        activity: "tool",
        phase: "tool",
        summary: "Claude is using Read.",
        updatedAt: "2026-07-26T00:00:05.000Z",
      },
    });
    assert.equal((await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true })).update.progress.revision, 5);
  });

  it("allows no later progress phase after one delivery for the same job", async () => {
    const { runtime, workspace } = setup();
    assert.equal((await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true })).update.progress.revision, 3);
    const job = readJobFile(workspace, "cc-progress");
    writeJobFile(workspace, "cc-progress", {
      ...job,
      publicProgress: {
        revision: 4,
        activity: "retrying",
        phase: "retry",
        summary: "Claude is retrying an API request.",
        updatedAt: "2026-07-26T00:00:04.000Z",
      },
    });
    assert.equal((await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true })).timedOut, true);
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 3);
  });

  it("gives a follow-up job for the same Agent a fresh progress budget", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();
    assert.equal((await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true })).update.progress.revision, 3);
    runtime.store.updateAgent(agent.agentId, (current) => ({
      ...current,
      activeJobId: "cc-progress-followup",
      latestJobId: "cc-progress-followup",
    }));
    writeJobFile(workspace, "cc-progress-followup", {
      id: "cc-progress-followup",
      ownerRootId,
      agentId: agent.agentId,
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

    const receipt = await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true });
    assert.equal(receipt.update?.kind, "progress");
    assert.equal(receipt.update.agent_name, agent.path);
    assert.equal(receipt.update.progress.revision, 1);
  });

  it("caps public Agent wait at one hour", async () => {
    const { runtime } = setup();
    await assert.rejects(
      runtime.waitAgent({ timeout_ms: 3_600_001 }),
      /between 0 and 3600000/
    );
  });

  it("rejects a non-boolean progress wakeup before changing delivery state", async () => {
    const { runtime, workspace } = setup();
    await assert.rejects(
      runtime.waitAgent({ timeout_ms: 0, wake_on_progress: "yes" }),
      /wake_on_progress must be a boolean/
    );
    assert.equal(readJobFile(workspace, "cc-progress").publicProgressDeliveredRevision, 0);
  });

  it("cancels only the current wait observation", async () => {
    const controller = new AbortController();
    const { runtime, workspace, agent } = setup({ abortSignal: controller.signal });
    assert.equal((await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true })).update.kind, "progress");
    const waiting = runtime.waitAgent({ timeout_ms: 60_000 });
    controller.abort();
    await assert.rejects(waiting, (error) => error?.name === "AbortError");
    assert.equal(runtime.store.resolveTarget(agent.agentId).status, "running");
    assert.equal(readJobFile(workspace, "cc-progress").status, "running");
  });

  it("prioritizes a durable completion over pending progress", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();
    assert.equal((await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true })).update.kind, "progress");
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

    const startedAt = Date.now();
    const waited = await runtime.waitAgent({ timeout_ms: 3_600_000, wake_on_progress: true });
    assert.equal(waited.update.kind, "completion");
    assert.equal(waited.update.completion_message, "authoritative completion");
    assert.ok(Date.now() - startedAt < 1_000, "completion should return before the fixed upper bound");
  });

  it("atomically claims one progress revision across concurrent waits", async () => {
    const { runtime, workspace } = setup();
    const waits = await Promise.all([
      runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true }),
      runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true }),
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
    const waiting = runtime.waitAgent({ timeout_ms: 1_000, wake_on_progress: true });
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
      runtime.waitAgent({ timeout_ms: 1_000, wake_on_progress: true }),
      runtime.waitAgent({ timeout_ms: 1_000, wake_on_progress: true }),
    ]);
    assert.equal(receipts.filter((receipt) => receipt.update?.kind === "progress").length, 2);
    assert.deepEqual(
      new Set(receipts.map((receipt) => receipt.update.agent_name)),
      new Set([runtime.store.resolveTarget("progress").path, second.path])
    );
  });
});

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
const sharedRuntimeRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "cc-agent-wait-final-observation-runtime-")
);
const sharedCodexHome = path.join(sharedRuntimeRoot, ".codex");
const sharedRuntimeHome = path.join(sharedRuntimeRoot, "runtime-home");
fs.mkdirSync(sharedCodexHome);

after(() => fs.rmSync(sharedRuntimeRoot, { recursive: true, force: true }));

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-wait-final-observation-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, ".claude");
  const codexHome = sharedCodexHome;
  const envFile = path.join(root, "runtime.env");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  roots.push(root);
  const ownerRootId = "root-agent-wait-final-observation";
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
  });
  const agent = runtime.store.createAgent({
    task_name: "final_observation",
    selectedModel: "claude-sonnet-5",
  });
  runtime.store.updateAgent(agent.agentId, (current) => ({
    ...current,
    status: "running",
    activeJobId: "cc-final-observation",
    latestJobId: "cc-final-observation",
  }));
  writeJobFile(workspace, "cc-final-observation", {
    id: "cc-final-observation",
    ownerRootId,
    agentId: agent.agentId,
    workspaceRoot: workspace,
    status: "running",
    workerPid: process.pid,
    workerPidIdentity: getProcessIdentity(process.pid),
    phase: "tool",
    publicProgressDeliveredRevision: 0,
  });
  return { runtime, workspace, ownerRootId, agent };
}

function setupWithProgress() {
  const context = setup();
  writeJobFile(context.workspace, "cc-final-observation", {
    ...readJobFile(context.workspace, "cc-final-observation"),
    publicProgress: {
      revision: 3,
      activity: "tool",
      phase: "tool",
      summary: "Claude is using Read.",
      updatedAt: "2026-07-26T00:00:03.000Z",
    },
  });
  return context;
}

// Wraps the instance method so the test can inject state exactly between the
// bounded wait's exit-time reconciliation and the new final observation,
// without racing real timers.
function patchReconcileOnce(runtime, onSecondCall) {
  const original = runtime.reconcile.bind(runtime);
  let calls = 0;
  runtime.reconcile = (...args) => {
    calls += 1;
    if (calls === 2) onSecondCall();
    return original(...args);
  };
}

function spyOnJobsWait(runtime) {
  const original = runtime.jobs.wait.bind(runtime.jobs);
  const calls = [];
  runtime.jobs.wait = (jobId, options) => {
    calls.push(options);
    return original(jobId, options);
  };
  return calls;
}

function terminalJobFrom(job, overrides = {}) {
  return {
    ...job,
    status: "completed",
    completedAt: "2026-07-26T00:00:05.000Z",
    completionSummary: "final observation completion",
    result: {
      status: "completed",
      rawOutput: "final observation completion message",
      resumable: false,
    },
    recoverability: { resumable: false, reason: "test_terminal" },
    ...overrides,
  };
}

describe("Agent wait final observation", () => {
  it("returns a completion repaired by exit reconciliation instead of the bounded timeout", async () => {
    const { runtime, workspace, agent } = setup();
    patchReconcileOnce(runtime, () => {
      writeJobFile(
        workspace,
        "cc-final-observation",
        terminalJobFrom(readJobFile(workspace, "cc-final-observation"))
      );
    });
    const jobsWaitCalls = spyOnJobsWait(runtime);

    const waited = await runtime.waitAgent({ timeout_ms: 0 });

    assert.equal(waited.timedOut, false);
    assert.equal(waited.message, "CC Agent completion is available.");
    assert.equal(waited.update.kind, "completion");
    assert.equal(waited.update.agent_name, agent.path);
    assert.equal(waited.update.completion_message, "final observation completion message");
    assert.equal(jobsWaitCalls.length, 2);
    assert.deepEqual(
      { timeoutMs: jobsWaitCalls[1].timeoutMs, acknowledgeTokens: jobsWaitCalls[1].acknowledgeTokens, wakeOnProgress: jobsWaitCalls[1].wakeOnProgress },
      { timeoutMs: 0, acknowledgeTokens: [], wakeOnProgress: false }
    );
  });

  it("returns a completion published to the inbox after the bounded loop's last poll", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();
    patchReconcileOnce(runtime, () => {
      appendCompletionEvent(workspace, ownerRootId, {
        jobId: "cc-final-observation",
        agentId: agent.agentId,
        terminalStatus: "completed",
        completedAt: "2026-07-26T00:00:05.000Z",
        summary: "done",
        finalMessage: "published between the last poll and the final observation",
        resumability: { classification: "resumable", claudeSessionId: "session-final-observation" },
        detailedResultAvailable: true,
        resultPointer: "cc-final-observation",
      });
    });

    const waited = await runtime.waitAgent({ timeout_ms: 0 });

    assert.equal(waited.timedOut, false);
    assert.equal(waited.update.kind, "completion");
    assert.equal(
      waited.update.completion_message,
      "published between the last poll and the final observation"
    );
  });

  it("keeps a genuinely quiet final observation as a settled timeout", async () => {
    const { runtime } = setup();
    let reconcileCalls = 0;
    patchReconcileOnce(runtime, () => { reconcileCalls += 1; });
    const jobsWaitCalls = spyOnJobsWait(runtime);

    const waited = await runtime.waitAgent({ timeout_ms: 0 });

    assert.equal(reconcileCalls, 1);
    assert.deepEqual(waited, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
    assert.equal(jobsWaitCalls.length, 2);
  });

  it("keeps a completion that appears only after return unread for the next wait", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();

    const firstWaited = await runtime.waitAgent({ timeout_ms: 0 });
    assert.deepEqual(firstWaited, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });

    // Only after the prior call has already returned does a completion
    // become unread; the earlier timeout it returned is not retroactively
    // changed, but the next wait must observe it durably.
    appendCompletionEvent(workspace, ownerRootId, {
      jobId: "cc-final-observation",
      agentId: agent.agentId,
      terminalStatus: "completed",
      completedAt: "2026-07-26T00:00:05.000Z",
      summary: "done",
      finalMessage: "visible only after the prior call already returned",
      resumability: { classification: "resumable", claudeSessionId: "session-after-return" },
      detailedResultAvailable: true,
      resultPointer: "cc-final-observation",
    });

    const secondWaited = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(secondWaited.timedOut, false);
    assert.equal(secondWaited.update.kind, "completion");
    assert.equal(
      secondWaited.update.completion_message,
      "visible only after the prior call already returned"
    );
    assert.ok(secondWaited.update.delivery_token);

    // Existing at-least-once semantics: the same frozen payload and token
    // redeliver until a later call acknowledges it.
    const redelivered = await runtime.waitAgent({ timeout_ms: 0 });
    assert.deepEqual(redelivered, secondWaited);

    const afterAcknowledgement = await runtime.waitAgent({
      timeout_ms: 0,
      acknowledge_tokens: [secondWaited.update.delivery_token],
    });
    assert.deepEqual(afterAcknowledgement, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
  });

  it("does not perform an extra observation once the bounded wait already returns a completion", async () => {
    const { runtime, workspace, ownerRootId, agent } = setup();
    appendCompletionEvent(workspace, ownerRootId, {
      jobId: "cc-final-observation",
      agentId: agent.agentId,
      terminalStatus: "completed",
      completedAt: "2026-07-26T00:00:00.000Z",
      summary: "done",
      finalMessage: "already visible before the bounded wait started",
      resumability: { classification: "resumable", claudeSessionId: "session-already-visible" },
      detailedResultAvailable: true,
      resultPointer: "cc-final-observation",
    });
    const jobsWaitCalls = spyOnJobsWait(runtime);

    const waited = await runtime.waitAgent({ timeout_ms: 0 });

    assert.equal(waited.update.kind, "completion");
    assert.equal(jobsWaitCalls.length, 1);
  });

  it("supersedes an already-claimed progress update with a final-observation completion", async () => {
    const { runtime, workspace, ownerRootId, agent } = setupWithProgress();
    patchReconcileOnce(runtime, () => {
      appendCompletionEvent(workspace, ownerRootId, {
        jobId: "cc-final-observation",
        agentId: agent.agentId,
        terminalStatus: "completed",
        completedAt: "2026-07-26T00:00:05.000Z",
        summary: "done",
        finalMessage: "completion supersedes the claimed progress",
        resumability: { classification: "resumable", claudeSessionId: "session-supersede" },
        detailedResultAvailable: true,
        resultPointer: "cc-final-observation",
      });
    });

    const waited = await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true });

    assert.equal(waited.update.kind, "completion");
    assert.equal(waited.update.completion_message, "completion supersedes the claimed progress");
    // The progress revision was claimed as a side effect of the bounded wait
    // before the completion superseded it; it stays consumed.
    assert.equal(readJobFile(workspace, "cc-final-observation").publicProgressDeliveredRevision, 3);

    const afterAcknowledgement = await runtime.waitAgent({
      timeout_ms: 0,
      wake_on_progress: true,
      acknowledge_tokens: [waited.update.delivery_token],
    });
    assert.deepEqual(afterAcknowledgement, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });

    runtime.store.updateAgent(agent.agentId, (current) => ({
      ...current,
      activeJobId: "cc-final-observation-followup",
      latestJobId: "cc-final-observation-followup",
    }));
    writeJobFile(workspace, "cc-final-observation-followup", {
      id: "cc-final-observation-followup",
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
        updatedAt: "2026-07-26T00:00:06.000Z",
      },
    });
    const followupReceipt = await runtime.waitAgent({ timeout_ms: 0, wake_on_progress: true });
    assert.equal(followupReceipt.update?.kind, "progress");
    assert.equal(followupReceipt.update.progress.revision, 1);
  });

  it("lets final targeted completion supersede claimed progress for the fixed turn", async () => {
    const { runtime, workspace, agent } = setupWithProgress();
    patchReconcileOnce(runtime, () => {
      writeJobFile(
        workspace,
        "cc-final-observation",
        terminalJobFrom(readJobFile(workspace, "cc-final-observation"), {
          result: {
            status: "completed",
            rawOutput: "targeted completion supersedes claimed progress",
            resumable: false,
          },
        }),
      );
    });
    const jobsWaitCalls = spyOnJobsWait(runtime);

    const waited = await runtime.waitAgent({
      targets: [agent.path],
      timeout_ms: 0,
      wake_on_progress: true,
    });

    assert.equal(waited.timedOut, false);
    assert.equal(waited.targets[0].state, "settled");
    assert.equal(
      waited.targets[0].completion_message,
      "targeted completion supersedes claimed progress",
    );
    assert.equal(readJobFile(workspace, "cc-final-observation").publicProgressDeliveredRevision, 3);
    assert.equal(jobsWaitCalls.length, 2);
    assert.deepEqual(jobsWaitCalls[0].targetJobIds, ["cc-final-observation"]);
    assert.equal(jobsWaitCalls[0].wakeOnProgress, true);
    assert.deepEqual(jobsWaitCalls[1].targetJobIds, ["cc-final-observation"]);
    assert.equal(jobsWaitCalls[1].wakeOnProgress, false);
  });
});

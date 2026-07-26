import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import {
  acknowledgeAgentCompletionEvents,
  readUnreadAgentCompletionSummaries,
  reconcileTerminalJobCompletion,
} from "../../runtime/completion-inbox.mjs";
import { cleanupOldJobs, readJobFile, writeJobFile } from "../../runtime/job-store.mjs";

const sourceRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
let fixture;

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-reconcile-"));
  const workspace = path.join(root, "workspace");
  const codexHome = path.join(root, ".codex");
  const runtimeHome = path.join(root, "runtime-home");
  const claudeConfigDir = path.join(root, ".claude");
  fs.mkdirSync(workspace);
  fs.mkdirSync(codexHome);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(path.join(codexHome, ".env"), [
    `CLAUDE_CONFIG_DIR=${claudeConfigDir}`,
    `CC_RUNTIME_CHECKOUT=${sourceRoot}`,
    "",
  ].join("\n"));
  const env = {
    ...process.env,
    CODEX_HOME: codexHome,
    CODEX_THREAD_ID: "root-agent-reconciliation",
    CC_RUNTIME_HOME: runtimeHome,
  };
  return { workspace, env };
}

before(() => {
  fixture = setup();
});

after(() => {
  const current = fixture;
  if (current) fs.rmSync(path.dirname(current.workspace), { recursive: true, force: true });
  fixture = null;
});

function activeFixture() {
  assert.ok(fixture, "test fixture must be initialized");
  return fixture;
}

function terminalJob(agent, id, createdAt) {
  return {
    id,
    workspaceRoot: agent.workspaceRoot,
    ownerRootId: agent.rootThreadId,
    agentId: agent.agentId,
    status: "completed",
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    summary: `summary ${id}`,
    rendered: `result ${id}`,
    threadId: `claude-session-${id}`,
    recoverability: {
      resumable: true,
      mode: "exact_session",
      exactSessionId: `claude-session-${id}`,
      reason: "completed_exact_session",
    },
  };
}

function markActivationOld(runtime, agentId) {
  runtime.store.updateAgent(agentId, (agent) => ({
    ...agent,
    continuation: {
      ...agent.continuation,
      evidence: {
        ...agent.continuation.evidence,
        activationReservedAt: new Date(Date.now() - 10_000).toISOString(),
      },
    },
  }));
}

describe("Agent reconciliation retention and activation recovery", () => {
  it("repairs a finalized crash-window marker before retention and completion-tail compaction", async () => {
    const { workspace, env } = activeFixture();
    const runtime = createAgentRuntime({ cwd: workspace, env });
    const agent = runtime.store.createAgent({ task_name: "retention", selectedModel: "claude-sonnet-5" });
    const baseTime = Date.now() - 120_000;
    const newest = terminalJob(agent, "retained-job-100", new Date(baseTime + 100_000).toISOString());
    runtime.store.reserveActivation(agent.agentId, newest.id, { initial: true });
    runtime.store.finalizeFromJob(newest);
    const oldest = terminalJob(agent, "retained-job-000", new Date(baseTime).toISOString());
    runtime.store.finalizeFromJob(oldest);

    for (let index = 0; index <= 100; index += 1) {
      const id = `retained-job-${String(index).padStart(3, "0")}`;
      writeJobFile(workspace, id, {
        ...(index === 0
          ? oldest
          : terminalJob(agent, id, new Date(baseTime + index * 1_000).toISOString())),
        ...(index === 0 ? {} : { agentProjectionReconciledAt: new Date().toISOString() }),
      });
    }
    reconcileTerminalJobCompletion(workspace, agent.rootThreadId, oldest);

    assert.equal(runtime.rootJobs().length, 101);
    const receipts = runtime.reconcile();

    assert.ok(readJobFile(workspace, "retained-job-000")?.agentProjectionReconciledAt);
    assert.ok(receipts.some(
      (receipt) => receipt.jobId === "retained-job-000" && receipt.reason === "already_finalized"
    ));

    cleanupOldJobs(workspace);
    assert.equal(readJobFile(workspace, "retained-job-000"), null);

    const firstBatch = readUnreadAgentCompletionSummaries(
      workspace,
      agent.rootThreadId,
      { limit: 100 }
    );
    assert.equal(firstBatch.events.length, 100);
    const firstAcknowledgement = acknowledgeAgentCompletionEvents(
      workspace,
      agent.rootThreadId,
      firstBatch.events.map((event) => event.deliveryToken)
    );
    assert.equal(firstAcknowledgement.compactedCount, 0);

    const finalBatch = readUnreadAgentCompletionSummaries(workspace, agent.rootThreadId);
    assert.equal(finalBatch.events.length, 1);
    const finalAcknowledgement = acknowledgeAgentCompletionEvents(
      workspace,
      agent.rootThreadId,
      finalBatch.events.map((event) => event.deliveryToken)
    );
    assert.equal(finalAcknowledgement.compactedCount, 1);
    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0 }), {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
  });

  it("releases only grace-expired missing reservations after restart and preserves the follow-up mailbox", () => {
    const { workspace, env } = activeFixture();
    const firstRuntime = createAgentRuntime({ cwd: workspace, env });
    const initial = firstRuntime.store.createAgent({
      task_name: "initial_gap",
      selectedModel: "claude-sonnet-5",
    });
    firstRuntime.store.reserveActivation(initial.agentId, "missing-initial", { initial: true });
    firstRuntime.reconcile();
    const pendingInitial = firstRuntime.store.readAgent(initial.agentId);
    assert.ok(pendingInitial);
    assert.equal(pendingInitial.status, "running");

    markActivationOld(firstRuntime, initial.agentId);
    const restarted = createAgentRuntime({ cwd: workspace, env });
    restarted.reconcile();
    assert.equal(restarted.store.readAgent(initial.agentId), null);

    const followup = restarted.store.createAgent({
      task_name: "followup_gap",
      selectedModel: "claude-sonnet-5",
    });
    const completedJob = terminalJob(followup, "completed-before-gap", new Date().toISOString());
    restarted.store.reserveActivation(followup.agentId, completedJob.id, { initial: true });
    restarted.store.finalizeFromJob(completedJob);
    restarted.store.enqueueMessage(followup.agentId, "continue after restart");
    restarted.store.reserveActivation(followup.agentId, "missing-followup");
    markActivationOld(restarted, followup.agentId);

    const afterSecondRestart = createAgentRuntime({ cwd: workspace, env });
    afterSecondRestart.reconcile();
    const recovered = afterSecondRestart.store.readAgent(followup.agentId);
    assert.ok(recovered);
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.activeJobId, null);
    assert.equal(recovered.continuation.mode, "exact_session");
    assert.equal(afterSecondRestart.store.listMessages(followup.agentId, { state: "queued" }).length, 1);
  });
});

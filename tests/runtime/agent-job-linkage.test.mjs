import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  appendCompletionEvent,
  deterministicCompletionEventId,
  readUnreadCompletionEvents,
  reconcileTerminalJobCompletion,
  resolveCompletionInboxFile,
} from "../../runtime/completion-inbox.mjs";
import { createJobRecord } from "../../runtime/job-runner.mjs";
import {
  classifyJobRecoverability,
  cleanupOldJobs,
  readJobFile,
  writeJobFile,
} from "../../runtime/job-store.mjs";

const roots = [];
const originalRuntimeHome = process.env.CC_RUNTIME_HOME;

afterEach(() => {
  if (originalRuntimeHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = originalRuntimeHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-job-linkage-"));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  process.env.CC_RUNTIME_HOME = path.join(root, "runtime-home");
  roots.push(root);
  return { workspace, ownerRootId: "codex-root-agent-linkage", agentId: "agent-7f2a" };
}

function terminalJob({ workspace, ownerRootId, agentId, id, createdAt }) {
  return {
    id,
    workspaceRoot: workspace,
    ownerRootId,
    agentId,
    status: "completed",
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    summary: `summary for ${id}`,
    rendered: `final result for ${id}`,
    threadId: `claude-session-${id}`,
    recoverability: {
      resumable: true,
      mode: "exact_session",
      exactSessionId: `claude-session-${id}`,
      reason: "completed_exact_session",
    },
  };
}

describe("Agent-linked internal job receipts", () => {
  it("persists an Agent ID from either explicit creation option or the base record", () => {
    const explicit = createJobRecord({ id: "job-explicit" }, {
      env: {},
      ownerRootId: "root-a",
      agentId: "agent-explicit",
    });
    const inherited = createJobRecord({ id: "job-inherited", agentId: "agent-inherited" }, {
      env: {},
      ownerRootId: "root-a",
    });

    assert.equal(explicit.agentId, "agent-explicit");
    assert.equal(inherited.agentId, "agent-inherited");
    assert.equal(explicit.ownerRootId, "root-a");
  });

  it("permits safe-fresh continuation only with explicit pre-Claude evidence", () => {
    assert.deepEqual(
      classifyJobRecoverability({ status: "failed", safeFreshRetry: true }),
      {
        resumable: true,
        mode: "safe_fresh",
        exactSessionId: null,
        reason: "failure_proven_safe_fresh_retry",
      }
    );
    assert.deepEqual(
      classifyJobRecoverability({ status: "failed", errorMessage: "unknown failure" }),
      {
        resumable: false,
        mode: "blocked",
        exactSessionId: null,
        reason: "unknown failure",
      }
    );
  });

  it("derives an idempotent Agent completion projection from the terminal job fact", () => {
    const { workspace, ownerRootId, agentId } = setup();
    const job = terminalJob({
      workspace,
      ownerRootId,
      agentId,
      id: "job-agent-completion",
      createdAt: "2026-07-25T00:00:00.000Z",
    });

    const first = reconcileTerminalJobCompletion(workspace, ownerRootId, job);
    const second = reconcileTerminalJobCompletion(workspace, ownerRootId, job);
    assert.equal(first.reconciled, true);
    assert.equal(second.reconciled, false);
    assert.equal(first.event.eventId, deterministicCompletionEventId(ownerRootId, job.id));
    assert.equal(first.event.agentId, agentId);
    assert.equal(first.event.agentStatus, "completed");
    assert.equal(first.event.finalMessage, `final result for ${job.id}`);
    assert.equal(first.event.truncated, false);
    assert.equal(first.event.detailedResultAvailable, true);
    assert.equal(first.event.claudeSessionIdAvailable, true);

    assert.throws(
      () => appendCompletionEvent(workspace, ownerRootId, {
        jobId: job.id,
        agentId: "different-agent",
        terminalStatus: "completed",
        completedAt: job.completedAt,
        summary: "conflicting Agent projection",
        resumability: { classification: "resumable", claudeSessionId: job.threadId },
        detailedResultAvailable: true,
        resultPointer: job.id,
      }),
      /identity collision/
    );
  });

  it("reconciles Agent completion before pruning its detailed terminal receipt", () => {
    const { workspace, ownerRootId, agentId } = setup();
    const baseTime = Date.now() - 120_000;
    for (let index = 0; index <= 100; index += 1) {
      const id = `job-${String(index).padStart(3, "0")}`;
      writeJobFile(workspace, id, {
        ...terminalJob({
        workspace,
        ownerRootId,
        agentId,
        id,
        createdAt: new Date(baseTime + index * 1000).toISOString(),
        }),
        agentProjectionReconciledAt: new Date(baseTime + index * 1000 + 1).toISOString(),
      });
    }

    cleanupOldJobs(workspace);

    const prunedId = "job-000";
    assert.equal(readJobFile(workspace, prunedId), null);
    const storedInbox = JSON.parse(fs.readFileSync(resolveCompletionInboxFile(workspace, ownerRootId), "utf8"));
    const prunedEvent = storedInbox.events.find((event) => event.jobId === prunedId);
    assert.ok(prunedEvent, "the retained inbox must contain a projection for the pruned receipt");
    assert.equal(prunedEvent.agentId, agentId);
    assert.equal(prunedEvent.agentStatus, "completed");
    assert.equal(prunedEvent.detailedResultAvailable, false);
    assert.equal(prunedEvent.resultPointer, null);

    const unread = readUnreadCompletionEvents(workspace, ownerRootId, { limit: 100 });
    assert.equal(unread.events.length, 100);
    assert.equal(unread.events.some((event) => event.jobId === prunedId), false);
    assert.equal(storedInbox.events.length, 101);
  });

  it("keeps an Agent terminal fact until the registry projection is reconciled", () => {
    const { workspace, ownerRootId, agentId } = setup();
    const baseTime = Date.now() - 120_000;
    for (let index = 0; index <= 100; index += 1) {
      const id = `pending-projection-${String(index).padStart(3, "0")}`;
      writeJobFile(workspace, id, {
        ...terminalJob({
          workspace,
          ownerRootId,
          agentId,
          id,
          createdAt: new Date(baseTime + index * 1000).toISOString(),
        }),
        ...(index === 0 ? {} : { agentProjectionReconciledAt: new Date().toISOString() }),
      });
    }

    cleanupOldJobs(workspace);
    assert.ok(readJobFile(workspace, "pending-projection-000"));
    const storedInbox = JSON.parse(fs.readFileSync(resolveCompletionInboxFile(workspace, ownerRootId), "utf8"));
    assert.ok(storedInbox.events.some((event) => event.jobId === "pending-projection-000"));
  });

  it("prunes pre-Claude diagnostics only after Agent recovery is projected", () => {
    const { workspace, ownerRootId, agentId } = setup();
    const baseTime = Date.now() - 120_000;
    for (let index = 0; index <= 100; index += 1) {
      const id = `pre-claude-diagnostic-${String(index).padStart(3, "0")}`;
      const createdAt = new Date(baseTime + index * 1_000).toISOString();
      writeJobFile(workspace, id, {
        id,
        workspaceRoot: workspace,
        ownerRootId,
        agentId,
        status: "failed",
        phase: "activation_prepared_launcher_lost",
        activationAttached: true,
        preClaudeLaunch: true,
        safeFreshRetry: true,
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
        ...(index === 0 ? {} : { agentProjectionReconciledAt: createdAt }),
      });
    }

    cleanupOldJobs(workspace);
    const oldestId = "pre-claude-diagnostic-000";
    const unrecovered = readJobFile(workspace, oldestId);
    assert.ok(unrecovered, "an unrecovered attached diagnostic must stay durable");
    assert.deepEqual(readUnreadCompletionEvents(workspace, ownerRootId).events, []);

    writeJobFile(workspace, oldestId, {
      ...unrecovered,
      agentProjectionReconciledAt: new Date().toISOString(),
    });
    cleanupOldJobs(workspace);
    assert.equal(readJobFile(workspace, oldestId), null);
    assert.deepEqual(readUnreadCompletionEvents(workspace, ownerRootId).events, []);
  });
});

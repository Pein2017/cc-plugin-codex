import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createAgentStore } from "../../runtime/agent-store.mjs";
import {
  CLAUDE_CODE_CAPABILITIES,
  CLAUDE_CODE_DRIVER_VERSION,
  CLAUDE_CODE_HARNESS_ID,
} from "../../runtime/claude-code-driver.mjs";
import {
  readUnreadCompletionEvents,
  reconcileTerminalJobCompletion,
} from "../../runtime/completion-inbox.mjs";
import { listJobs, readJobFile, transitionJob, writeJobFile } from "../../runtime/job-store.mjs";

const HARNESS = {
  harnessId: CLAUDE_CODE_HARNESS_ID,
  driverVersion: CLAUDE_CODE_DRIVER_VERSION,
  capabilities: CLAUDE_CODE_CAPABILITIES,
};

const roots = [];
const originalRuntimeHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;

afterEach(() => {
  if (originalRuntimeHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = originalRuntimeHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hd-agent-session-conflict-"));
  const workspace = path.join(root, "workspace");
  const foreignWorkspace = path.join(root, "foreign-workspace");
  const claudeConfigDir = path.join(root, "claude");
  fs.mkdirSync(workspace);
  fs.mkdirSync(foreignWorkspace);
  fs.mkdirSync(claudeConfigDir);
  process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = path.join(root, "runtime-home");
  roots.push(root);
  return {
    workspace,
    foreignWorkspace,
    claudeConfigDir,
    ownerRootId: "codex-root-local",
    foreignRootId: "codex-root-foreign",
  };
}

describe("Agent session-binding conflict projection", () => {
  it("publishes a failed blocked completion when terminal transition first discovers a foreign binding", () => {
    const {
      workspace,
      foreignWorkspace,
      claudeConfigDir,
      ownerRootId,
      foreignRootId,
    } = setup();
    const sharedSessionId = "claude-transition-session";
    const foreignStore = createAgentStore({
      cwd: foreignWorkspace,
      ownerRootId: foreignRootId,
      claudeConfigDir,
      harness: HARNESS,
    });
    const foreign = foreignStore.createAgent({ task_name: "foreign_transition" });
    foreignStore.reserveActivation(foreign.agentId, "job-foreign-transition", { initial: true });
    foreignStore.bindSession(foreign.agentId, sharedSessionId, { jobId: "job-foreign-transition" });

    const store = createAgentStore({ cwd: workspace, ownerRootId, claudeConfigDir, harness: HARNESS });
    const agent = store.createAgent({ task_name: "local_transition" });
    const jobId = "job-local-transition-conflict";
    store.reserveActivation(agent.agentId, jobId, { initial: true });
    writeJobFile(workspace, jobId, {
      id: jobId,
      workspaceRoot: workspace,
      ownerRootId,
      agentId: agent.agentId,
      claudeConfigDir,
      status: "running",
      createdAt: "2026-07-25T00:00:00.000Z",
      summary: "worker summary",
    });

    const terminal = transitionJob(workspace, jobId, ["running"], "completed", {
      threadId: sharedSessionId,
      completedAt: "2026-07-25T00:00:01.000Z",
      summary: "worker reported success",
      rendered: "worker reported success",
    });
    assert.equal(terminal.transitioned, true);
    assert.equal(terminal.job.status, "failed");
    assert.equal(terminal.job.failureClass, "session_binding_conflict");
    assert.equal(terminal.completion.event.terminalStatus, "failed");
    assert.equal(terminal.completion.event.agentStatus, "errored");
    assert.equal(terminal.completion.event.resumability.classification, "not_resumable");
    assert.equal(terminal.completion.event.resumability.blockingReason, "session_binding_conflict");

    const projection = store.reconcileFromJobs([terminal.job]);
    assert.equal(projection[0].agent.status, "errored");
    assert.equal(projection[0].agent.continuation.mode, "blocked");
  });

  it("corrects an unacknowledged completed projection into one failed blocked fact before Agent reconciliation", () => {
    const {
      workspace,
      foreignWorkspace,
      claudeConfigDir,
      ownerRootId,
      foreignRootId,
    } = setup();
    const sharedSessionId = "claude-global-session";
    const foreignStore = createAgentStore({
      cwd: foreignWorkspace,
      ownerRootId: foreignRootId,
      claudeConfigDir,
      harness: HARNESS,
    });
    const foreign = foreignStore.createAgent({ task_name: "foreign" });
    foreignStore.reserveActivation(foreign.agentId, "job-foreign", { initial: true });
    foreignStore.bindSession(foreign.agentId, sharedSessionId, { jobId: "job-foreign" });

    const store = createAgentStore({ cwd: workspace, ownerRootId, claudeConfigDir, harness: HARNESS });
    const agent = store.createAgent({ task_name: "local" });
    const jobId = "job-local-conflict";
    store.reserveActivation(agent.agentId, jobId, { initial: true });
    const completed = {
      id: jobId,
      workspaceRoot: workspace,
      ownerRootId,
      agentId: agent.agentId,
      claudeConfigDir,
      status: "completed",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:01.000Z",
      completedAt: "2026-07-25T00:00:01.000Z",
      threadId: sharedSessionId,
      summary: "The obsolete worker reported success.",
      rendered: "The obsolete worker reported success.",
      recoverability: {
        resumable: true,
        mode: "exact_session",
        exactSessionId: sharedSessionId,
        reason: "completed_exact_session",
      },
    };
    writeJobFile(workspace, jobId, completed);

    // Simulate the pre-fix crash window: a completed event was published
    // before a later process discovered the global binding conflict.
    const stale = reconcileTerminalJobCompletion(workspace, ownerRootId, completed);
    assert.equal(stale.event.terminalStatus, "completed");
    const deliveryToken = stale.event.deliveryToken;

    const reconciledJobs = listJobs(workspace);
    assert.equal(reconciledJobs.find((job) => job.id === jobId).status, "failed");
    const terminal = readJobFile(workspace, jobId);
    assert.equal(terminal.status, "failed");
    assert.equal(terminal.failureClass, "session_binding_conflict");
    assert.deepEqual(terminal.recoverability, {
      resumable: false,
      mode: "blocked",
      exactSessionId: null,
      reason: "session_binding_conflict",
    });

    const firstProjection = store.reconcileFromJobs(reconciledJobs);
    assert.equal(firstProjection.length, 1);
    assert.equal(firstProjection[0].agent.status, "errored");
    assert.equal(firstProjection[0].agent.continuation.mode, "blocked");
    assert.equal(firstProjection[0].agent.continuation.evidence.reason, "session_binding_conflict");

    const firstInbox = readUnreadCompletionEvents(workspace, ownerRootId);
    assert.equal(firstInbox.events.length, 1);
    assert.equal(firstInbox.events[0].terminalStatus, "failed");
    assert.equal(firstInbox.events[0].agentStatus, "errored");
    assert.equal(firstInbox.events[0].resumability.classification, "not_resumable");
    assert.equal(firstInbox.events[0].resumability.blockingReason, "session_binding_conflict");
    assert.equal(firstInbox.events[0].deliveryToken, deliveryToken);

    // Recovery is monotonic: terminal job, Agent, and completion event stay
    // aligned, while the existing unacknowledged delivery token stays valid.
    const againJobs = listJobs(workspace);
    const secondProjection = store.reconcileFromJobs(againJobs);
    const secondInbox = readUnreadCompletionEvents(workspace, ownerRootId);
    assert.equal(secondProjection[0].reason, "already_finalized");
    assert.equal(readJobFile(workspace, jobId).status, "failed");
    assert.equal(store.readAgent(agent.agentId).status, "errored");
    assert.equal(secondInbox.events.length, 1);
    assert.equal(secondInbox.events[0].terminalStatus, "failed");
    assert.equal(secondInbox.events[0].deliveryToken, deliveryToken);
  });
});

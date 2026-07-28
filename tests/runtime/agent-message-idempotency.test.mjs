import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import { readUnreadCompletionEvents } from "../../runtime/completion-inbox.mjs";
import {
  enqueueSteeringMessage,
  getSteeringSnapshot,
  readJobFile,
  transitionJob,
  writeJobFile,
} from "../../runtime/job-store.mjs";

/** @type {string[]} */
const roots = [];
const originalRuntimeHome = process.env.CC_RUNTIME_HOME;
const sharedRuntimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-message-runtime-home-"));

after(() => fs.rmSync(sharedRuntimeHome, { recursive: true, force: true }));

afterEach(() => {
  if (originalRuntimeHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = originalRuntimeHome;
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-message-idempotency-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, "claude");
  const envFile = path.join(root, "runtime.env");
  const ownerRootId = "codex-root-message-idempotency";
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  process.env.CC_RUNTIME_HOME = sharedRuntimeHome;
  roots.push(root);
  const runtime = createAgentRuntime({
    cwd: workspace,
    envFile,
    env: {
      CODEX_THREAD_ID: ownerRootId,
      CC_RUNTIME_HOME: sharedRuntimeHome,
      CLAUDE_CONFIG_DIR: claudeConfigDir,
    },
  });
  return { runtime, workspace, claudeConfigDir, ownerRootId };
}

/**
 * @param {{
 *   workspace: string,
 *   ownerRootId: string,
 *   agentId: string,
 *   id: string,
 *   steering?: Record<string, unknown>,
 * }} options
 */
function activeJob({ workspace, ownerRootId, agentId, id, steering }) {
  const timestamp = new Date().toISOString();
  return {
    id,
    workspaceRoot: workspace,
    ownerRootId,
    agentId,
    status: "running",
    phase: "running",
    acceptingSteering: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(steering ? { steering } : {}),
  };
}

function makeTerminalAgent(runtime, taskName) {
  const created = runtime.store.createAgent({
    task_name: taskName,
    selectedModel: "claude-sonnet-5",
  });
  runtime.store.updateAgent(created.agentId, (agent) => ({ ...agent, status: "completed" }));
  return runtime.store.resolveTarget(created.agentId);
}

describe("Agent message delivery idempotency", () => {
  it("reuses one locked steering sequence after a crash before the Agent mailbox dispatch update", () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "steering_recovery" });
    const jobId = "job-steering-recovery";
    runtime.store.reserveActivation(agent.agentId, jobId, { initial: true });
    writeJobFile(workspace, jobId, activeJob({ workspace, ownerRootId, agentId: agent.agentId, id: jobId }));
    const queued = runtime.store.enqueueMessage(agent.agentId, "keep the smaller fixture", {
      kind: "send_message",
    });
    assert.equal(queued.message.deliveryIntent, "steering");

    // Simulate a crash after the job record accepts the stream input but
    // before the Agent mailbox receives its dispatched receipt.
    const first = enqueueSteeringMessage(workspace, jobId, queued.message.text, {
      kind: "agent_message",
      messageId: queued.message.messageId,
    });
    runtime.reconcile();
    runtime.deliverAssignedMessage(runtime.store.resolveTarget(agent.agentId), queued.message);

    const stored = readJobFile(workspace, jobId);
    assert.equal(stored.steering.messages.length, 1);
    assert.equal(stored.steering.messages[0].sequence, first.sequence);
    assert.equal(stored.steering.messages[0].agentMessageId, queued.message.messageId);
    assert.equal(
      runtime.store.listMessages(agent.agentId).find((message) => message.messageId === queued.message.messageId).state,
      "dispatched"
    );
  });

  it("keeps legacy steering entries append-compatible while Agent message IDs get-or-create", () => {
    const { workspace, ownerRootId } = setup();
    writeJobFile(workspace, "job-legacy-steering", activeJob({
      workspace,
      ownerRootId,
      agentId: "agent-legacy",
      id: "job-legacy-steering",
      steering: {
        nextSequence: 2,
        latestAcknowledgedSequence: 0,
        messages: [{ sequence: 1, kind: "steer", text: "legacy", queuedAt: new Date().toISOString() }],
      },
    }));

    const first = enqueueSteeringMessage(workspace, "job-legacy-steering", "new Agent message", {
      kind: "agent_message",
      messageId: "agent-message-1",
    });
    const retry = enqueueSteeringMessage(workspace, "job-legacy-steering", "new Agent message", {
      kind: "agent_message",
      messageId: "agent-message-1",
    });
    const stored = readJobFile(workspace, "job-legacy-steering");

    assert.equal(first.sequence, 2);
    assert.equal(retry.sequence, 2);
    assert.deepEqual(stored.steering.messages.map((message) => message.sequence), [1, 2]);
    assert.equal(stored.steering.messages[0].agentMessageId, undefined);
  });

  it("persists initial-prompt intent so reconcile neither steers nor requeues a consumed follow-up", () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = makeTerminalAgent(runtime, "prompt_window");
    const queued = runtime.store.enqueueMessage(agent.agentId, "continue from the exact session", {
      kind: "followup_task",
    });
    const jobId = "job-initial-prompt-window";
    const activation = runtime.store.reserveActivation(agent.agentId, jobId);
    assert.equal(activation.reserved, true);
    assert.equal(activation.assignedMessages[0].messageId, queued.message.messageId);
    assert.equal(activation.assignedMessages[0].deliveryIntent, "initial_prompt");
    writeJobFile(workspace, jobId, activeJob({ workspace, ownerRootId, agentId: agent.agentId, id: jobId }));

    // This is the jobs.start -> markInitialPromptMessages crash window.
    runtime.reconcile();
    assert.deepEqual(getSteeringSnapshot(workspace, jobId), {
      pendingCount: 0,
      unacknowledgedCount: 0,
      latestAcknowledgedSequence: 0,
      lastSequence: 0,
    });
    assert.equal(runtime.store.listMessages(agent.agentId)[0].state, "assigned");

    const running = readJobFile(workspace, jobId);
    writeJobFile(workspace, jobId, {
      ...running,
      status: "completed",
      completedAt: new Date().toISOString(),
      threadId: "claude-initial-prompt-session",
      recoverability: {
        resumable: true,
        mode: "exact_session",
        exactSessionId: "claude-initial-prompt-session",
        reason: "completed_exact_session",
      },
    });
    runtime.reconcile();

    const message = runtime.store.listMessages(agent.agentId)[0];
    assert.equal(message.state, "acknowledged");
    assert.equal(message.deliveryIntent, "initial_prompt");
    assert.equal(message.receipt.delivery, "terminal_initial_prompt");
    assert.equal(getSteeringSnapshot(workspace, jobId).lastSequence, 0);
  });

  it("returns an already-active initial-prompt receipt when another terminal follow-up won the reservation", async () => {
    const { runtime } = setup();
    const agent = makeTerminalAgent(runtime, "concurrent_followup");
    runtime.store.enqueueMessage(agent.agentId, "first concurrent follow-up", { kind: "followup_task" });
    runtime.jobs.assertReady = () => ({
      ready: true,
      availability: { available: true },
      compatibility: {
        staticCompatible: true,
        fingerprint: "test-compatible-claude",
        executable: process.execPath,
        version: "test",
      },
      auth: { loggedIn: true },
      cwd: runtime.jobs.cwd,
      claudeConfigDir: runtime.jobs.env.CLAUDE_CONFIG_DIR ?? null,
      sourceRoot: runtime.jobs.sourceRoot,
    });
    const baseStore = runtime.store;
    const winningJobId = "job-concurrent-winner";
    let simulatedWinner = false;
    runtime.store = {
      ...baseStore,
      reserveActivation(target, requestedJobId, options) {
        if (simulatedWinner) return baseStore.reserveActivation(target, requestedJobId, options);
        simulatedWinner = true;
        const winner = baseStore.reserveActivation(target, winningJobId, options);
        assert.equal(winner.reserved, true);
        return { ...winner, reserved: false, reason: "already_active", assignedMessages: [] };
      },
    };

    const result = await runtime.followupTask({
      target: agent.agentId,
      message: "second concurrent follow-up",
    });

    assert.equal(result.activated, false);
    assert.equal(result.delivery, "already_active_initial_prompt");
    assert.equal(result.turn.jobId, winningJobId);
    const messages = runtime.store.listMessages(agent.agentId);
    assert.equal(messages.length, 2);
    assert.ok(messages.every((message) =>
      message.state === "assigned" &&
      message.assignedJobId === winningJobId &&
      message.deliveryIntent === "initial_prompt"
    ));
  });

  it("keeps pre-Claude prepared sends pending, requeues crash state, and never publishes a root completion", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = makeTerminalAgent(runtime, "prepared_crash_window");
    const jobId = "job-pre-claude-crash-window";
    runtime.store.reserveActivation(agent.agentId, jobId);
    const timestamp = new Date().toISOString();
    writeJobFile(workspace, jobId, {
      id: jobId,
      workspaceRoot: workspace,
      ownerRootId,
      agentId: null,
      status: "queued",
      phase: "activation_prepared",
      activationPrepared: true,
      activationAttached: false,
      preClaudeLaunch: true,
      safeFreshRetry: true,
      acceptingSteering: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const first = runtime.sendMessage({ target: agent.agentId, message: "first pre-Claude message" });
    const second = runtime.sendMessage({ target: agent.agentId, message: "second pre-Claude message" });
    assert.equal(first.delivery, "activation_pending");
    assert.equal(second.delivery, "activation_pending");
    assert.deepEqual(first.turn, { jobId, steeringSequence: null });
    const followup = await runtime.followupTask({
      target: agent.agentId,
      message: "follow-up while activation remains unbound",
    });
    assert.equal(followup.activated, false);
    assert.equal(followup.delivery, "activation_pending");
    assert.deepEqual(followup.turn, { jobId, steeringSequence: null });
    assert.deepEqual(getSteeringSnapshot(workspace, jobId), {
      pendingCount: 0,
      unacknowledgedCount: 0,
      latestAcknowledgedSequence: 0,
      lastSequence: 0,
    });

    // Model the old crash state in which a pre-Claude message had already
    // received an Agent dispatch receipt before the process died.
    runtime.store.markMessageDispatched(agent.agentId, first.message.messageId, {
      jobId,
      receipt: { delivery: "durable_stream_input", steeringSequence: 1 },
    });
    const terminal = transitionJob(workspace, jobId, ["queued"], "failed", {
      phase: "activation_prepared_launcher_lost",
      completedAt: new Date().toISOString(),
      workerPid: null,
      workerPidIdentity: null,
      pid: null,
      pidIdentity: null,
    });
    assert.equal(terminal.transitioned, true);
    assert.equal(terminal.completion, undefined);
    assert.deepEqual(readUnreadCompletionEvents(workspace, ownerRootId).events, []);

    runtime.reconcile();
    const recovered = runtime.store.resolveTarget(agent.agentId);
    assert.equal(recovered.activeJobId, null);
    assert.equal(recovered.status, "completed");
    const messages = runtime.store.listMessages(agent.agentId);
    assert.equal(messages.length, 3);
    assert.ok(messages.every((message) =>
      message.state === "queued" &&
      message.assignedJobId == null &&
      message.assignedAt == null &&
      message.deliveryIntent == null &&
      message.dispatchedAt == null &&
      message.acknowledgedAt == null &&
      !("receipt" in message)
    ));
    assert.deepEqual(readUnreadCompletionEvents(workspace, ownerRootId).events, []);
  });

  it("recovers an attached terminal pre-Claude diagnostic without acknowledging or completing it", () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = makeTerminalAgent(runtime, "attached_pre_claude_crash");
    const prior = runtime.store.resolveTarget(agent.agentId);
    const queued = runtime.store.enqueueMessage(agent.agentId, "message Claude never received", {
      kind: "followup_task",
    });
    const jobId = "job-attached-pre-claude-crash";
    const activation = runtime.store.reserveActivation(agent.agentId, jobId);
    assert.equal(activation.reserved, true);
    runtime.store.markMessageDispatched(agent.agentId, queued.message.messageId, {
      jobId,
      receipt: { delivery: "initial_prompt" },
    });
    const timestamp = new Date().toISOString();
    writeJobFile(workspace, jobId, {
      id: jobId,
      workspaceRoot: workspace,
      ownerRootId,
      agentId: agent.agentId,
      status: "queued",
      phase: "activation_prepared",
      activationPrepared: true,
      activationAttached: true,
      preClaudeLaunch: true,
      safeFreshRetry: true,
      acceptingSteering: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const terminal = transitionJob(workspace, jobId, ["queued"], "failed", {
      phase: "activation_prepared_launcher_lost",
      completedAt: new Date().toISOString(),
      workerPid: null,
      workerPidIdentity: null,
      pid: null,
      pidIdentity: null,
    });
    assert.equal(terminal.transitioned, true);
    assert.equal(terminal.completion, undefined);
    assert.deepEqual(readUnreadCompletionEvents(workspace, ownerRootId).events, []);

    runtime.reconcile();
    const firstRecovered = runtime.store.resolveTarget(agent.agentId);
    const firstMessage = runtime.store.listMessages(agent.agentId)[0];
    const firstJob = readJobFile(workspace, jobId);
    assert.equal(firstRecovered.activeJobId, null);
    assert.equal(firstRecovered.latestJobId, prior.latestJobId);
    assert.equal(firstRecovered.status, prior.status);
    assert.deepEqual(firstRecovered.continuation, prior.continuation);
    assert.equal(firstMessage.messageId, queued.message.messageId);
    assert.equal(firstMessage.state, "queued");
    assert.equal(firstMessage.assignedJobId, null);
    assert.equal("receipt" in firstMessage, false);
    assert.ok(firstJob.agentProjectionReconciledAt);
    assert.deepEqual(readUnreadCompletionEvents(workspace, ownerRootId).events, []);

    runtime.reconcile();
    const twiceRecovered = runtime.store.resolveTarget(agent.agentId);
    const twiceMessages = runtime.store.listMessages(agent.agentId);
    assert.deepEqual(twiceRecovered, firstRecovered);
    assert.deepEqual(twiceMessages, [firstMessage]);
    assert.deepEqual(readUnreadCompletionEvents(workspace, ownerRootId).events, []);
  });
});

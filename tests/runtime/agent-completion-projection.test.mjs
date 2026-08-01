import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import {
  appendCompletionEvent,
  resolveCompletionInboxFile,
} from "../../runtime/completion-inbox.mjs";

const roots = [];
const sharedRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-completion-runtime-"));
const sharedCodexHome = path.join(sharedRuntimeRoot, ".codex");
const sharedRuntimeHome = path.join(sharedRuntimeRoot, "runtime-home");
fs.mkdirSync(sharedCodexHome);

after(() => fs.rmSync(sharedRuntimeRoot, { recursive: true, force: true }));

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-completion-projection-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, ".claude");
  const codexHome = sharedCodexHome;
  const envFile = path.join(root, "runtime.env");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  roots.push(root);
  const ownerRootId = "root-agent-completion-projection";
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
  return { runtime, workspace, ownerRootId };
}

function completion(jobId, agentId = null) {
  return {
    jobId,
    agentId,
    terminalStatus: "completed",
    completedAt: "2026-07-26T00:00:00.000Z",
    summary: "stored internal summary",
    finalMessage: "stored Claude final output for parent synthesis",
    resumability: { classification: "resumable", claudeSessionId: `session-${jobId}` },
    detailedResultAvailable: true,
    resultPointer: jobId,
  };
}

describe("Agent completion projection", () => {
  it("returns one redeliverable Agent update with the complete final message", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "projection" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    appendCompletionEvent(workspace, ownerRootId, completion("legacy-one-shot"));
    const linked = appendCompletionEvent(workspace, ownerRootId, completion("agent-one", agent.agentId)).event;

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.deepEqual(first, {
      message: "CC Agent completion is available.",
      timedOut: false,
      update: {
        kind: "completion",
        agent_name: agent.path,
        agent_status: "completed",
        summary: "Agent turn completed.",
        completion_message: "stored Claude final output for parent synthesis",
        completion_message_truncated: false,
        delivery_token: linked.deliveryToken,
        blocking: null,
      },
    });
    assert.equal(JSON.stringify(first).includes("stored Claude final output"), true);
    assert.equal(JSON.stringify(first).includes("resultPointer"), false);

    const correction = appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-one", agent.agentId),
      terminalStatus: "failed",
      finalMessage: "a later correction must not rewrite an exposed token",
      resumability: { classification: "not_resumable", blockingReason: "late correction" },
    }, { reconcileExisting: true });
    assert.equal(correction.corrected, false);
    assert.equal(correction.reason, "delivered_event_immutable");

    const listBeforeAcknowledgement = runtime.listAgents();
    assert.deepEqual(listBeforeAcknowledgement, {
      agents: [{
        agent_name: agent.path,
        agent_status: "completed",
        model: null,
        delegation_mode: "leaf",
      }],
    });
    const unrelated = runtime.store.createAgent({ task_name: "unrelated" });
    assert.deepEqual(runtime.listAgents({ path_prefix: "/root/proj" }), {
      agents: [{
        agent_name: agent.path,
        agent_status: "completed",
        model: null,
        delegation_mode: "leaf",
      }],
    });
    assert.deepEqual(runtime.listAgents().agents, [
      { agent_name: agent.path, agent_status: "completed", model: null, delegation_mode: "leaf" },
      { agent_name: unrelated.path, agent_status: "starting", model: null, delegation_mode: "leaf" },
    ]);

    runtime.store.updateAgent(agent.agentId, (current) => ({
      ...current,
      status: "running",
      activeJobId: "agent-follow-up",
      latestJobId: "agent-follow-up",
    }));

    const redelivered = await runtime.waitAgent({ timeout_ms: 0 });
    assert.deepEqual(redelivered, first);

    const afterAcknowledgement = await runtime.waitAgent({
      timeout_ms: 0,
      acknowledge_tokens: [first.update.delivery_token],
    });
    assert.deepEqual(afterAcknowledgement, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });
  });

  it("preserves multilingual final output above the former 64 KiB bound", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "long_handoff" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    const longMessage = `${"界".repeat(24_000)}\n${"🙂".repeat(4_000)}\ncomplete-tail`;
    assert.ok(Buffer.byteLength(longMessage, "utf8") > 64 * 1024);
    appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-long", agent.agentId),
      finalMessage: longMessage,
    });

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.kind, "completion");
    assert.equal(first.update.completion_message_truncated, false);
    assert.equal(first.update.completion_message, longMessage);
    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0 }), first);
  });

  it("preserves legacy truncation provenance without claiming discarded bytes", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "legacy_truncated" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    appendCompletionEvent(workspace, ownerRootId, completion("agent-legacy", agent.agentId));

    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const inbox = JSON.parse(fs.readFileSync(inboxFile, "utf8"));
    inbox.events[0].finalMessage = "legacy stored prefix";
    inbox.events[0].truncated = true;
    fs.writeFileSync(inboxFile, `${JSON.stringify(inbox, null, 2)}\n`, "utf8");

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.completion_message, "legacy stored prefix");
    assert.equal(first.update.completion_message_truncated, true);
    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0 }), first);
  });

  it("reports the closed blocking triple for a failed turn with no outer-assistant text", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "failed_no_text" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "errored" }));
    appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-failed-no-text", agent.agentId),
      terminalStatus: "failed",
      finalMessage: "",
      resumability: { classification: "not_resumable", blockingReason: "auth_or_permission" },
      blocking: { reason: "auth_required", scope: "harness", retry: "operator_required" },
    });

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.agent_status, "failed");
    assert.equal(first.update.summary, "Agent turn failed.");
    // Today's `completion_message` resolution is unchanged by this projection:
    // it stays empty rather than being backfilled from `blocking`.
    assert.equal(first.update.completion_message, "");
    assert.deepEqual(first.update.blocking, { reason: "auth_required", scope: "harness", retry: "operator_required" });
  });

  it("reports blocking: null for a completed turn regardless of its final message content", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "completed_with_question" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-completed-question", agent.agentId),
      finalMessage: "Which environment should I deploy to? This looks blocked on your quota.",
    });

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.agent_status, "completed");
    assert.equal(first.update.blocking, null);
  });

  it("reports blocking: null for a gracefully interrupted turn whose receipt proves a safe flush", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "graceful_interrupt" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "interrupted" }));
    appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-graceful-interrupt", agent.agentId),
      terminalStatus: "interrupted",
      finalMessage: "partial progress before the parent's own interrupt",
      resumability: { classification: "resumable", claudeSessionId: "session-graceful-interrupt" },
      blocking: null,
    });

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.agent_status, "interrupted");
    assert.equal(first.update.blocking, null);
  });

  it("reports interrupted_unflushed for an interrupted turn without a receipt proving a safe flush", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "unflushed_interrupt" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "interrupted" }));
    appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-unflushed-interrupt", agent.agentId),
      terminalStatus: "interrupted",
      finalMessage: "",
      resumability: { classification: "not_resumable", blockingReason: "interrupted_without_exact_session" },
      blocking: { reason: "interrupted_unflushed", scope: "agent", retry: "new_agent" },
    });

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.agent_status, "interrupted");
    assert.deepEqual(first.update.blocking, { reason: "interrupted_unflushed", scope: "agent", retry: "new_agent" });
  });

  it("redelivers blocking: null for a payload frozen before this change, without recomputing", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "pre_change_frozen" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "errored" }));
    appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-pre-change-frozen", agent.agentId),
      terminalStatus: "failed",
      finalMessage: "pre-change failed handoff",
    });

    // Simulate a stored event from before this change: no `blocking` key at
    // all, exactly as `runtime/completion-inbox.mjs:463-482` projected before.
    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const inbox = JSON.parse(fs.readFileSync(inboxFile, "utf8"));
    delete inbox.events[0].blocking;
    fs.writeFileSync(inboxFile, `${JSON.stringify(inbox, null, 2)}\n`, "utf8");

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.agent_status, "failed");
    assert.equal(first.update.blocking, null);

    // First delivery has now frozen the payload. Even though recomputing from
    // the terminal fact would yield a non-null triple (a "failed" status
    // always would), the frozen `null` is redelivered unchanged.
    const redelivered = await runtime.waitAgent({ timeout_ms: 0 });
    assert.deepEqual(redelivered, first);
    const storedAfterDelivery = JSON.parse(fs.readFileSync(inboxFile, "utf8"));
    assert.equal("blocking" in storedAfterDelivery.events[0], false);
  });
});

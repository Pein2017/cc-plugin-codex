import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import {
  appendCompletionEvent,
  MAX_AGENT_COMPLETION_HANDOFF_BYTES,
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
  it("returns one redeliverable Agent update with a bounded completion handoff", async () => {
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
        agent_status: { completed: null },
        summary: "Agent turn completed.",
        completion_message: "stored Claude final output for parent synthesis",
        completion_message_truncated: false,
        delivery_token: linked.deliveryToken,
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
      agents: [{ agent_name: agent.path, agent_status: { completed: null } }],
    });
    const unrelated = runtime.store.createAgent({ task_name: "unrelated" });
    assert.deepEqual(runtime.listAgents({ path_prefix: "/root/proj" }), {
      agents: [{ agent_name: agent.path, agent_status: { completed: null } }],
    });
    assert.deepEqual(runtime.listAgents().agents, [
      { agent_name: agent.path, agent_status: { completed: null } },
      { agent_name: unrelated.path, agent_status: "pending_init" },
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

  it("truncates only the public handoff while preserving two-phase redelivery", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "long_handoff" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    const longMessage = "界".repeat(MAX_AGENT_COMPLETION_HANDOFF_BYTES);
    appendCompletionEvent(workspace, ownerRootId, {
      ...completion("agent-long", agent.agentId),
      finalMessage: longMessage,
    });

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.equal(first.update.kind, "completion");
    assert.equal(first.update.completion_message_truncated, true);
    assert.ok(Buffer.byteLength(first.update.completion_message, "utf8") <= MAX_AGENT_COMPLETION_HANDOFF_BYTES);
    assert.equal(first.update.completion_message, longMessage.slice(0, first.update.completion_message.length));
    assert.deepEqual(await runtime.waitAgent({ timeout_ms: 0 }), first);
  });
});

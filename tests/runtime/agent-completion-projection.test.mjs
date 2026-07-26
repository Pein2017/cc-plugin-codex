import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import { appendCompletionEvent } from "../../runtime/completion-inbox.mjs";

const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-completion-projection-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, ".claude");
  const codexHome = path.join(root, ".codex");
  const envFile = path.join(root, "runtime.env");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.mkdirSync(codexHome);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  roots.push(root);
  const ownerRootId = "root-agent-completion-projection";
  const runtime = createAgentRuntime({
    cwd: workspace,
    envFile,
    env: {
      CODEX_HOME: codexHome,
      CODEX_THREAD_ID: ownerRootId,
      CC_RUNTIME_HOME: path.join(root, "runtime-home"),
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
    finalMessage: "stored Claude final output that must not be returned",
    resumability: { classification: "resumable", claudeSessionId: `session-${jobId}` },
    detailedResultAvailable: true,
    resultPointer: jobId,
  };
}

describe("Agent completion projection", () => {
  it("returns one redeliverable Agent update without exposing durable final output", async () => {
    const { runtime, workspace, ownerRootId } = setup();
    const agent = runtime.store.createAgent({ task_name: "projection" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    appendCompletionEvent(workspace, ownerRootId, completion("legacy-one-shot"));
    const linked = appendCompletionEvent(workspace, ownerRootId, completion("agent-one", agent.agentId)).event;

    const first = await runtime.waitAgent({ timeout_ms: 0 });
    assert.deepEqual(first, {
      message: "CC Agent activity is available.",
      timedOut: false,
      update: {
        agent_name: agent.path,
        agent_status: { completed: null },
        summary: "Agent turn completed.",
        delivery_token: linked.deliveryToken,
      },
    });
    assert.equal(JSON.stringify(first).includes("stored Claude final output"), false);
    assert.equal(JSON.stringify(first).includes("resultPointer"), false);

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
});

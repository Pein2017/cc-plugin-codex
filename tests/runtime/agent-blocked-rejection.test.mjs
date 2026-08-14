import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";

const roots = [];
const sharedRuntimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-blocked-rejection-home-"));

after(() => fs.rmSync(sharedRuntimeHome, { recursive: true, force: true }));
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-blocked-rejection-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, "claude");
  const envFile = path.join(root, "runtime.env");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  roots.push(root);
  const runtime = createAgentRuntime({
    cwd: workspace,
    envFile,
    env: {
      CODEX_THREAD_ID: "root-agent-blocked-rejection",
      CODEX_HARNESSDOCK_RUNTIME_HOME: sharedRuntimeHome,
      CLAUDE_CONFIG_DIR: claudeConfigDir,
    },
  });
  return { runtime };
}

function blockedAgent(runtime, evidenceReason) {
  const agent = runtime.store.createAgent({
    task_name: "blocked_target",
    selectedModel: "claude-sonnet-5",
  });
  runtime.store.updateAgent(agent.agentId, (current) => ({
    ...current,
    status: "errored",
    continuation: { mode: "blocked", evidence: { reason: evidenceReason, observedAt: current.updatedAt } },
  }));
  return runtime.store.resolveTarget(agent.agentId);
}

describe("Blocked-Agent activation rejection redaction", () => {
  it("redacts send_message and followup_task rejections against the structured worker_reaped fact", async () => {
    const { runtime } = setup();
    const agent = blockedAgent(runtime, "worker_reaped");

    assert.throws(
      () => runtime.sendMessage({ target: agent.agentId, message: "must not queue" }),
      /reason=worker_lost, scope=agent, retry=new_agent/,
    );
    await assert.rejects(
      runtime.followupTask({ target: agent.agentId, message: "must not substitute" }),
      /reason=worker_lost, scope=agent, retry=new_agent/,
    );
  });

  // The exact operator sentences produced today at
  // runtime/job-store.mjs:881-886 and runtime/job-supervisor.mjs:508-511.
  // Reaping now records the structured `worker_reaped` fact above rather than
  // ever surfacing this prose as continuation evidence, but a regression that
  // reintroduced raw-reason interpolation would still be caught here: an
  // unrecognized string resolves to the closed `unclassified` fallback, never
  // to this literal text.
  const reapedControlProcessSentence =
    "Control process 12345 died or changed identity without completing. Auto-reaped.";
  const noLiveWorkerSentence = "No live worker claimed this job before the startup grace period. Auto-reaped.";
  const manualResumeSentence =
    "Automatic recovery budget exhausted. Resume manually with: claude --resume abc-native-session-id";

  for (const [label, evidenceReason] of [
    ["a reaped control-process sentence naming a PID", reapedControlProcessSentence],
    ["a reap sentence with no control process at all", noLiveWorkerSentence],
    ["a manual resume command naming a native session ID", manualResumeSentence],
  ]) {
    it(`redacts send_message and followup_task rejections against ${label}`, async () => {
      const { runtime } = setup();
      const agent = blockedAgent(runtime, evidenceReason);

      assert.throws(
        () => runtime.sendMessage({ target: agent.agentId, message: "must not queue" }),
        (error) => {
          assert.equal(error.message.includes("12345"), false);
          assert.equal(error.message.includes("Control process"), false);
          assert.equal(error.message.includes("Auto-reaped"), false);
          assert.equal(error.message.includes("claude --resume"), false);
          assert.equal(error.message.includes("abc-native-session-id"), false);
          assert.match(error.message, /reason=unclassified, scope=agent, retry=new_agent/);
          return true;
        },
      );

      await assert.rejects(
        runtime.followupTask({ target: agent.agentId, message: "must not substitute" }),
        (error) => {
          assert.equal(error.message.includes("12345"), false);
          assert.equal(error.message.includes("Control process"), false);
          assert.equal(error.message.includes("Auto-reaped"), false);
          assert.equal(error.message.includes("claude --resume"), false);
          assert.equal(error.message.includes("abc-native-session-id"), false);
          assert.match(error.message, /reason=unclassified, scope=agent, retry=new_agent/);
          return true;
        },
      );
    });
  }

  it("redacts a Harness-scoped block with operator_required retry", async () => {
    const { runtime } = setup();
    const agent = blockedAgent(runtime, "auth_or_permission");

    assert.throws(
      () => runtime.sendMessage({ target: agent.agentId, message: "must not queue" }),
      /reason=auth_required, scope=harness, retry=operator_required/,
    );
  });

  it("blocked identity and name remain unusable: no unblock, close, archive, or name-release affordance", async () => {
    const { runtime } = setup();
    const agent = blockedAgent(runtime, "session_drift");
    assert.equal(typeof runtime.unblockAgent, "undefined");
    assert.equal(typeof runtime.closeAgent, "undefined");
    assert.equal(typeof runtime.archiveAgent, "undefined");
    assert.throws(
      () => runtime.sendMessage({ target: agent.agentId, message: "must not queue" }),
      /reason=session_lost, scope=agent, retry=new_agent/,
    );
  });
});

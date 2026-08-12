import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  isClaudeSubscriptionLimit,
  probeInstalledMcp,
  runNativeTeamWitness,
  runPaidSmoke,
  runReleaseSmoke,
} from "../../runtime/release-smoke.mjs";
import { StreamParser } from "../../runtime/claude-headless-adapter.mjs";
import { SOURCE_ROOT } from "../../runtime/version.mjs";

const temporaryDirectories = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function matchingSnapshot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-release-snapshot-"));
  temporaryDirectories.push(root);
  const snapshotRoot = path.join(root, "snapshot");
  const pluginRoot = path.join(SOURCE_ROOT, "plugins", "cc-for-pein");
  fs.cpSync(pluginRoot, snapshotRoot, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  return {
    snapshotRoot,
    installed: {
      pluginId: "cc-for-pein@pein-local",
      version: manifest.version,
      enabled: true,
      source: "local",
      sourcePath: pluginRoot,
      snapshotRoot,
    },
  };
}

describe("release smoke", () => {
  it("validates matching installed Skills and MCP evidence without paid usage by default", async () => {
    const fixture = matchingSnapshot();
    let probeOptions;
    const report = await runReleaseSmoke({
      installed: fixture.installed,
      probeMcp: async (options) => {
        probeOptions = options;
        return {
          healthy: true,
          tools: [
            "spawn_agent", "send_message", "followup_task", "wait_agent",
            "interrupt_agent", "list_agents", "read_agent_messages",
          ],
          agentCount: 0,
          paid: { requested: false, status: "skipped" },
        };
      },
    });
    assert.equal(report.status, "pass");
    assert.equal(report.zeroModelCost, true);
    assert.equal(probeOptions.realClaude, false);
    assert.equal(report.skills.length, 7);
    assert.equal(report.tools.length, 7);
    assert.equal(report.compatibilityShells.valid, true);
    assert.equal(report.compatibilityShells.count, 0);
  });

  it("passes paid intent only when explicitly selected", async () => {
    const fixture = matchingSnapshot();
    let paidStart;
    const report = await runReleaseSmoke({
      installed: fixture.installed,
      realClaude: true,
      onPaidStart(receipt) { paidStart = receipt; },
      probeMcp: async (options) => {
        options.onPaidStart({ model: "claude-haiku-4-5", reasoningEffort: "low", write: false });
        return {
          healthy: true,
          tools: [
            "spawn_agent", "send_message", "followup_task", "wait_agent",
            "interrupt_agent", "list_agents", "read_agent_messages",
          ],
          agentCount: 0,
          paid: { requested: true, status: "completed" },
        };
      },
    });
    assert.equal(report.zeroModelCost, false);
    assert.deepEqual(paidStart, { model: "claude-haiku-4-5", reasoningEffort: "low", write: false });
  });

  it("accepts a bounded discovery-only compatibility shell routed to the checkout", async () => {
    const fixture = matchingSnapshot();
    const previous = path.join(path.dirname(fixture.snapshotRoot), "0.6.0+codex.previous");
    fs.cpSync(path.join(SOURCE_ROOT, "plugins", "cc-for-pein"), previous, { recursive: true });
    const report = await runReleaseSmoke({
      installed: fixture.installed,
      probeMcp: async () => ({
        healthy: true,
        tools: [
          "spawn_agent", "send_message", "followup_task", "wait_agent",
          "interrupt_agent", "list_agents", "read_agent_messages",
        ],
        agentCount: 0,
        paid: { requested: false, status: "skipped" },
      }),
    });
    assert.equal(report.compatibilityShells.valid, true);
    assert.equal(report.compatibilityShells.count, 1);
    assert.equal(report.compatibilityShells.versions[0].canonicalRoute, true);
    assert.equal(report.compatibilityShells.versions[0].cachedRuntimeAbsent, true);
  });

  it("launches the descriptor MCP with isolated list_agents and no model", async () => {
    const report = await probeInstalledMcp({
      snapshotRoot: path.join(SOURCE_ROOT, "plugins", "cc-for-pein"),
      workspace: SOURCE_ROOT,
      callListAgents: true,
    });
    assert.equal(report.healthy, true);
    assert.equal(report.tools.length, 7);
    assert.equal(report.agentCount, 0);
    assert.deepEqual(report.paid, { requested: false, status: "skipped" });
  });

  it("distinguishes subscription exhaustion from a generic HTTP 429", () => {
    assert.equal(isClaudeSubscriptionLimit("You have reached your weekly usage limit"), true);
    assert.equal(isClaudeSubscriptionLimit("HTTP 429 transient rate limit"), false);
  });

  it("runs the paid control flow against a zero-Claude fake transport using the current wait schema", async () => {
    const calls = [];
    const client = {
      async callTool(request) {
        calls.push(request);
        if (request.name === "spawn_agent") {
          return { isError: false, structuredContent: { status: "working" } };
        }
        assert.equal(request.name, "wait_agent");
        assert.deepEqual(request.arguments, {});
        return {
          isError: false,
          structuredContent: {
            update: {
              kind: "completion",
              summary: "Agent turn completed.",
              completion_message: "CC_RELEASE_SMOKE_OK",
              delivery_token: "delivery-fake",
            },
          },
        };
      },
    };
    const result = await runPaidSmoke(client, { threadId: "fake", "codex/sandbox-state-meta": {} }, { maxMs: 5_000 });
    assert.equal(result.status, "completed");
    assert.equal(result.markerObserved, true);
    assert.deepEqual(calls.map((call) => [call.name, call.arguments]), [
      ["spawn_agent", calls[0].arguments],
      ["wait_agent", {}],
    ]);
  });

  it("runs the fake Native Agent Team witness through production Driver/profile/adapter seams", async () => {
    const witness = await runNativeTeamWitness({
      sourceRoot: SOURCE_ROOT,
      runTurnSession: async (request) => {
        assert.equal(request.claudeOptions.model, "claude-opus-5");
        assert.equal(request.claudeOptions.effort, "low");
        assert.equal(request.claudeOptions.delegationMode, "claude_orchestrator");
        assert.deepEqual(Object.keys(request.claudeOptions.agents), ["haiku-scout", "sonnet", "opus"]);
        const parser = new StreamParser({
          delegationMode: request.claudeOptions.delegationMode,
          onNativeTeamWitness: request.claudeOptions.onNativeTeamWitness,
        });
        parser.feed(`${JSON.stringify({
          type: "system", subtype: "init", session_id: "fake-parent",
          tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
          agents: ["haiku-scout", "sonnet", "opus"],
        })}\n`);
        parser.feed(`${JSON.stringify({
          type: "assistant", session_id: "fake-parent", message: { content: [{
            type: "tool_use", id: "fake-spawn", name: "Agent",
            input: { name: "haiku-scout-1", subagent_type: "haiku-scout" },
          }] },
        })}\n`);
        parser.feed(`${JSON.stringify({
          type: "assistant", session_id: "fake-parent", message: { content: [{
            type: "tool_use", id: "fake-sonnet", name: "Agent",
            input: { name: "sonnet-1", subagent_type: "sonnet" },
          }] },
        })}\n`);
        parser.feed(`${JSON.stringify({
          type: "user", session_id: "fake-parent", tool_use_result: { status: "teammate_spawned" },
          message: { content: [{ type: "tool_result", tool_use_id: "fake-spawn" }] },
        })}\n`);
        fs.mkdirSync(path.join(request.cwd, ".claude", "agent-memory-local", "haiku-scout"), { recursive: true });
        fs.writeFileSync(path.join(request.cwd, ".claude", "agent-memory-local", "haiku-scout", "metadata.json"), "fixture");
        return {
          status: "completed", exitCode: 0, sessionId: "fake-parent", finalMessage: "untrusted assistant prose",
          failureClass: null, failureReason: null, resumable: false, recoveryAttempts: 0, attempts: [],
          steering: { messages: [], latestAcknowledgedSequence: 0 },
          runtimeReceipt: { nativeTeamSurface: parser.state.nativeTeamSurface }, toolUses: parser.state.toolUses, touchedFiles: [],
        };
      },
    });
    assert.equal(witness.status, "unverified");
    assert.equal(witness.requestedModels.haikuScout, "claude-haiku-4-5");
    assert.equal(witness.requestedModels.sonnet, "claude-sonnet-5");
    assert.equal(witness.firstSpawnTransport, true);
    assert.deepEqual(witness.effectiveTeammate, { model: "unknown", effort: "unknown", cost: "unknown" });
    assert.deepEqual(witness.disposable.mutation.unauthorizedPaths, []);
    assert.equal(witness.source.unchanged, true);
    assert.deepEqual(witness.missingEvidence.sort(), ["current_team_message", "parent_synthesis", "settled_haiku_scout", "settled_sonnet"]);
  });

  it("stops the native witness on an account limit without a second paid attempt", async () => {
    let attempts = 0;
    const witness = await runNativeTeamWitness({
      sourceRoot: SOURCE_ROOT,
      runTurnSession: async () => {
        attempts += 1;
        return {
          status: "failed", exitCode: 1, sessionId: null, finalMessage: "",
          failureClass: "usage_limit", failureReason: "subscription usage limit reached", resumable: false,
          recoveryAttempts: 0, attempts: [], steering: { messages: [], latestAcknowledgedSequence: 0 },
          runtimeReceipt: {}, toolUses: [], touchedFiles: [],
        };
      },
    });
    assert.equal(attempts, 1);
    assert.equal(witness.status, "account_limit_stopped");
    assert.equal(witness.liveVerified, false);
  });

  it("does not verify a failed Driver terminal turn even when native events claim completion", async () => {
    const witness = await runNativeTeamWitness({
      sourceRoot: SOURCE_ROOT,
      runTurnSession: async () => ({
        status: "failed", exitCode: 1, sessionId: null, finalMessage: "", failureClass: "fatal", failureReason: "failed",
        resumable: false, recoveryAttempts: 0, attempts: [], steering: { messages: [], latestAcknowledgedSequence: 0 }, runtimeReceipt: {}, toolUses: [], touchedFiles: [],
      }),
    });
    assert.equal(witness.liveVerified, false);
    assert.ok(witness.missingEvidence.includes("successful_terminal"));
  });
});

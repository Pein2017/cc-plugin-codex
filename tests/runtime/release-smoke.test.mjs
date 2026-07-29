import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  isClaudeSubscriptionLimit,
  probeInstalledMcp,
  runReleaseSmoke,
} from "../../runtime/release-smoke.mjs";
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
});

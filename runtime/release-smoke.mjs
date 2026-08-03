/** SPDX-License-Identifier: Apache-2.0 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { CC_MCP_TOOL_NAMES, CODEX_SANDBOX_META_KEY } from "./mcp-server.mjs";
import { inspectCompatibilityShells, inspectInstalledPluginParity } from "./plugin-installation.mjs";
import { SOURCE_ROOT } from "./version.mjs";

const REAL_SMOKE_MODEL = "claude-haiku-4-5";
const REAL_SMOKE_EFFORT = "low";
const REAL_SMOKE_MAX_MS = 60 * 60 * 1000;

function exactTools(tools) {
  return JSON.stringify(tools) === JSON.stringify(CC_MCP_TOOL_NAMES);
}

function toolError(result, operation) {
  const text = Array.isArray(result?.content)
    ? result.content.filter((entry) => entry?.type === "text").map((entry) => entry.text).join(" ")
    : "";
  return new Error(`${operation} failed: ${String(text || "unknown MCP error").slice(0, 1_000)}`);
}

function callOptions(timeout) {
  return { timeout, maxTotalTimeout: timeout };
}

export function isClaudeSubscriptionLimit(value) {
  const text = String(value instanceof Error ? value.message : value ?? "");
  return /(?:usage|weekly|monthly|subscription|credit|quota)[\s\S]{0,80}(?:limit|exhaust|deplet)|(?:limit|exhaust)[\s\S]{0,80}(?:usage|weekly|monthly|subscription|credit|quota)/i.test(text);
}

function paidSmokeError(error) {
  if (!isClaudeSubscriptionLimit(error)) return error;
  const bounded = new Error("Claude subscription or usage limit reached; paid CC testing stopped.");
  /** @type {any} */ (bounded).code = "CLAUDE_SUBSCRIPTION_LIMIT";
  return bounded;
}

export async function runPaidSmoke(client, meta, options = {}) {
  const taskName = `release_smoke_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  let spawned;
  try {
    spawned = await client.callTool({
      name: "spawn_agent",
      arguments: {
        task_name: taskName,
        message: "Inspect your available native tools, use Bash to run pwd without modifying anything, and do not delegate. If Workflow is unavailable, reply exactly CC_RELEASE_SMOKE_OK. If Workflow is available, reply exactly CC_RELEASE_SMOKE_WORKFLOW_VISIBLE.",
        description: "Explicit paid release acceptance smoke",
        model: REAL_SMOKE_MODEL,
        reasoning_effort: REAL_SMOKE_EFFORT,
        write: false,
      },
      _meta: meta,
    }, undefined, callOptions(60_000));
  } catch (error) {
    throw paidSmokeError(error);
  }
  if (spawned?.isError) throw paidSmokeError(toolError(spawned, "spawn_agent"));

  const deadline = Date.now() + (options.maxMs ?? REAL_SMOKE_MAX_MS);
  while (Date.now() < deadline) {
    const timeoutMs = Math.min(600_000, Math.max(0, deadline - Date.now()));
    let waited;
    try {
      // The model-facing schema has a fixed completion-first wait. Keep the
      // outer smoke deadline as a transport bound, never as a private MCP
      // timeout argument that the public tool deliberately does not accept.
      waited = await client.callTool({
        name: "wait_agent",
        arguments: {},
        _meta: meta,
      }, undefined, callOptions(timeoutMs + 60_000));
    } catch (error) {
      throw paidSmokeError(error);
    }
    if (waited?.isError) throw paidSmokeError(toolError(waited, "wait_agent"));
    const update = waited?.structuredContent?.update;
    if (update?.kind !== "completion") continue;
    const message = String(update.completion_message ?? "");
    if (isClaudeSubscriptionLimit(`${update.summary ?? ""}\n${message}`)) {
      throw paidSmokeError(new Error(`${update.summary ?? ""} ${message}`));
    }
    if (!message.includes("CC_RELEASE_SMOKE_OK")) {
      throw new Error("Haiku release smoke completed without the expected marker.");
    }
    // This is the final wait in the smoke. Completion acknowledgement is
    // conditional: a caller that ends after consuming the handoff does not
    // need an acknowledgement-only call.
    return {
      requested: true,
      model: REAL_SMOKE_MODEL,
      reasoningEffort: REAL_SMOKE_EFFORT,
      write: false,
      status: "completed",
      markerObserved: true,
    };
  }
  throw new Error("Haiku release smoke exceeded the one-hour observation bound.");
}

export async function probeInstalledMcp(options = {}) {
  const snapshotRoot = fs.realpathSync.native(options.snapshotRoot);
  const workspace = fs.realpathSync.native(options.workspace ?? SOURCE_ROOT);
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-for-pein-release-smoke-"));
  const threadId = `cc-release-smoke-${randomBytes(12).toString("hex")}`;
  const meta = {
    threadId,
    [CODEX_SANDBOX_META_KEY]: { sandboxCwd: pathToFileURL(workspace).href },
  };
  const descriptor = JSON.parse(fs.readFileSync(path.join(snapshotRoot, ".mcp.json"), "utf8"))?.mcpServers?.cc_for_pein;
  if (
    descriptor?.cwd !== SOURCE_ROOT ||
    descriptor?.args?.[1] !== path.join(SOURCE_ROOT, "plugins", "cc-for-pein", "bootstrap", "cc-mcp.mjs")
  ) {
    throw new Error("Installed MCP descriptor does not launch the canonical checkout bootstrap directly.");
  }
  const transport = new StdioClientTransport({
    command: descriptor.command === "node" ? process.execPath : descriptor.command,
    args: descriptor.args,
    cwd: descriptor.cwd,
    env: {
      ...(options.env ?? process.env),
      CC_RUNTIME_HOME: runtimeHome,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "cc-for-pein-release-smoke", version: "1.0.0" });
  let paidStarted = false;
  let paidCompleted = false;
  try {
    await client.connect(transport);
    const listed = await client.listTools(undefined, callOptions(60_000));
    const tools = listed.tools.map((tool) => tool.name);
    let agentCount = null;
    if (options.callListAgents !== false) {
      const result = await client.callTool({ name: "list_agents", arguments: {}, _meta: meta }, undefined, callOptions(60_000));
      if (result?.isError) throw toolError(result, "list_agents");
      const agents = /** @type {any} */ (result?.structuredContent)?.agents;
      if (!Array.isArray(agents)) throw new Error("list_agents returned no structured Agent array.");
      agentCount = agents.length;
      if (agentCount !== 0) throw new Error("Isolated release-smoke root unexpectedly contains Agents.");
    }
    let paid = { requested: false, status: "skipped" };
    if (options.realClaude === true) {
      paidStarted = true;
      options.onPaidStart?.({ model: REAL_SMOKE_MODEL, reasoningEffort: REAL_SMOKE_EFFORT, write: false });
      paid = await runPaidSmoke(client, meta, { maxMs: options.realClaudeMaxMs });
      paidCompleted = true;
    }
    return {
      healthy: exactTools(tools) && (agentCount == null || agentCount === 0),
      tools,
      agentCount,
      paid,
    };
  } finally {
    await client.close().catch(() => {});
    if (!paidStarted || paidCompleted) {
      fs.rmSync(runtimeHome, { recursive: true, force: true });
    }
  }
}

function installedSkills(snapshotRoot) {
  const skillsRoot = path.join(snapshotRoot, "skills");
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

export async function runReleaseSmoke(options = {}) {
  const parity = inspectInstalledPluginParity({
    checkout: options.checkout ?? SOURCE_ROOT,
    cwd: options.workspace ?? SOURCE_ROOT,
    env: options.env ?? process.env,
    spawnSyncImpl: options.spawnSyncImpl,
    codexExecutable: options.codexExecutable,
    installed: options.installed,
  });
  if (!parity.parity) {
    throw new Error(
      "Installed Plugin snapshot is stale. Run npm run refresh:local for same-generation discovery edits, " +
      "or npm run release:local after a release/API-generation change."
    );
  }
  const skills = installedSkills(parity.installed.snapshotRoot);
  const expectedSkills = [
    "followup-task",
    "interrupt-agent",
    "list-agents",
    "read-agent-messages",
    "send-message",
    "spawn-agent",
    "wait-agent",
  ];
  if (JSON.stringify(skills) !== JSON.stringify(expectedSkills)) {
    throw new Error(`Installed Plugin does not expose exactly seven canonical Skills: ${skills.join(", ")}.`);
  }
  const compatibilityShells = inspectCompatibilityShells({
    snapshotRoot: parity.installed.snapshotRoot,
    currentVersion: parity.installed.version,
  });
  if (!compatibilityShells.valid) {
    throw new Error("Plugin compatibility shells are unbounded or do not delegate exclusively to the canonical checkout.");
  }
  const mcp = await (options.probeMcp ?? probeInstalledMcp)({
    snapshotRoot: parity.installed.snapshotRoot,
    workspace: options.workspace ?? SOURCE_ROOT,
    env: options.env ?? process.env,
    callListAgents: true,
    realClaude: options.realClaude === true,
    realClaudeMaxMs: options.realClaudeMaxMs,
    onPaidStart: options.onPaidStart,
  });
  if (!mcp.healthy) throw new Error("Installed MCP smoke did not satisfy the seven-tool contract.");
  return {
    version: 1,
    status: "pass",
    zeroModelCost: options.realClaude !== true,
    installedVersion: parity.installed.version,
    installedSnapshot: parity.installed.snapshotRoot,
    skills,
    tools: mcp.tools,
    listAgents: { isolated: true, agentCount: mcp.agentCount },
    compatibilityShells,
    paid: mcp.paid,
  };
}

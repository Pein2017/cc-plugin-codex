/** SPDX-License-Identifier: Apache-2.0 */
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { CC_MCP_TOOL_NAMES, CODEX_SANDBOX_META_KEY } from "./mcp-server.mjs";
import { createClaudeCodeDriver } from "./claude-code-driver.mjs";
import { buildArgs } from "./claude-headless-adapter.mjs";
import { createExecutionProfile } from "./execution-profile.mjs";
import { inspectCompatibilityShells, inspectInstalledPluginParity } from "./plugin-installation.mjs";
import { CANONICAL_RUNTIME_CHECKOUT, SOURCE_ROOT } from "./version.mjs";

const REAL_SMOKE_MODEL = "claude-haiku-4-5";
const REAL_SMOKE_EFFORT = "low";
const REAL_SMOKE_MAX_MS = 60 * 60 * 1000;
const NATIVE_TEAM_WITNESS_MEMORY_PREFIXES = Object.freeze([
  ".claude/agent-memory-local/haiku-scout",
  ".claude/agent-memory-local/sonnet",
]);
const MAX_NATIVE_TEAM_WITNESS_EVENTS = 32;
const MAX_NATIVE_TEAM_WITNESS_NAME_BYTES = 96;
const SAFE_WITNESS_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function gitStatus(cwd) {
  const result = spawnSync("git", ["-C", cwd, "status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("Native-team witness requires a Git workspace.");
  return String(result.stdout ?? "");
}

function initializeWitnessWorkspace() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cc-native-team-witness-"));
  const init = spawnSync("git", ["-C", cwd, "init", "--quiet"], { encoding: "utf8" });
  if (init.status !== 0) {
    fs.rmSync(cwd, { recursive: true, force: true });
    throw new Error("Native-team witness could not initialize its disposable Git workspace.");
  }
  fs.writeFileSync(path.join(cwd, "README.md"), "# Native Agent Team witness fixture\n", "utf8");
  for (const prefix of NATIVE_TEAM_WITNESS_MEMORY_PREFIXES) {
    fs.mkdirSync(path.join(cwd, prefix), { recursive: true });
  }
  return cwd;
}

function snapshotWorkspacePaths(root, options = {}) {
  const snapshot = new Map();
  const visit = (relative) => {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    const allowedMemory = options.allowMemory !== false && nativeMemoryPathAllowed(relative);
    const metadata = {
      type: stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file",
      size: stat.size,
      mode: stat.mode,
    };
    if (!stat.isDirectory()) metadata.mtimeMs = stat.mtimeMs;
    if (!allowedMemory && stat.isFile()) {
      metadata.sha256 = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    }
    snapshot.set(relative || ".", metadata);
    // The exception is local-memory-only: retain the root directory metadata
    // but never enumerate or open its children.
    if (!stat.isDirectory() || (options.allowMemory !== false && nativeMemoryRoot(relative))) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!relative && entry.name === ".git") continue;
      visit(relative ? path.join(relative, entry.name) : entry.name);
    }
  };
  visit("");
  return snapshot;
}

function changedSnapshotPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((relative) => JSON.stringify(before.get(relative) ?? null) !== JSON.stringify(after.get(relative) ?? null)).sort();
}

function nativeMemoryPathAllowed(relative) {
  const normalized = String(relative ?? "").replaceAll("\\", "/");
  return NATIVE_TEAM_WITNESS_MEMORY_PREFIXES.some((prefix) =>
    normalized.startsWith(`${prefix}/`)
  );
}

function nativeMemoryRoot(relative) {
  const normalized = String(relative ?? "").replaceAll("\\", "/");
  return NATIVE_TEAM_WITNESS_MEMORY_PREFIXES.includes(normalized);
}

function assertWitnessMemoryRoots(cwd) {
  for (const prefix of NATIVE_TEAM_WITNESS_MEMORY_PREFIXES) {
    let ancestor = cwd;
    for (const segment of prefix.split("/")) {
      ancestor = path.join(ancestor, segment);
      let stat;
      try {
        stat = fs.lstatSync(ancestor);
      } catch {
        throw new Error("Native-team witness memory ancestor must be an in-workspace directory.");
      }
      if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(cwd, ancestor).startsWith("..")) {
        throw new Error("Native-team witness memory ancestor must be an in-workspace directory.");
      }
    }
  }
}

function safeWitnessName(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && Buffer.byteLength(text, "utf8") <= MAX_NATIVE_TEAM_WITNESS_NAME_BYTES && SAFE_WITNESS_NAME.test(text)
    ? text : null;
}

function boundedWitnessEvent(fact) {
  if (!fact || typeof fact !== "object") return null;
  switch (fact.type) {
    case "native_team_member_requested":
      return safeWitnessName(fact.memberName) && safeWitnessName(fact.memberType)
        ? { type: fact.type, memberName: safeWitnessName(fact.memberName), memberType: safeWitnessName(fact.memberType) }
        : null;
    case "native_team_surface":
      return { type: fact.type, observed: fact.observed === true };
    case "native_team_transport":
      return { type: fact.type, teamTransportLiveValidated: fact.teamTransportLiveValidated === true };
    case "native_team_message":
      return { type: fact.type, sameTeamRecipient: fact.sameTeamRecipient === true };
    case "native_team_settled":
      return safeWitnessName(fact.memberName) && ["idle", "completed", "failed"].includes(fact.signal)
        ? { type: fact.type, memberName: safeWitnessName(fact.memberName), signal: fact.signal }
        : null;
    case "native_team_parent_synthesis":
      return { type: fact.type };
    case "native_team_witness_overflow":
      return { type: fact.type };
    default:
      return null;
  }
}

/**
 * Run one explicitly selected native-team witness through the production
 * Driver/profile/adapter seam. The fake-test seam supplies `runTurnSession`;
 * it has no MCP, IPC, durable teammate state, or memory-content access.
 */
export async function runNativeTeamWitness(options = {}) {
  const sourceRoot = fs.realpathSync.native(options.sourceRoot ?? SOURCE_ROOT);
  const sourceBefore = gitStatus(sourceRoot);
  // Both source and disposable snapshots deliberately omit memory file
  // contents. Non-memory files retain hashes and metadata for dirty-source
  // detection without treating local native memory as evidence.
  const sourceSnapshotBefore = snapshotWorkspacePaths(sourceRoot);
  const cwd = initializeWitnessWorkspace();
  // Internal fixture hook for zero-Claude tests; it is not routed from MCP.
  if (typeof options.prepareWorkspace === "function") options.prepareWorkspace(cwd);
  const before = snapshotWorkspacePaths(cwd);
  let memoryRootsValid = true;
  try {
    assertWitnessMemoryRoots(cwd);
  } catch {
    memoryRootsValid = false;
  }
  const events = [];
  const requestedMembers = new Map();
  let requestedModelHaiku = null;
  let requestedModelSonnet = null;
  const settledMembers = new Set();
  let firstSpawnTransport = false;
  let sameTeamMessage = false;
  let parentSynthesis = false;
  let witnessOverflow = false;
  let turn;
  const witnessRoute = {
    model: "claude-opus-5", effort: "low", write: false, delegationMode: "claude_orchestrator",
  };
  if (memoryRootsValid) try {
    const driver = options.driver ?? createClaudeCodeDriver();
    const env = {
      ...process.env,
      ...(options.env ?? {}),
      CLAUDE_CONFIG_DIR: options.env?.CLAUDE_CONFIG_DIR ?? path.join(cwd, ".claude-config"),
    };
    const profile = createExecutionProfile({ ...witnessRoute, env, jobId: "native-team-witness" });
    try {
      // Exercise the same production profile and adapter serialization that the
      // Driver uses. This records requested definitions, never effective facts.
      buildArgs("witness", { agents: profile.claudeOptions.agents });
      const agents = profile.claudeOptions.agents;
      requestedModelHaiku = agents["haiku-scout"]?.model ?? null;
      requestedModelSonnet = agents.sonnet?.model ?? null;
    } finally {
      profile.cleanup();
    }
    turn = await driver.startTurn({
      workspaceRoot: cwd,
      cwd,
      jobId: "native-team-witness",
      prompt: "Use one Haiku scout with intended effort low and one Sonnet reviewer with intended effort low; return one parent synthesis.",
      route: witnessRoute,
      env,
      launchContext: {
        compatibility: {
          fingerprint: "native-team-witness-fixture",
          executable: options.executable ?? process.execPath,
        },
      },
      onNativeTeamWitness: (fact) => {
        const event = boundedWitnessEvent(fact);
        if (!event) return;
        if (events.length >= MAX_NATIVE_TEAM_WITNESS_EVENTS) {
          witnessOverflow = true;
          return;
        }
        events.push(event);
        if (event.type === "native_team_witness_overflow") witnessOverflow = true;
        if (event.type === "native_team_member_requested") requestedMembers.set(event.memberType, event.memberName);
        if (event.type === "native_team_transport") firstSpawnTransport ||= event.teamTransportLiveValidated;
        if (event.type === "native_team_message") sameTeamMessage ||= event.sameTeamRecipient;
        if (event.type === "native_team_settled") settledMembers.add(event.memberName);
        if (event.type === "native_team_parent_synthesis") parentSynthesis = true;
      },
      ...(typeof options.runTurnSession === "function" ? { runTurnSession: options.runTurnSession } : {}),
    });
  } finally {
    // Take the immutable path-level snapshot before optional cleanup. This does
    // not open any native-memory file, including allowed paths.
  }
  const after = snapshotWorkspacePaths(cwd);
  const changedPaths = changedSnapshotPaths(before, after);
  const unauthorizedPaths = changedPaths.filter((relative) => !nativeMemoryPathAllowed(relative));
  const sourceAfter = gitStatus(sourceRoot);
  const sourceSnapshotAfter = snapshotWorkspacePaths(sourceRoot);
  const sourceChangedPaths = changedSnapshotPaths(sourceSnapshotBefore, sourceSnapshotAfter);
  const accountLimit = isClaudeSubscriptionLimit(`${turn?.failure?.reason ?? ""}\n${turn?.failure?.detail ?? ""}`);
  const requestedModels = { haikuScout: requestedModelHaiku, sonnet: requestedModelSonnet };
  const successfulTerminal = turn?.status === "completed" && turn?.failure?.class == null && turn?.exitStatus === 0;
  const missingEvidence = [
    ...(memoryRootsValid ? [] : ["memory_root_invalid"]),
    ...(witnessOverflow ? ["witness_event_overflow"] : []),
    ...(successfulTerminal ? [] : ["successful_terminal"]),
    ...(requestedMembers.has("haiku-scout") ? [] : ["requested_haiku_scout"]),
    ...(requestedMembers.has("sonnet") ? [] : ["requested_sonnet"]),
    ...(firstSpawnTransport ? [] : ["first_spawn_transport"]),
    ...(sameTeamMessage ? [] : ["current_team_message"]),
    ...(settledMembers.has(requestedMembers.get("haiku-scout")) ? [] : ["settled_haiku_scout"]),
    ...(settledMembers.has(requestedMembers.get("sonnet")) ? [] : ["settled_sonnet"]),
    ...(parentSynthesis ? [] : ["parent_synthesis"]),
  ];
  const status = accountLimit ? "account_limit_stopped" : (unauthorizedPaths.length || sourceBefore !== sourceAfter || sourceChangedPaths.length || missingEvidence.length ? "unverified" : "verified");
  const report = {
    status,
    liveVerified: status === "verified",
    requestedModels,
    intendedEffort: { haikuScout: "low", sonnet: "low" },
    effectiveTeammate: { model: "unknown", effort: "unknown", cost: "unknown" },
    firstSpawnTransport,
    missingEvidence,
    events,
    source: { unchanged: sourceBefore === sourceAfter && sourceChangedPaths.length === 0, statusBefore: sourceBefore, statusAfter: sourceAfter, changedPaths: sourceChangedPaths },
    disposable: {
      gitStatus: gitStatus(cwd),
      snapshot: { beforePathCount: before.size, afterPathCount: after.size },
      mutation: { changedPaths, unauthorizedPaths, allowedMemoryPrefixes: [...NATIVE_TEAM_WITNESS_MEMORY_PREFIXES] },
    },
  };
  if (options.keepWorkspace !== true) fs.rmSync(cwd, { recursive: true, force: true });
  return report;
}

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
    descriptor?.cwd !== CANONICAL_RUNTIME_CHECKOUT ||
    descriptor?.args?.[1] !== path.join(CANONICAL_RUNTIME_CHECKOUT, "plugins", "cc-for-pein", "bootstrap", "cc-mcp.mjs")
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

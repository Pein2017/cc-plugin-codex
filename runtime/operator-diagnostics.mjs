/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only operator diagnostics. This module never calls lifecycle
 * reconciliation or persistence helpers.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getClaudeAvailability,
  resolveClaudeExecutable,
} from "./claude-headless-adapter.mjs";
import { observeClaudeCredentialState } from "./claude-credential-state.mjs";
import { diagnoseClaudeCompatibility } from "./claude-version-compatibility.mjs";
import { resolveRuntimeEnvironment } from "./environment.mjs";
import {
  inspectCompatibilityShells,
  inspectInstalledPluginParity,
} from "./plugin-installation.mjs";
import { CANONICAL_RUNTIME_CHECKOUT, PACKAGE_VERSION, SOURCE_ROOT } from "./version.mjs";

export const CANONICAL_CHECKOUT = CANONICAL_RUNTIME_CHECKOUT;
export const EXPECTED_CLAUDE_CONFIG_DIR = "/data/CoordExp/.claude";
export const EXPECTED_PROXY = "http://127.0.0.1:9090";
export const CLAUDE_HISTORY_OBSERVATION_DAYS = 30;
const STALE_ARTIFACT_MS = 60 * 60 * 1000;
const MAX_TERMINAL_JOBS_PER_OWNER = 100;
const MAX_CANDIDATE_DETAILS = 100;
const MAX_RECORD_ERRORS = 50;
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "interrupted", "cancelled", "unknown"]);
const REQUIRED_DEPENDENCIES = ["@modelcontextprotocol/sdk/server/mcp.js", "zod"];

function bounded(value, max = 500) {
  return String(value ?? "").replaceAll("\0", "").trim().slice(0, max);
}

function increment(target, key) {
  const normalized = bounded(key || "missing", 80) || "missing";
  target[normalized] = (target[normalized] ?? 0) + 1;
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function walkFiles(root, options = {}) {
  const files = [];
  const boundaryErrors = [];
  const limit = options.limit ?? 200_000;
  if (!fs.existsSync(root)) return { files, boundaryErrors };
  const visit = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      boundaryErrors.push(path.relative(root, directory) || ".");
      return;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (!isWithin(root, target)) {
        boundaryErrors.push(path.relative(root, target));
        continue;
      }
      if (entry.isSymbolicLink()) {
        boundaryErrors.push(path.relative(root, target));
        continue;
      }
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) {
        try {
          files.push({
            absolute: target,
            relative: path.relative(root, target),
            stat: fs.statSync(target),
          });
        } catch {
          boundaryErrors.push(path.relative(root, target));
        }
      }
      if (files.length > limit) throw new Error(`Storage inventory exceeds ${limit} files.`);
    }
  };
  visit(root);
  return { files, boundaryErrors };
}

function readControlRecord(file, malformed) {
  try {
    return JSON.parse(fs.readFileSync(file.absolute, "utf8"));
  } catch {
    if (malformed.length < MAX_RECORD_ERRORS) malformed.push(file.relative);
    return null;
  }
}

function safeIso(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function storedTimestamp(record, stat) {
  const timestamps = [record?.createdAt, record?.updatedAt, record?.startedAt]
    .map((value) => Date.parse(value ?? ""))
    .filter(Number.isFinite);
  return timestamps.length > 0 ? Math.max(...timestamps) : stat.mtimeMs;
}

function candidateEntry(file, reason, pluginDataRoot) {
  if (!isWithin(pluginDataRoot, file.absolute)) return null;
  return { path: path.relative(pluginDataRoot, file.absolute), reason };
}

function inspectClaudeHistory(claudeConfigDir, nowMs) {
  const projectsRoot = path.join(claudeConfigDir, "projects");
  const { files, boundaryErrors } = walkFiles(projectsRoot);
  const sessions = files.filter((file) => file.relative.endsWith(".jsonl"));
  const cutoff = nowMs - CLAUDE_HISTORY_OBSERVATION_DAYS * 24 * 60 * 60 * 1000;
  const mtimes = sessions.map((file) => file.stat.mtimeMs);
  return {
    configDir: path.resolve(claudeConfigDir),
    observationDays: CLAUDE_HISTORY_OBSERVATION_DAYS,
    sessionFiles: sessions.length,
    totalBytes: sessions.reduce((total, file) => total + file.stat.size, 0),
    olderThanObservationWindow: sessions.filter((file) => file.stat.mtimeMs < cutoff).length,
    oldestAt: mtimes.length > 0 ? safeIso(Math.min(...mtimes)) : null,
    newestAt: mtimes.length > 0 ? safeIso(Math.max(...mtimes)) : null,
    boundaryErrors: boundaryErrors.length,
    pluginCleanupCandidates: 0,
  };
}

export function inspectOperatorStorage(options = {}) {
  const env = options.env ?? process.env;
  const codexHome = path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  const pluginDataRoot = path.resolve(options.pluginDataRoot ?? path.join(codexHome, "plugins", "data", "cc"));
  const stateRoot = path.join(pluginDataRoot, "state");
  const runtimeRoot = path.join(pluginDataRoot, "runtime");
  const nowMs = options.nowMs ?? Date.now();
  const state = walkFiles(stateRoot);
  const runtime = walkFiles(runtimeRoot);
  const malformed = [];
  const agentStatuses = {};
  const jobStatuses = {};
  const jobs = [];
  const completionJobIds = new Set();
  let registries = 0;
  let agents = 0;
  let inboxes = 0;
  let completionEvents = 0;
  let unreadCompletionEvents = 0;
  let jobLogs = 0;

  for (const file of state.files) {
    if (file.relative.endsWith(".log") && file.relative.includes(`${path.sep}jobs${path.sep}`)) {
      jobLogs += 1;
      continue;
    }
    if (/agent-registry[/\\]roots[/\\][^/\\]+[/\\]registry\.json$/.test(file.relative)) {
      const record = readControlRecord(file, malformed);
      if (!record) continue;
      registries += 1;
      const values = record.agents && typeof record.agents === "object" && !Array.isArray(record.agents)
        ? Object.values(record.agents)
        : [];
      agents += values.length;
      for (const agent of values) increment(agentStatuses, agent?.status);
      continue;
    }
    if (/completion-inboxes[/\\][^/\\]+[/\\]inbox\.json$/.test(file.relative)) {
      const record = readControlRecord(file, malformed);
      if (!record) continue;
      inboxes += 1;
      const events = Array.isArray(record.events) ? record.events : [];
      completionEvents += events.length;
      const cursor = Number(record.acknowledgedThrough ?? 0);
      unreadCompletionEvents += events.filter((event) => Number(event?.sequence ?? 0) > cursor).length;
      for (const event of events) {
        if (typeof event?.jobId === "string" && event.jobId) completionJobIds.add(event.jobId);
      }
      continue;
    }
    const jobMatch = /^([^/\\]+)[/\\]jobs[/\\]([^/\\]+)\.json$/.exec(file.relative);
    if (!jobMatch) continue;
    const record = readControlRecord(file, malformed);
    if (!record) continue;
    increment(jobStatuses, record.status);
    jobs.push({
      file,
      workspace: jobMatch[1],
      id: typeof record.id === "string" && record.id ? record.id : jobMatch[2],
      status: record.status,
      owner: typeof record.ownerRootId === "string" && record.ownerRootId
        ? record.ownerRootId
        : typeof record.sessionId === "string" && record.sessionId
          ? record.sessionId
          : "__no_session__",
      hasOwner: Boolean(record.ownerRootId || record.sessionId),
      agentId: typeof record.agentId === "string" && record.agentId ? record.agentId : null,
      projectionReady: Boolean(record.agentProjectionReconciledAt),
      preClaude: record.preClaudeLaunch === true,
      timestamp: storedTimestamp(record, file.stat),
    });
  }

  const candidates = [];
  const allPluginFiles = [...state.files, ...runtime.files];
  for (const file of allPluginFiles) {
    const stale = nowMs - file.stat.mtimeMs > STALE_ARTIFACT_MS;
    if (!stale) continue;
    const reservation = file.relative.endsWith(".reserve");
    const atomicTemporary = /(?:^|[/\\])[^/\\]+\.tmp\./.test(file.relative);
    if (!reservation && !atomicTemporary) continue;
    const entry = candidateEntry(file, reservation ? "stale-reservation" : "stale-atomic-temp", pluginDataRoot);
    if (entry) candidates.push(entry);
  }

  const buckets = new Map();
  for (const job of jobs) {
    if (!TERMINAL_JOB_STATUSES.has(job.status)) continue;
    const key = `${job.workspace}\0${job.owner}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(job);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => right.timestamp - left.timestamp);
    for (const job of bucket.slice(MAX_TERMINAL_JOBS_PER_OWNER)) {
      const completionReady = job.preClaude
        ? true
        : job.hasOwner
          ? completionJobIds.has(job.id)
          : !job.agentId;
      const projectionReady = !job.agentId || job.projectionReady;
      if (!completionReady || !projectionReady) continue;
      const entry = candidateEntry(job.file, "terminal-job-beyond-owner-retention", pluginDataRoot);
      if (entry) candidates.push(entry);
      const logFile = {
        absolute: job.file.absolute.replace(/\.json$/, ".log"),
        relative: job.file.relative.replace(/\.json$/, ".log"),
      };
      if (fs.existsSync(logFile.absolute)) {
        const logEntry = candidateEntry(logFile, "log-for-terminal-job-beyond-owner-retention", pluginDataRoot);
        if (logEntry) candidates.push(logEntry);
      }
    }
  }

  let workspaceStateRoots = 0;
  try {
    workspaceStateRoots = fs.readdirSync(stateRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).length;
  } catch {}
  const claudeConfigDir = path.resolve(options.claudeConfigDir ?? EXPECTED_CLAUDE_CONFIG_DIR);
  return {
    pluginDataRoot,
    readOnly: true,
    runtime: {
      workspaceStateRoots,
      files: allPluginFiles.length,
      totalBytes: allPluginFiles.reduce((total, file) => total + file.stat.size, 0),
      runtimeFiles: runtime.files.length,
      agentRegistries: registries,
      agents,
      agentStatuses,
      jobs: jobs.length,
      jobStatuses,
      jobLogs,
      completionInboxes: inboxes,
      completionEvents,
      unreadCompletionEvents,
      malformedRecords: malformed.length,
      malformedRecordExamples: malformed,
      boundaryErrors: state.boundaryErrors.length + runtime.boundaryErrors.length,
    },
    cleanup: {
      dryRun: true,
      candidateCount: candidates.length,
      candidates: candidates.slice(0, MAX_CANDIDATE_DETAILS),
      truncated: candidates.length > MAX_CANDIDATE_DETAILS,
    },
    claudeHistory: inspectClaudeHistory(claudeConfigDir, nowMs),
  };
}

function inspectDependencies(checkout, options = {}) {
  const resolve = options.resolve ?? createRequire(path.join(checkout, "package.json")).resolve;
  const missing = [];
  for (const dependency of REQUIRED_DEPENDENCIES) {
    try { resolve(dependency); } catch { missing.push(dependency); }
  }
  return { required: REQUIRED_DEPENDENCIES.length, missing };
}

function inspectAuth(cwd, env, options = {}) {
  const credential = (options.observeCredentialImpl ?? observeClaudeCredentialState)({
    env,
    nowMs: options.nowMs,
  });
  if (env.ANTHROPIC_API_KEY) {
    return {
      loggedIn: true,
      liveValidated: false,
      authMethod: "api-key",
      apiProvider: null,
      subscriptionType: null,
      credential,
    };
  }
  const executable = options.executable ?? resolveClaudeExecutable({ env });
  const result = (options.spawnSyncImpl ?? spawnSync)(executable, ["auth", "status", "--json"], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  if (result?.error || result?.status !== 0) {
    return {
      loggedIn: false,
      liveValidated: false,
      authMethod: null,
      apiProvider: null,
      subscriptionType: null,
      credential,
    };
  }
  let parsed = {};
  try { parsed = JSON.parse(result.stdout); } catch {}
  const publicText = (value) => {
    const text = bounded(value, 80);
    return text && /^[A-Za-z0-9 ._+:/-]+$/.test(text) ? text : null;
  };
  return {
    loggedIn: parsed.loggedIn === true,
    liveValidated: false,
    authMethod: publicText(parsed.authMethod),
    apiProvider: publicText(parsed.apiProvider),
    subscriptionType: publicText(parsed.subscriptionType),
    credential,
  };
}

function makeCheck(id, status, summary, details = null, recovery = null) {
  return {
    id,
    status,
    summary: bounded(summary, 800),
    ...(details == null ? {} : { details }),
    ...(recovery == null ? {} : { recovery: bounded(recovery, 800) }),
  };
}

function failedCheck(id, error, recovery = null) {
  return makeCheck(id, "fail", bounded(error instanceof Error ? error.message : error, 800), null, recovery);
}

function fixedEnvironment(cwd, options = {}) {
  const envFile = path.join(SOURCE_ROOT, "config", "runtime.env");
  const resolved = resolveRuntimeEnvironment({ cwd, envFile, env: options.env ?? process.env });
  const env = resolved.env;
  const proxyKeys = ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"];
  const proxyMatches = proxyKeys.every((key) => env[key] === EXPECTED_PROXY);
  const configMatches = (
    env.CLAUDE_CONFIG_DIR === EXPECTED_CLAUDE_CONFIG_DIR &&
    env.CLAUDE_NATIVE_CONFIG_DIR === EXPECTED_CLAUDE_CONFIG_DIR
  );
  const noProxyMatches = env.no_proxy === "127.0.0.1,localhost" && env.NO_PROXY === "127.0.0.1,localhost";
  const condaConfigured = Boolean(String(env.CONDA_EXE ?? "").trim());
  return {
    env,
    receipt: {
      envFile,
      claudeConfigDir: env.CLAUDE_CONFIG_DIR,
      proxyEndpoint: EXPECTED_PROXY,
      proxyMatches,
      configMatches,
      noProxyMatches,
      condaConfigured,
    },
    healthy: proxyMatches && configMatches && noProxyMatches && condaConfigured,
  };
}

export async function runDoctor(options = {}) {
  const cwd = path.resolve(options.cwd ?? SOURCE_ROOT);
  const expectedCheckout = path.resolve(options.expectedCheckout ?? CANONICAL_CHECKOUT);
  const checks = [];
  let environment = null;
  let installation = null;
  let dependencies = null;

  try {
    const canonical = fs.realpathSync.native(SOURCE_ROOT);
    const healthy = canonical === expectedCheckout && cwd === expectedCheckout;
    checks.push(makeCheck(
      "checkout",
      healthy ? "pass" : "fail",
      healthy ? `Canonical checkout ${canonical} is active.` : `Expected ${expectedCheckout}, found ${canonical} with cwd ${cwd}.`,
      { packageVersion: PACKAGE_VERSION },
      healthy ? null : `Run doctor from ${expectedCheckout}.`,
    ));
  } catch (error) {
    checks.push(failedCheck("checkout", error, `Restore the canonical checkout at ${CANONICAL_CHECKOUT}.`));
  }

  try {
    installation = inspectInstalledPluginParity({
      checkout: SOURCE_ROOT,
      cwd,
      env: options.env ?? process.env,
      spawnSyncImpl: options.spawnSyncImpl,
      codexExecutable: options.codexExecutable,
    });
    checks.push(makeCheck(
      "plugin-installation",
      installation.parity ? "pass" : "fail",
      installation.parity
        ? `Installed ${installation.manifestVersion} snapshot matches the checkout.`
        : "Installed Plugin source, version, or discovery content does not match the checkout.",
      {
        installedVersion: installation.installed.version,
        sourceMatches: installation.sourceMatches,
        versionMatches: installation.versionMatches,
        contentMatches: installation.contentMatches,
        checkoutFiles: installation.checkoutFileCount,
        snapshotFiles: installation.snapshotFileCount,
      },
      installation.parity
        ? null
        : "Run npm run refresh:local for same-generation discovery edits, or npm run release:local after a release/API-generation change; then start a new Codex task.",
    ));
  } catch (error) {
    checks.push(failedCheck("plugin-installation", error, "Run npm run install:local or npm run refresh:local."));
  }

  if (installation?.installed) {
    try {
      const shells = inspectCompatibilityShells({
        snapshotRoot: installation.installed.snapshotRoot,
        currentVersion: installation.installed.version,
      });
      checks.push(makeCheck(
        "plugin-compatibility-shells",
        shells.valid ? "pass" : "fail",
        shells.valid
          ? `${shells.count} retained discovery shell(s) are bounded and checkout-routed.`
          : "Retained Plugin discovery shells are unbounded or contain an invalid runtime route.",
        shells,
        shells.valid ? null : "Run npm run release:local and inspect the local Plugin cache compatibility shells.",
      ));
    } catch (error) {
      checks.push(failedCheck(
        "plugin-compatibility-shells",
        error,
        "Run npm run release:local and inspect the local Plugin cache compatibility shells.",
      ));
    }
  } else {
    checks.push(makeCheck(
      "plugin-compatibility-shells",
      "fail",
      "Compatibility-shell check skipped because the installed Plugin could not be resolved.",
    ));
  }

  try {
    dependencies = inspectDependencies(SOURCE_ROOT, options);
    const healthy = dependencies.missing.length === 0;
    checks.push(makeCheck(
      "checkout-dependencies",
      healthy ? "pass" : "fail",
      healthy ? "Required checkout dependencies are resolvable." : `Missing dependencies: ${dependencies.missing.join(", ")}.`,
      { required: dependencies.required, missing: dependencies.missing },
      healthy ? null : `Run npm install in ${CANONICAL_CHECKOUT}.`,
    ));
  } catch (error) {
    checks.push(failedCheck("checkout-dependencies", error, `Run npm install in ${CANONICAL_CHECKOUT}.`));
  }

  try {
    environment = fixedEnvironment(cwd, options);
    checks.push(makeCheck(
      "fixed-environment",
      environment.healthy ? "pass" : "fail",
      environment.healthy ? "Fixed Claude config, 9090 proxy, no-proxy, and Conda envelope are active." : "Fixed runtime environment does not match the checkout contract.",
      environment.receipt,
      environment.healthy ? null : `Repair ${path.join(SOURCE_ROOT, "config", "runtime.env")}.`,
    ));
  } catch (error) {
    checks.push(failedCheck("fixed-environment", error, "Repair the fixed runtime.env file."));
  }

  if (environment) {
    const availability = getClaudeAvailability(cwd, {
      env: environment.env,
      spawnSyncImpl: options.spawnSyncImpl,
    });
    const compatibility = diagnoseClaudeCompatibility(cwd, {
      availability,
      env: environment.env,
      spawnSyncImpl: options.spawnSyncImpl,
    });
    checks.push(makeCheck(
      "claude-cli",
      availability.available && compatibility.staticCompatible ? "pass" : "fail",
      availability.available && compatibility.staticCompatible
        ? `Claude Code ${compatibility.version} exposes the required ${compatibility.requiredSurfaceRevision} surface.`
        : `Claude Code is unavailable or incompatible (${compatibility.failureCode ?? "unknown"}).`,
      {
        available: availability.available,
        version: compatibility.version,
        staticCompatible: compatibility.staticCompatible,
        missingSurface: compatibility.missingSurface,
        failureCode: compatibility.failureCode,
      },
      availability.available && compatibility.staticCompatible ? null : "Update or repair the fixed Claude CLI, then rerun doctor.",
    ));

    const auth = inspectAuth(cwd, environment.env, options);
    const credentialPresent = auth.credential?.state === "present";
    const credentialUnproven =
      !credentialPresent ||
      (auth.credential?.source === "native_oauth" && auth.credential?.accessLocallyExpired !== false);
    const authStatus = !auth.loggedIn || !credentialPresent
      ? "fail"
      : credentialUnproven
        ? "warn"
        : "pass";
    checks.push(makeCheck(
      "claude-auth",
      authStatus,
      authStatus === "pass"
        ? "Claude credential metadata is present; provider liveness was not validated."
        : authStatus === "warn"
          ? "Claude reports authentication, but the local access credential is expired or unproven; provider liveness was not validated."
          : "Claude credential metadata is unavailable; provider liveness was not validated.",
      auth,
      authStatus === "pass" ? null : `Run CLAUDE_CONFIG_DIR=${EXPECTED_CLAUDE_CONFIG_DIR} claude auth login, then rerun doctor.`,
    ));

  } else {
    checks.push(makeCheck("claude-cli", "fail", "Claude CLI check skipped because the fixed environment is invalid."));
    checks.push(makeCheck("claude-auth", "fail", "Claude auth check skipped because the fixed environment is invalid."));
  }

  try {
    const storage = inspectOperatorStorage({
      env: options.env ?? process.env,
      claudeConfigDir: environment?.env.CLAUDE_CONFIG_DIR ?? EXPECTED_CLAUDE_CONFIG_DIR,
      nowMs: options.nowMs,
      pluginDataRoot: options.pluginDataRoot,
    });
    const warning = storage.runtime.malformedRecords > 0 || storage.runtime.boundaryErrors > 0 || storage.cleanup.candidateCount > 0;
    checks.push(makeCheck(
      "storage",
      warning ? "warn" : "pass",
      warning ? "Storage is readable with advisory cleanup or malformed-record findings." : "Storage inventory is readable with no cleanup candidates.",
      storage,
    ));
  } catch (error) {
    checks.push(failedCheck("storage", error, "Inspect Plugin data permissions and rerun doctor."));
  }

  if (installation?.parity && dependencies?.missing?.length === 0) {
    try {
      const probe = options.probeMcp ?? (await import("./release-smoke.mjs")).probeInstalledMcp;
      const mcp = await probe({
        snapshotRoot: installation.installed.snapshotRoot,
        workspace: cwd,
        env: environment?.env ?? options.env ?? process.env,
        callListAgents: true,
      });
      checks.push(makeCheck(
        "mcp-tools",
        mcp.healthy ? "pass" : "fail",
        mcp.healthy ? "Installed MCP bootstrap exposes exactly seven tools and isolated list_agents succeeds." : "Installed MCP discovery did not match the seven-tool contract.",
        { toolCount: mcp.tools.length, tools: mcp.tools, isolatedAgentCount: mcp.agentCount },
        mcp.healthy ? null : "Run npm run refresh:local and start a new Codex task.",
      ));
    } catch (error) {
      checks.push(failedCheck("mcp-tools", error, "Run npm run refresh:local and inspect the MCP bootstrap."));
    }
  } else {
    checks.push(makeCheck(
      "mcp-tools",
      "fail",
      "MCP discovery skipped because installation parity or checkout dependencies failed.",
      null,
      "Repair earlier failures, then rerun doctor.",
    ));
  }

  const requiredFailed = checks.some((check) => check.status === "fail");
  const warned = checks.some((check) => check.status === "warn");
  return {
    version: 1,
    operatorOnly: true,
    readOnly: true,
    checkout: SOURCE_ROOT,
    status: requiredFailed ? "fail" : warned ? "warn" : "pass",
    checks,
  };
}

/** SPDX-License-Identifier: Apache-2.0 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CANONICAL_RUNTIME_CHECKOUT } from "./version.mjs";

export const COMPATIBILITY_SHELL_LIMIT = 2;
const COVERAGE_HISTORY_LIMIT = COMPATIBILITY_SHELL_LIMIT + 1;
const COVERAGE_SCHEMA_VERSION = 1;
const MARKETPLACE = "pein-local";
const PLUGIN = "cc-for-pein";
const VERSION_PATTERN = /^[A-Za-z0-9.+_-]+$/;

export const COMPATIBILITY_DISCOVERY_FILES = Object.freeze([
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "assets/cc-for-pein-icon.svg",
  "assets/cc-for-pein-logo.svg",
  "bootstrap/cc-mcp.mjs",
  "bootstrap/cc-runtime.mjs",
  "bootstrap/dependency-preflight.mjs",
  "skills/followup-task/SKILL.md",
  "skills/followup-task/agents/openai.yaml",
  "skills/interrupt-agent/SKILL.md",
  "skills/interrupt-agent/agents/openai.yaml",
  "skills/list-agents/SKILL.md",
  "skills/list-agents/agents/openai.yaml",
  "skills/read-agent-messages/SKILL.md",
  "skills/read-agent-messages/agents/openai.yaml",
  "skills/send-message/SKILL.md",
  "skills/send-message/agents/openai.yaml",
  "skills/spawn-agent/SKILL.md",
  "skills/spawn-agent/agents/openai.yaml",
  "skills/wait-agent/SKILL.md",
  "skills/wait-agent/agents/openai.yaml",
]);

function assertVersion(version) {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version) || version === "." || version === "..") {
    throw new Error("Plugin discovery-shell version is invalid.");
  }
  return version;
}

function resolvePaths(codexHome) {
  const home = path.resolve(codexHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  const archiveRoot = path.join(home, "plugins", "data", "cc", "compatibility-shells", "v1");
  return {
    codexHome: home,
    versionsRoot: path.join(home, "plugins", "cache", MARKETPLACE, PLUGIN),
    archiveRoot,
    archiveVersionsRoot: path.join(archiveRoot, "versions"),
    coverageFile: path.join(archiveRoot, "coverage.json"),
  };
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch {}
}

function writePrivateFile(filePath, contents) {
  ensurePrivateDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, { mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch {}
}

function collectRelativeFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Plugin discovery shell contains a symbolic link.");
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(path.relative(root, target));
      else throw new Error("Plugin discovery shell contains an unsupported entry.");
      if (files.length > COMPATIBILITY_DISCOVERY_FILES.length) {
        throw new Error("Plugin discovery shell contains files outside the whitelist.");
      }
    }
  };
  visit(root);
  return files.sort();
}

function validCanonicalRoute(root) {
  try {
    const descriptor = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"))
      ?.mcpServers?.cc_for_pein;
    const expectedBootstrap = path.join(
      CANONICAL_RUNTIME_CHECKOUT,
      "plugins", PLUGIN, "bootstrap", "cc-mcp.mjs",
    );
    const descriptorRoutesToCheckout = (
      descriptor?.cwd === CANONICAL_RUNTIME_CHECKOUT &&
      descriptor?.args?.[1] === expectedBootstrap
    );
    const mcpBootstrap = fs.readFileSync(path.join(root, "bootstrap", "cc-mcp.mjs"), "utf8");
    const runtimeBootstrap = fs.readFileSync(path.join(root, "bootstrap", "cc-runtime.mjs"), "utf8");
    return (
      descriptorRoutesToCheckout &&
      mcpBootstrap.includes(`FIXED_RUNTIME_CHECKOUT = "${CANONICAL_RUNTIME_CHECKOUT}"`) &&
      runtimeBootstrap.includes(`FIXED_RUNTIME_CHECKOUT = "${CANONICAL_RUNTIME_CHECKOUT}"`)
    );
  } catch {
    return false;
  }
}

function validateShell(root, version) {
  try {
    if (!fs.statSync(root).isDirectory()) return false;
    const files = collectRelativeFiles(root);
    if (JSON.stringify(files) !== JSON.stringify([...COMPATIBILITY_DISCOVERY_FILES].sort())) return false;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
    return manifest?.name === PLUGIN && manifest?.version === version && validCanonicalRoute(root);
  } catch {
    return false;
  }
}

function validateShellSource(root, version) {
  try {
    if (!fs.statSync(root).isDirectory()) return false;
    for (const relative of COMPATIBILITY_DISCOVERY_FILES) {
      const candidate = path.join(root, relative);
      if (!fs.existsSync(candidate) || !fs.lstatSync(candidate).isFile()) return false;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
    return manifest?.name === PLUGIN && manifest?.version === version && validCanonicalRoute(root);
  } catch {
    return false;
  }
}

function copyWhitelistedShell(source, target, version) {
  assertVersion(version);
  const temporary = fs.mkdtempSync(path.join(path.dirname(target), ".shell-stage-"));
  try {
    for (const relative of COMPATIBILITY_DISCOVERY_FILES) {
      const sourceFile = path.join(source, relative);
      if (!fs.existsSync(sourceFile) || !fs.lstatSync(sourceFile).isFile()) {
        throw new Error(`Plugin discovery shell is missing required file ${relative}.`);
      }
      const targetFile = path.join(temporary, relative);
      ensurePrivateDirectory(path.dirname(targetFile));
      fs.copyFileSync(sourceFile, targetFile);
      try { fs.chmodSync(targetFile, 0o600); } catch {}
    }
    if (!validateShell(temporary, version)) {
      throw new Error(`Plugin discovery shell ${version} is invalid or does not route to the canonical checkout.`);
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(temporary, target);
    return true;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function readCoverage(paths, { strict = true } = {}) {
  if (!fs.existsSync(paths.coverageFile)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(paths.coverageFile, "utf8"));
    const versions = value?.successfulVersions;
    if (
      value?.version !== COVERAGE_SCHEMA_VERSION ||
      !Array.isArray(versions) ||
      versions.length < 1 ||
      versions.length > COVERAGE_HISTORY_LIMIT ||
      new Set(versions).size !== versions.length ||
      versions.some((version) => typeof version !== "string" || !VERSION_PATTERN.test(version)) ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
    ) throw new Error("Plugin compatibility coverage record is malformed.");
    return { version: COVERAGE_SCHEMA_VERSION, successfulVersions: [...versions], updatedAt: value.updatedAt };
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

function writeCoverage(paths, successfulVersions) {
  const value = {
    version: COVERAGE_SCHEMA_VERSION,
    successfulVersions: successfulVersions.slice(0, COVERAGE_HISTORY_LIMIT),
    updatedAt: new Date().toISOString(),
  };
  ensurePrivateDirectory(paths.archiveRoot);
  const temporary = path.join(paths.archiveRoot, `.coverage-${process.pid}-${Date.now()}.tmp`);
  try {
    writePrivateFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporary, paths.coverageFile);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return value;
}

function archiveVersion(paths, version, source) {
  ensurePrivateDirectory(paths.archiveVersionsRoot);
  copyWhitelistedShell(source, path.join(paths.archiveVersionsRoot, version), version);
}

function cacheCandidates(paths, requestedVersion) {
  if (!fs.existsSync(paths.versionsRoot)) return [];
  return fs.readdirSync(paths.versionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name))
    .map((entry) => ({
      version: entry.name,
      root: path.join(paths.versionsRoot, entry.name),
      modifiedMs: fs.statSync(path.join(paths.versionsRoot, entry.name)).mtimeMs,
    }))
    // Installed Codex snapshots may contain metadata such as `.codexignore`.
    // Only the durable compatibility archive/restored shell is exact-whitelist.
    .filter((entry) => validateShellSource(entry.root, entry.version))
    .sort((left, right) => right.modifiedMs - left.modifiedMs || right.version.localeCompare(left.version))
    .sort((left, right) => Number(right.version === requestedVersion) - Number(left.version === requestedVersion));
}

function archiveIsUsable(paths, version) {
  return validateShell(path.join(paths.archiveVersionsRoot, version), version);
}

function uniqueVersions(values) {
  return [...new Set(values)];
}

export function prepareCompatibilityInstall(options) {
  const requestedVersion = assertVersion(options?.requestedVersion);
  const paths = resolvePaths(options?.codexHome);
  ensurePrivateDirectory(paths.archiveVersionsRoot);
  const coverage = readCoverage(paths);
  const cached = cacheCandidates(paths, requestedVersion);
  for (const candidate of cached) {
    archiveVersion(paths, candidate.version, candidate.root);
  }

  const migrationHistory = cached.map((entry) => entry.version);
  const priorHistory = coverage?.successfulVersions ?? migrationHistory;
  const expectedPredecessor = priorHistory.find((version) => version !== requestedVersion) ?? null;
  if (expectedPredecessor && !archiveIsUsable(paths, expectedPredecessor)) {
    throw new Error(
      `Known previous Plugin discovery shell ${expectedPredecessor} is unavailable. ` +
      "Restore its discovery archive before refreshing the Plugin.",
    );
  }
  const retainedVersions = uniqueVersions(
    priorHistory.filter((version) => version !== requestedVersion && archiveIsUsable(paths, version)),
  ).slice(0, COMPATIBILITY_SHELL_LIMIT);
  const coverageState = coverage
    ? (coverage.successfulVersions[0] === requestedVersion ? "managed_refresh" : "managed_upgrade")
    : (expectedPredecessor ? "migration_upgrade" : "first_install");
  return Object.freeze({
    version: 1,
    requestedVersion,
    coverageState,
    expectedPredecessor,
    retainedVersions,
    priorHistory: [...priorHistory],
    paths,
  });
}

export function restorePreparedCompatibilityShells(plan) {
  ensurePrivateDirectory(plan.paths.versionsRoot);
  for (const version of plan.retainedVersions) {
    const source = path.join(plan.paths.archiveVersionsRoot, version);
    if (!validateShell(source, version)) {
      throw new Error(`Prepared Plugin discovery shell ${version} is unavailable.`);
    }
    copyWhitelistedShell(source, path.join(plan.paths.versionsRoot, version), version);
  }
  return [...plan.retainedVersions];
}

function pruneArchive(paths, keepVersions) {
  if (!fs.existsSync(paths.archiveVersionsRoot)) return;
  for (const entry of fs.readdirSync(paths.archiveVersionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || keepVersions.includes(entry.name)) continue;
    fs.rmSync(path.join(paths.archiveVersionsRoot, entry.name), { recursive: true, force: true });
  }
}

export function finalizeCompatibilityInstall(options) {
  const { plan } = options;
  const installedSnapshotRoot = path.resolve(options.installedSnapshotRoot);
  archiveVersion(plan.paths, plan.requestedVersion, installedSnapshotRoot);
  restorePreparedCompatibilityShells(plan);
  const successfulVersions = uniqueVersions([
    plan.requestedVersion,
    ...plan.priorHistory.filter((version) => version !== plan.requestedVersion),
  ]).slice(0, COVERAGE_HISTORY_LIMIT);
  writeCoverage(plan.paths, successfulVersions);
  pruneArchive(plan.paths, successfulVersions);
  return inspectCompatibilityCoverage({
    codexHome: plan.paths.codexHome,
    currentVersion: plan.requestedVersion,
    currentSnapshotRoot: installedSnapshotRoot,
  });
}

function listVersionDirectories(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function inspectCompatibilityCoverage(options) {
  const currentVersion = assertVersion(options?.currentVersion);
  const paths = resolvePaths(options?.codexHome);
  let coverage;
  let coverageRecordValid = true;
  try {
    coverage = readCoverage(paths);
  } catch {
    coverage = null;
    coverageRecordValid = false;
  }
  const managedVersions = coverage?.successfulVersions ?? [];
  const expectedPredecessor = managedVersions.find((version) => version !== currentVersion) ?? null;
  const archivedVersions = listVersionDirectories(paths.archiveVersionsRoot);
  const archiveValid = (
    coverageRecordValid &&
    archivedVersions.length <= COVERAGE_HISTORY_LIMIT &&
    archivedVersions.every((version) => (
      managedVersions.includes(version) && archiveIsUsable(paths, version)
    )) &&
    managedVersions.every((version) => archiveIsUsable(paths, version))
  );
  const cacheVersions = listVersionDirectories(paths.versionsRoot)
    .filter((version) => version !== currentVersion);
  const cacheDetails = cacheVersions.map((version) => ({
    version,
    valid: validateShell(path.join(paths.versionsRoot, version), version),
  }));
  const retainedVersions = cacheDetails.filter((entry) => entry.valid).map((entry) => entry.version);
  const cacheBounded = cacheVersions.length <= COMPATIBILITY_SHELL_LIMIT;
  const expectedRetained = expectedPredecessor == null || retainedVersions.includes(expectedPredecessor);
  const expectedArchived = expectedPredecessor == null || archiveIsUsable(paths, expectedPredecessor);
  const coverageComplete = (
    coverageRecordValid && coverage != null && archiveValid && cacheBounded &&
    cacheDetails.every((entry) => entry.valid) && expectedRetained && expectedArchived
  );
  const coverageState = coverage == null
    ? "unmanaged"
    : (expectedPredecessor == null ? "first_install" : "managed");
  return {
    versionsRoot: paths.versionsRoot,
    archiveRoot: paths.archiveRoot,
    count: cacheVersions.length,
    limit: COMPATIBILITY_SHELL_LIMIT,
    bounded: cacheBounded,
    valid: archiveValid && cacheBounded && cacheDetails.every((entry) => entry.valid) && expectedRetained,
    coverageState,
    managedVersions,
    expectedPredecessor,
    retainedVersions,
    archivedVersions,
    archiveValid,
    coverageComplete,
    versions: cacheDetails,
  };
}

/** SPDX-License-Identifier: Apache-2.0 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CANONICAL_RUNTIME_CHECKOUT,
  PACKAGE_VERSION,
  SOURCE_ROOT,
  pluginBaseVersion,
} from "./version.mjs";
import { inspectCompatibilityCoverage } from "./plugin-compatibility-shells.mjs";

export const PLUGIN_NAME = "codex-harnessdock";
export const MARKETPLACE_NAME = "pein-local";
export const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

function canonical(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function boundedCommandError(command, result) {
  const source = `${result?.stderr ?? ""}\n${result?.stdout ?? ""}`.trim();
  const detail = source ? ` ${source.replaceAll("\0", "").slice(0, 500)}` : "";
  return `${command} failed with status ${result?.status ?? "unknown"}.${detail}`;
}

export function resolveInstalledPlugin(options = {}) {
  const env = options.env ?? process.env;
  const spawn = options.spawnSyncImpl ?? spawnSync;
  const codex = options.codexExecutable ?? "codex";
  const result = spawn(codex, ["plugin", "list", "--json"], {
    cwd: options.cwd ?? SOURCE_ROOT,
    env,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result?.error || result?.status !== 0) {
    throw new Error(boundedCommandError("codex plugin list --json", result));
  }
  let listing;
  try {
    listing = JSON.parse(result.stdout);
  } catch {
    throw new Error("codex plugin list --json returned invalid JSON.");
  }
  const installed = Array.isArray(listing.installed) ? listing.installed : [];
  const record = installed.find((entry) => entry?.pluginId === PLUGIN_ID);
  if (!record) throw new Error(`${PLUGIN_ID} is not installed.`);
  if (record.enabled !== true) throw new Error(`${PLUGIN_ID} is installed but not enabled.`);
  if (typeof record.version !== "string" || !/^[A-Za-z0-9.+_-]+$/.test(record.version)) {
    throw new Error(`${PLUGIN_ID} reported an invalid installed version.`);
  }
  if (record.marketplaceName !== MARKETPLACE_NAME || record.name !== PLUGIN_NAME) {
    throw new Error(`${PLUGIN_ID} reported inconsistent Plugin identity.`);
  }
  const codexHome = path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  const snapshotRoot = path.join(
    codexHome,
    "plugins",
    "cache",
    MARKETPLACE_NAME,
    PLUGIN_NAME,
    record.version,
  );
  return {
    pluginId: PLUGIN_ID,
    version: record.version,
    enabled: true,
    source: record.source?.source === "local" ? "local" : "unknown",
    sourcePath: record.source?.path ? canonical(record.source.path) : null,
    snapshotRoot: canonical(snapshotRoot),
  };
}

function collectFiles(root, options = {}) {
  const limit = options.limit ?? 10_000;
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Plugin tree contains unsupported symlink: ${target}`);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(path.relative(root, target));
      if (files.length > limit) throw new Error(`Plugin tree exceeds ${limit} files.`);
    }
  };
  visit(root);
  return files.sort();
}

export function digestPluginTree(root) {
  const canonicalRoot = fs.realpathSync.native(root);
  const files = collectFiles(canonicalRoot);
  const hash = createHash("sha256");
  for (const relative of files) {
    hash.update(relative).update("\0").update(fs.readFileSync(path.join(canonicalRoot, relative))).update("\0");
  }
  return { digest: hash.digest("hex"), files };
}

export function inspectInstalledPluginParity(options = {}) {
  const checkout = canonical(options.checkout ?? SOURCE_ROOT);
  const pluginRoot = path.join(checkout, "plugins", PLUGIN_NAME);
  const installed = options.installed ?? resolveInstalledPlugin({ ...options, cwd: checkout });
  const manifestFile = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const snapshotManifestFile = path.join(installed.snapshotRoot, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const snapshotManifest = JSON.parse(fs.readFileSync(snapshotManifestFile, "utf8"));
  const checkoutTree = digestPluginTree(pluginRoot);
  const snapshotTree = digestPluginTree(installed.snapshotRoot);
  const sourceMatches = installed.source === "local" && installed.sourcePath === pluginRoot;
  const versionMatches = (
    installed.version === manifest.version &&
    snapshotManifest.version === manifest.version &&
    pluginBaseVersion(manifest.version) === PACKAGE_VERSION
  );
  const contentMatches = checkoutTree.digest === snapshotTree.digest;
  return {
    checkout,
    pluginRoot,
    installed,
    packageVersion: PACKAGE_VERSION,
    manifestVersion: manifest.version,
    sourceMatches,
    versionMatches,
    contentMatches,
    checkoutFileCount: checkoutTree.files.length,
    snapshotFileCount: snapshotTree.files.length,
    parity: sourceMatches && versionMatches && contentMatches,
  };
}

export function inspectCompatibilityShells(options = {}) {
  const currentSnapshot = path.resolve(options.snapshotRoot);
  const currentVersion = options.currentVersion ?? path.basename(currentSnapshot);
  const codexHome = options.codexHome ?? path.resolve(currentSnapshot, "../../../../..");
  return inspectCompatibilityCoverage({
    codexHome,
    currentVersion,
    currentSnapshotRoot: currentSnapshot,
  });
}

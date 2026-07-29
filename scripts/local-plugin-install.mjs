#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { pluginBaseVersion, readPackageMetadata } from "../runtime/version.mjs";

const MARKETPLACE = "pein-local";
const PLUGIN = "cc-for-pein";
const sourceRoot = fs.realpathSync.native(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
);
const codex = process.platform === "win32" ? "codex.cmd" : "codex";
const COMPATIBILITY_SHELL_LIMIT = 2;

function parseArguments(argv) {
  let refreshOnly = false;
  for (const argument of argv) {
    if (argument === "--refresh-only") {
      refreshOnly = true;
      continue;
    }
    if (argument === "--initial") {
      refreshOnly = false;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        "Usage: node scripts/local-plugin-install.mjs [--initial|--refresh-only]\n" +
        "Initial binding may rebind pein-local to this checkout; refresh-only fails on marketplace root drift.\n",
      );
      process.exit(0);
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return { refreshOnly };
}

function run(args, { allowFailure = false } = {}) {
  const result = spawnSync(codex, args, {
    cwd: sourceRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      [`codex ${args.join(" ")} failed.`, result.stderr, result.stdout]
        .filter(Boolean)
        .join("\n")
    );
  }
  return result;
}

function parseJson(command, result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `codex ${command.join(" ")} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function canonicalPath(candidate) {
  if (!candidate) return undefined;
  const resolved = path.resolve(candidate);
  try {
    return fs.realpathSync.native(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") return resolved;
    throw error;
  }
}

function marketplaceRoot() {
  const listed = parseJson(["plugin", "marketplace", "list", "--json"], run(["plugin", "marketplace", "list", "--json"]));
  if (!Array.isArray(listed.marketplaces)) {
    throw new Error("Codex marketplace listing has no marketplaces array.");
  }
  const marketplace = listed.marketplaces.find((entry) => entry?.name === MARKETPLACE);
  return marketplace?.root ? canonicalPath(marketplace.root) : undefined;
}

function bindMarketplace({ refreshOnly }) {
  const currentRoot = marketplaceRoot();
  if (currentRoot === sourceRoot) return;
  if (refreshOnly && currentRoot) {
    throw new Error(
      `${MARKETPLACE} marketplace root drift: expected ${sourceRoot}, found ${currentRoot}. ` +
      "Refresh-only refuses to change marketplace source; run the explicit initial binding instead.",
    );
  }
  if (refreshOnly) {
    throw new Error(
      `${MARKETPLACE} marketplace is not bound to ${sourceRoot}. ` +
      "Refresh-only refuses to create or rebind a marketplace; run the explicit initial binding instead.",
    );
  }
  if (currentRoot) {
    run(["plugin", "marketplace", "remove", MARKETPLACE, "--json"]);
  }
  run(["plugin", "marketplace", "add", sourceRoot, "--json"]);
}

function verifyInstalled(manifest) {
  const listed = parseJson(["plugin", "list", "--json"], run(["plugin", "list", "--json"]));
  const installed = Array.isArray(listed.installed) ? listed.installed : [];
  const plugin = installed.find((entry) => entry?.pluginId === `${PLUGIN}@${MARKETPLACE}`);
  if (!plugin || plugin.version !== manifest.version || plugin.enabled !== true) {
    throw new Error("Codex did not report the expected enabled local plugin version after installation.");
  }
}

function compatibilityVersionsRoot() {
  const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  return path.join(codexHome, "plugins", "cache", MARKETPLACE, PLUGIN);
}

function backUpCompatibilityShells(currentVersion) {
  const versionsRoot = compatibilityVersionsRoot();
  if (!fs.existsSync(versionsRoot)) return { versionsRoot, temporaryRoot: null, versions: [] };
  const candidates = fs.readdirSync(versionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== currentVersion)
    .filter((entry) => /^[A-Za-z0-9.+_-]+$/.test(entry.name))
    .map((entry) => ({
      version: entry.name,
      modifiedMs: fs.statSync(path.join(versionsRoot, entry.name)).mtimeMs,
    }))
    .sort((left, right) => right.modifiedMs - left.modifiedMs || right.version.localeCompare(left.version))
    .slice(0, COMPATIBILITY_SHELL_LIMIT);
  if (candidates.length === 0) return { versionsRoot, temporaryRoot: null, versions: [] };
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc-for-pein-compat-"));
  for (const { version } of candidates) {
    fs.cpSync(path.join(versionsRoot, version), path.join(temporaryRoot, version), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  return { versionsRoot, temporaryRoot, versions: candidates.map(({ version }) => version) };
}

function restoreCompatibilityShells(backup) {
  if (!backup.temporaryRoot) return;
  fs.mkdirSync(backup.versionsRoot, { recursive: true });
  for (const version of backup.versions) {
    const target = path.join(backup.versionsRoot, version);
    if (!fs.existsSync(target)) {
      fs.cpSync(path.join(backup.temporaryRoot, version), target, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
  }
}

function removeCompatibilityBackup(backup) {
  if (backup.temporaryRoot) fs.rmSync(backup.temporaryRoot, { recursive: true, force: true });
}

function installWithCompatibilityShells(manifest) {
  const backup = backUpCompatibilityShells(manifest.version);
  let installed;
  let failure;
  try {
    installed = run(["plugin", "add", `${PLUGIN}@${MARKETPLACE}`, "--json"]);
    verifyInstalled(manifest);
  } catch (error) {
    failure = error;
  }
  try {
    restoreCompatibilityShells(backup);
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], "Plugin installation and compatibility-shell restoration both failed.")
      : error;
  } finally {
    removeCompatibilityBackup(backup);
  }
  if (failure) throw failure;
  return { installed, retainedVersions: backup.versions };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifestFile = path.join(
    sourceRoot,
    "plugins",
    PLUGIN,
    ".codex-plugin",
    "plugin.json"
  );
  const marketplaceFile = path.join(sourceRoot, ".agents", "plugins", "marketplace.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(marketplaceFile, "utf8"));
  if (manifest.name !== PLUGIN || marketplace.name !== MARKETPLACE) {
    throw new Error("Local plugin or marketplace identity is inconsistent.");
  }
  const packageMetadata = readPackageMetadata();
  if (pluginBaseVersion(manifest.version) !== packageMetadata.version) {
    throw new Error(
      `Plugin base version ${pluginBaseVersion(manifest.version)} does not match package version ` +
      `${packageMetadata.version}. Run node scripts/update-plugin-cachebuster.mjs first.`
    );
  }

  // Codex owns installation snapshots. The snapshot contains only discovery
  // metadata/skills/bootstrap; bootstrap always delegates execution back to
  // CC_RUNTIME_CHECKOUT and rejects versioned-cache runtime paths.
  bindMarketplace(options);
  const { installed, retainedVersions } = installWithCompatibilityShells(manifest);

  process.stdout.write(installed.stdout);
  process.stdout.write(
    `Installed ${PLUGIN}@${MARKETPLACE} ${manifest.version} from ${sourceRoot}.\n` +
    `${retainedVersions.length > 0 ? `Retained discovery shells: ${retainedVersions.join(", ")}.\n` : ""}` +
    "Compatible runtime-only edits hot-load on the next MCP call without refresh. " +
    "Start a new Codex task to reload Skills, schemas, annotations, or another MCP API generation.\n"
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MARKETPLACE = "pein-local";
const PLUGIN = "cc-for-pein";
const sourceRoot = fs.realpathSync.native(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
);
const codex = process.platform === "win32" ? "codex.cmd" : "codex";

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

  // Codex owns installation snapshots. The snapshot contains only discovery
  // metadata/skills/bootstrap; bootstrap always delegates execution back to
  // CC_RUNTIME_CHECKOUT and rejects versioned-cache runtime paths.
  bindMarketplace(options);
  const installed = run(["plugin", "add", `${PLUGIN}@${MARKETPLACE}`, "--json"]);
  verifyInstalled(manifest);

  process.stdout.write(installed.stdout);
  process.stdout.write(
    `Installed ${PLUGIN}@${MARKETPLACE} ${manifest.version} from ${sourceRoot}.\n` +
    "Start a new Codex task to reload the seven lifecycle skills and typed MCP tools; a new task also restarts the checkout-owned MCP module graph.\n"
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

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

function main() {
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
  run(["plugin", "remove", `${PLUGIN}@${MARKETPLACE}`, "--json"], { allowFailure: true });
  run(["plugin", "marketplace", "remove", MARKETPLACE, "--json"], { allowFailure: true });
  run(["plugin", "marketplace", "add", sourceRoot, "--json"]);
  const installed = run(["plugin", "add", `${PLUGIN}@${MARKETPLACE}`, "--json"]);
  const listed = run(["plugin", "list"]);
  if (!listed.stdout.includes(`${PLUGIN}@${MARKETPLACE}`) || !listed.stdout.includes(manifest.version)) {
    throw new Error("Codex did not report the expected local plugin version after installation.");
  }

  process.stdout.write(installed.stdout);
  process.stdout.write(
    `Installed ${PLUGIN}@${MARKETPLACE} ${manifest.version} from ${sourceRoot}.\n` +
    "Restart Codex to reload the six lifecycle skills.\n"
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

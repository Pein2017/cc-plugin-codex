#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { pluginVersionForCachebuster, readPackageMetadata } from "../runtime/version.mjs";

const DEFAULT_PLUGIN_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "plugins",
  "codex-harnessdock",
);

function usage() {
  return [
    "Usage: node scripts/update-plugin-cachebuster.mjs [<plugin-root>] [--cachebuster <token>]",
    "Updates only the +codex.<token> suffix in .codex-plugin/plugin.json.",
  ].join("\n");
}

function utcCachebuster(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

function parseArguments(argv) {
  let pluginRoot = DEFAULT_PLUGIN_ROOT;
  let cachebuster;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cachebuster") {
      cachebuster = argv[++index];
      if (!cachebuster) throw new Error("--cachebuster requires a value.");
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    if (pluginRoot !== DEFAULT_PLUGIN_ROOT) throw new Error("Only one plugin root may be supplied.");
    pluginRoot = path.resolve(argument);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(cachebuster ?? "local")) {
    throw new Error("Cachebuster must contain only letters, digits, dots, underscores, or hyphens.");
  }
  return { cachebuster: cachebuster ?? utcCachebuster(), pluginRoot };
}

function main() {
  const { cachebuster, pluginRoot } = parseArguments(process.argv.slice(2));
  const manifestFile = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(`Invalid plugin manifest: ${manifestFile}`);
  }
  manifest.version = pluginVersionForCachebuster(cachebuster, readPackageMetadata());
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${manifest.name} ${manifest.version}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

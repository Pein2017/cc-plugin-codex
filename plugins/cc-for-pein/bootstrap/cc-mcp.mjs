#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Descriptor-only MCP bootstrap. The installed snapshot validates and starts
 * the one checkout-owned MCP runtime while preserving stdio protocol framing.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { assertCheckoutDependencies } from "./dependency-preflight.mjs";

const FIXED_RUNTIME_CHECKOUT = "/data/CoordExp/cc-plugin-codex";

function existing(candidate) {
  try {
    return fs.statSync(candidate).isFile() ? path.resolve(candidate) : null;
  } catch {
    return null;
  }
}

function parseEnv(filePath) {
  const values = {};
  for (const [index, rawLine] of fs.readFileSync(filePath, "utf8").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid env syntax at ${filePath}:${index + 1}.`);
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function resolveCheckout() {
  let checkout;
  try {
    checkout = fs.realpathSync.native(FIXED_RUNTIME_CHECKOUT);
  } catch {
    throw new Error(`Fixed CC runtime checkout is unavailable: ${FIXED_RUNTIME_CHECKOUT}`);
  }
  const server = path.join(checkout, "runtime", "mcp-server.mjs");
  const envFile = existing(path.join(checkout, "config", "runtime.env"));
  const manifest = path.join(
    checkout,
    "plugins",
    "cc-for-pein",
    ".codex-plugin",
    "plugin.json"
  );
  const packageJson = path.join(checkout, "package.json");
  if (!existing(server) || !envFile || !existing(manifest) || !existing(packageJson)) {
    throw new Error(`Fixed CC MCP checkout is invalid: ${checkout}`);
  }
  const plugin = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (plugin.name !== "cc-for-pein" || plugin.mcpServers !== "./.mcp.json") {
    throw new Error(`Unexpected CC MCP Plugin identity at ${checkout}.`);
  }
  return { checkout, server, envFile };
}

function main() {
  const { checkout, server, envFile } = resolveCheckout();
  assertCheckoutDependencies(checkout);
  const configured = parseEnv(envFile);
  delete configured.CODEX_THREAD_ID;
  delete configured.CC_TRUSTED_OWNER_ROOT_ID;
  const env = {
    ...process.env,
    ...configured,
    CC_RUNTIME_CHECKOUT: checkout,
    CC_RUNTIME_ENV_FILE: envFile,
    CC_RUNTIME_SOURCE_ROOT: checkout,
  };
  delete env.CODEX_THREAD_ID;
  delete env.CC_TRUSTED_OWNER_ROOT_ID;

  const child = spawn(process.execPath, ["--", server], {
    cwd: checkout,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      try { child.kill(signal); } catch {}
    });
  }
  child.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.stderr.write(`CC MCP runtime exited from ${signal}.\n`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

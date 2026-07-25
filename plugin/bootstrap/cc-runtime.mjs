#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cache-safe Codex discovery bootstrap. This file never executes a runtime
 * beside itself: it resolves and validates the checkout declared by the one
 * selected .codex/.env, then delegates to that checkout's CLI.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function existing(candidate) {
  try {
    return fs.statSync(candidate).isFile() ? path.resolve(candidate) : null;
  } catch {
    return null;
  }
}

function findAncestorEnv(startPath) {
  let current = path.resolve(startPath);
  while (true) {
    const candidate = existing(path.join(current, ".codex", ".env"));
    if (candidate) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function splitRawArgumentString(raw) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;
  for (const character of raw) {
    if (escaping) {
      current += character;
      escaping = false;
    } else if (character === "\\") {
      escaping = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }
  if (escaping) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function bootstrapContext(rawArgv) {
  const argv = rawArgv.length === 1 && String(rawArgv[0] ?? "").trim()
    ? splitRawArgumentString(rawArgv[0])
    : rawArgv;
  let cwd = process.cwd();
  let envFile = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") break;
    const match = /^(--cwd|--env-file)=(.*)$/.exec(token);
    const option = match?.[1] ?? token;
    if (!["--cwd", "-C", "--env-file"].includes(option)) continue;
    const value = match?.[2] ?? argv[index + 1];
    if (!value) throw new Error(`Missing value for ${option}`);
    if (!match) index += 1;
    if (option === "--env-file") envFile = value;
    else cwd = path.resolve(process.cwd(), value);
  }
  return { cwd, envFile };
}

function selectEnvFile(env, context) {
  if (context.envFile) {
    const explicit = existing(path.resolve(context.cwd, context.envFile));
    if (!explicit) throw new Error(`Runtime env file not found: ${context.envFile}`);
    return explicit;
  }
  if (env.CC_RUNTIME_ENV_FILE) {
    const explicit = existing(path.resolve(context.cwd, env.CC_RUNTIME_ENV_FILE));
    if (!explicit) throw new Error(`Runtime env file not found: ${env.CC_RUNTIME_ENV_FILE}`);
    return explicit;
  }
  if (env.CODEX_HOME) {
    const fromCodexHome = existing(path.join(env.CODEX_HOME, ".env"));
    if (fromCodexHome) return fromCodexHome;
  }
  return findAncestorEnv(context.cwd) ?? existing(path.join(os.homedir(), ".codex", ".env"));
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

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function resolveCheckout(env) {
  const configured = String(env.CC_RUNTIME_CHECKOUT ?? "").trim();
  if (!configured) {
    throw new Error("CC_RUNTIME_CHECKOUT is required in the selected .codex/.env.");
  }
  const checkout = fs.realpathSync.native(path.resolve(configured));
  const codexHome = path.resolve(env.CODEX_HOME ?? path.join(os.homedir(), ".codex"));
  const cacheRoot = path.join(codexHome, "plugins", "cache");
  if (isWithin(checkout, cacheRoot)) {
    throw new Error(`CC_RUNTIME_CHECKOUT must not point into Codex's versioned cache: ${checkout}`);
  }
  const cli = path.join(checkout, "runtime", "cli.mjs");
  const manifest = path.join(checkout, "plugin", ".codex-plugin", "plugin.json");
  if (!existing(cli) || !existing(manifest)) {
    throw new Error(`CC_RUNTIME_CHECKOUT is not a valid CC runtime checkout: ${checkout}`);
  }
  const plugin = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (plugin.name !== "cc") {
    throw new Error(`Unexpected plugin identity at ${checkout}: ${plugin.name ?? "missing"}`);
  }
  return { checkout, cli };
}

function main() {
  const inherited = { ...process.env };
  const context = bootstrapContext(process.argv.slice(2));
  const envFile = selectEnvFile(inherited, context);
  if (!envFile) throw new Error("No .codex/.env was found for the CC runtime bootstrap.");
  const env = { ...inherited, ...parseEnv(envFile), CC_RUNTIME_ENV_FILE: envFile };
  const { checkout, cli } = resolveCheckout(env);
  env.CC_RUNTIME_SOURCE_ROOT = checkout;
  const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
    cwd: process.cwd(),
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
      process.stderr.write(`CC runtime exited from ${signal}.\n`);
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

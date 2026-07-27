#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cache-safe Codex discovery bootstrap. The installed snapshot is only a
 * descriptor: it validates the one personal checkout and environment, then
 * delegates to that checkout's CLI from the host Codex working directory.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FIXED_RUNTIME_CHECKOUT = "/data/CoordExp/cc-plugin-codex";
const PUBLIC_COMMANDS = new Set([
  "spawn_agent",
  "send_message",
  "followup_task",
  "wait_agent",
  "interrupt_agent",
  "read_agent_messages",
  "list_agents",
]);

function existing(candidate) {
  try {
    return fs.statSync(candidate).isFile() ? path.resolve(candidate) : null;
  } catch {
    return null;
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

function normalizeArgv(rawArgv) {
  if (rawArgv.length === 1 && String(rawArgv[0] ?? "").trim()) {
    return splitRawArgumentString(rawArgv[0]);
  }
  if (rawArgv.length === 2 && String(rawArgv[1] ?? "").trim()) {
    return [rawArgv[0], ...splitRawArgumentString(rawArgv[1])];
  }
  return rawArgv;
}

function rejectPublicContextOverrides(rawArgv) {
  const [command, ...argv] = normalizeArgv(rawArgv);
  if (!PUBLIC_COMMANDS.has(command)) return;
  const forbidden = argv.find((value) =>
    /^(?:--cwd|--env-file)(?:=|$)/.test(value) || /^(?:-C)(?:=|$)/.test(value)
  );
  if (forbidden) {
    throw new Error(
      `Unsupported model-facing option ${forbidden}. CC lifecycle calls inherit the Codex working directory and use the Plugin's fixed environment.`
    );
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
  const cli = path.join(checkout, "runtime", "cli.mjs");
  const envFile = existing(path.join(checkout, "config", "runtime.env"));
  const manifest = path.join(
    checkout,
    "plugins",
    "cc-for-pein",
    ".codex-plugin",
    "plugin.json"
  );
  if (!existing(cli) || !envFile || !existing(manifest)) {
    throw new Error(`Fixed CC runtime checkout is invalid: ${checkout}`);
  }
  const plugin = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (plugin.name !== "cc-for-pein") {
    throw new Error(`Unexpected plugin identity at ${checkout}: ${plugin.name ?? "missing"}`);
  }
  return { checkout, cli, envFile };
}

function main() {
  const inherited = { ...process.env };
  const hostThreadId = String(inherited.CODEX_THREAD_ID ?? "").trim();
  rejectPublicContextOverrides(process.argv.slice(2));
  const { checkout, cli, envFile } = resolveCheckout();
  const configured = parseEnv(envFile);
  delete configured.CODEX_THREAD_ID;
  delete configured.CC_TRUSTED_OWNER_ROOT_ID;
  const env = {
    ...inherited,
    ...configured,
    CC_RUNTIME_CHECKOUT: checkout,
    CC_RUNTIME_ENV_FILE: envFile,
    CC_RUNTIME_SOURCE_ROOT: checkout,
  };
  if (hostThreadId) {
    env.CODEX_THREAD_ID = hostThreadId;
    env.CC_TRUSTED_OWNER_ROOT_ID = hostThreadId;
  } else {
    delete env.CC_TRUSTED_OWNER_ROOT_ID;
  }
  const child = spawn(process.execPath, ["--", cli, ...process.argv.slice(2)], {
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

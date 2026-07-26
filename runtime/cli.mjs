#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { parseArgs, splitRawArgumentString } from "./args.mjs";
import { readStdinIfPiped } from "./input.mjs";
import { createClaudeRuntime } from "./index.mjs";
import { createInternalClaudeRuntime } from "./internal-runtime.mjs";

const PUBLIC_COMMANDS = new Set([
  "spawn_agent",
  "send_message",
  "followup_task",
  "wait_agent",
  "interrupt_agent",
  "list_agents",
]);

function usage() {
  return [
    "Usage:",
    "  node runtime/cli.mjs spawn_agent --task-name <name> --fork-turns none --model <sonnet|opus> [options] <message>",
    "  node runtime/cli.mjs send_message <exact-target> <message>",
    "  node runtime/cli.mjs followup_task <exact-target> <message>",
    "  node runtime/cli.mjs wait_agent [--timeout-ms <ms>] [--acknowledge-tokens <csv>]",
    "  node runtime/cli.mjs interrupt_agent <exact-target>",
    "  node runtime/cli.mjs list_agents [--path-prefix </root/prefix>]",
    "",
    "Internal diagnostics:",
    "  node runtime/cli.mjs readiness",
  ].join("\n");
}

function normalizeArgv(argv) {
  if (argv.length === 1 && String(argv[0] ?? "").trim()) {
    return splitRawArgumentString(argv[0]);
  }
  return argv;
}

function parse(argv, config = {}) {
  return parseArgs(normalizeArgv(argv), {
    valueOptions: ["cwd", "env-file", ...(config.valueOptions ?? [])],
    booleanOptions: ["json", ...(config.booleanOptions ?? [])],
    aliasMap: { C: "cwd", m: "model", ...(config.aliasMap ?? {}) },
  });
}

function runtimeOptions(options) {
  return {
    cwd: options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd(),
    envFile: options["env-file"] ?? null,
    env: process.env,
  };
}

function output(payload, json = false) {
  const text = JSON.stringify(payload, null, 2);
  process.stdout.write(json ? `${text}\n` : `${text}\n`);
}

function rejectForbiddenPublicArgs(argv) {
  const forbidden = argv.find((value) =>
    /^(?:--all|--owner(?:-root|-session)?-id|--resume-session|--session-id|--agent-type|--service-tier)(?:=|$)/.test(value)
  );
  if (forbidden) {
    throw new Error(
      `Unsupported model-facing option ${forbidden}. Cross-root listing and foreign-session adoption are not public lifecycle operations.`
    );
  }
}

function messageFrom(options, positionals, startIndex = 0) {
  if (options.message != null) return String(options.message);
  const positional = positionals.slice(startIndex).join(" ");
  return positional || readStdinIfPiped();
}

async function spawnAgent(argv) {
  rejectForbiddenPublicArgs(argv);
  const { options, positionals } = parse(argv, {
    valueOptions: [
      "task-name",
      "message",
      "fork-turns",
      "description",
      "model",
      "reasoning-effort",
      "execution-profile",
      "permission-mode",
      "allowed-tools",
      "prompt-file",
    ],
    booleanOptions: ["write", "dangerously-skip-permissions"],
  });
  const cwd = runtimeOptions(options).cwd;
  const message = options["prompt-file"]
    ? fs.readFileSync(path.resolve(cwd, options["prompt-file"]), "utf8")
    : messageFrom(options, positionals);
  const receipt = await createClaudeRuntime(runtimeOptions(options)).spawn_agent({
    task_name: options["task-name"],
    message,
    fork_turns: options["fork-turns"],
    description: options.description,
    model: options.model,
    reasoning_effort: options["reasoning-effort"],
    execution_profile: options["execution-profile"],
    write: Boolean(options.write),
    permission_mode: options["permission-mode"],
    dangerously_skip_permissions: options["dangerously-skip-permissions"] ? true : undefined,
    allowed_tools: options["allowed-tools"],
  });
  output(receipt, options.json);
}

function targetAndMessage(options, positionals) {
  const target = options.target ?? positionals[0];
  const message = messageFrom(options, positionals, options.target ? 0 : 1);
  return { target, message };
}

function sendMessage(argv) {
  rejectForbiddenPublicArgs(argv);
  const { options, positionals } = parse(argv, { valueOptions: ["target", "message"] });
  const receipt = createClaudeRuntime(runtimeOptions(options)).send_message(
    targetAndMessage(options, positionals)
  );
  output(receipt, options.json);
}

async function followupTask(argv) {
  rejectForbiddenPublicArgs(argv);
  const { options, positionals } = parse(argv, {
    valueOptions: [
      "target",
      "message",
      "reasoning-effort",
      "execution-profile",
      "permission-mode",
      "allowed-tools",
    ],
    booleanOptions: ["write", "dangerously-skip-permissions"],
  });
  const receipt = await createClaudeRuntime(runtimeOptions(options)).followup_task({
    ...targetAndMessage(options, positionals),
    reasoning_effort: options["reasoning-effort"],
    execution_profile: options["execution-profile"],
    write: options.write ? true : undefined,
    permission_mode: options["permission-mode"],
    dangerously_skip_permissions: options["dangerously-skip-permissions"] ? true : undefined,
    allowed_tools: options["allowed-tools"],
  });
  output(receipt, options.json);
}

async function waitAgent(argv) {
  rejectForbiddenPublicArgs(argv);
  const { options, positionals } = parse(argv, {
    valueOptions: ["timeout-ms", "acknowledge-tokens"],
  });
  if (positionals.length > 0) {
    throw new Error("wait_agent is root-scoped and does not accept an Agent target.");
  }
  const receipt = await createClaudeRuntime(runtimeOptions(options)).wait_agent({
    timeout_ms: options["timeout-ms"],
    acknowledge_tokens: String(options["acknowledge-tokens"] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  });
  output(receipt, options.json);
}

async function interruptAgent(argv) {
  rejectForbiddenPublicArgs(argv);
  const { options, positionals } = parse(argv, { valueOptions: ["target"] });
  const target = options.target ?? positionals[0];
  if (positionals.length > (options.target ? 0 : 1)) {
    throw new Error("interrupt_agent accepts exactly one target.");
  }
  const receipt = await createClaudeRuntime(runtimeOptions(options)).interrupt_agent({ target });
  output(receipt, options.json);
}

function listAgents(argv) {
  rejectForbiddenPublicArgs(argv);
  const { options, positionals } = parse(argv, { valueOptions: ["path-prefix"] });
  if (positionals.length > 0) throw new Error("list_agents accepts only --path-prefix.");
  const receipt = createClaudeRuntime(runtimeOptions(options)).list_agents({
    path_prefix: options["path-prefix"],
  });
  output(receipt, options.json);
}

async function worker(argv) {
  const { options } = parse(argv, { valueOptions: ["job-id"] });
  if (!options["job-id"]) throw new Error("worker requires --job-id.");
  await createInternalClaudeRuntime(runtimeOptions(options)).runWorker(options["job-id"]);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "spawn_agent": await spawnAgent(argv); break;
    case "send_message": sendMessage(argv); break;
    case "followup_task": await followupTask(argv); break;
    case "wait_agent": await waitAgent(argv); break;
    case "interrupt_agent": await interruptAgent(argv); break;
    case "list_agents": listAgents(argv); break;
    case "worker": await worker(argv); break;
    case "readiness": {
      const { options } = parse(argv);
      output(createInternalClaudeRuntime(runtimeOptions(options)).readiness(), options.json);
      break;
    }
    case undefined:
    case "help":
    case "--help":
      process.stdout.write(`${usage()}\n`);
      break;
    default:
      if (!PUBLIC_COMMANDS.has(command)) {
        throw new Error(`Unknown or removed command ${command}.\n${usage()}`);
      }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

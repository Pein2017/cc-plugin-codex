#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { parseArgs, splitRawArgumentString } from "./args.mjs";
import { readStdinIfPiped } from "./input.mjs";
import { createInternalClaudeRuntime } from "./internal-runtime.mjs";
import {
  renderCancel,
  renderInterrupt,
  renderJobStatus,
  renderLaunch,
  renderStatus,
  renderStoredResult,
} from "./render.mjs";

function usage() {
  return [
    "Usage:",
    "  node runtime/cli.mjs start [--profile safe|terminal-parity] [--write] [--permission-mode <mode> | --dangerously-skip-permissions] [--allowed-tools <csv>] [--resume-session <uuid>] [--wait] <task>",
    "  node runtime/cli.mjs steer <job-id> <message>",
    "  node runtime/cli.mjs follow-up <job-id> <message>",
    "  node runtime/cli.mjs interrupt <job-id>",
    "  node runtime/cli.mjs cancel <job-id>",
    "  node runtime/cli.mjs status [job-id] [--wait] [--timeout-ms <ms>] [--acknowledge-tokens <csv>]",
    "  node runtime/cli.mjs result [job-id]",
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

function runtimeFor(options) {
  return createInternalClaudeRuntime({
    cwd: options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd(),
    envFile: options["env-file"] ?? null,
    env: process.env,
  });
}

function output(payload, rendered, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(rendered);
  }
}

async function start(argv) {
  const { options, positionals } = parse(argv, {
    valueOptions: ["profile", "model", "effort", "permission-mode", "allowed-tools", "resume-session", "prompt-file", "timeout-ms"],
    booleanOptions: ["write", "wait", "background", "dangerously-skip-permissions"],
  });
  const runtime = runtimeFor(options);
  const prompt = options["prompt-file"]
    ? fs.readFileSync(path.resolve(runtime.cwd, options["prompt-file"]), "utf8")
    : positionals.join(" ") || readStdinIfPiped();
  const receipt = await runtime.start(prompt, {
    profile: options.profile,
    write: Boolean(options.write),
    model: options.model,
    effort: options.effort,
    permissionMode: options["permission-mode"],
    dangerouslySkipPermissions: options["dangerously-skip-permissions"],
    allowedTools: options["allowed-tools"],
    resumeSessionId: options["resume-session"],
  });
  if (!options.wait) {
    output(receipt, renderLaunch(receipt), options.json);
    return;
  }
  const waited = await runtime.wait(receipt.jobId, { timeoutMs: options["timeout-ms"] });
  const result = runtime.result(receipt.jobId);
  output({ receipt, waited, ...result }, renderStoredResult(result.job), options.json);
  if (result.job.status !== "completed") process.exitCode = 1;
}

async function status(argv) {
  if (argv.some((value) => value === "--all" || value.startsWith("--all="))) {
    throw new Error("Unknown option --all. Cross-root listing is available only through runtime/operator-cli.mjs.");
  }
  const { options, positionals } = parse(argv, {
    valueOptions: ["timeout-ms", "acknowledge-tokens"],
    booleanOptions: ["wait"],
  });
  const runtime = runtimeFor(options);
  const id = positionals[0] ?? null;
  if (options.wait) {
    const receipt = await runtime.wait(id, {
      timeoutMs: options["timeout-ms"],
      acknowledgeTokens: String(options["acknowledge-tokens"] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
    output(receipt, receipt.job ? renderJobStatus(receipt.job) : `${JSON.stringify(receipt, null, 2)}\n`, options.json);
    return;
  }
  const receipt = runtime.status(id);
  output(receipt, id ? renderJobStatus(receipt) : renderStatus(receipt), options.json);
}

function result(argv) {
  const { options, positionals } = parse(argv);
  const receipt = runtimeFor(options).result(positionals[0] ?? null);
  output(receipt, receipt.state === "active" ? renderJobStatus(receipt.job) : renderStoredResult(receipt.job), options.json);
}

function steer(argv) {
  const { options, positionals } = parse(argv);
  const [jobId, ...words] = positionals;
  const receipt = runtimeFor(options).steer(jobId, words.join(" "));
  output(receipt, `Steering ${receipt.sequence} queued durably for ${receipt.jobId}.\n`, options.json);
}

async function followUp(argv) {
  const { options, positionals } = parse(argv, {
    valueOptions: ["profile", "model", "effort", "permission-mode", "allowed-tools"],
    booleanOptions: ["write", "dangerously-skip-permissions"],
  });
  const [jobId, ...words] = positionals;
  const receipt = await runtimeFor(options).followUp(jobId, words.join(" "), {
    profile: options.profile,
    model: options.model,
    effort: options.effort,
    permissionMode: options["permission-mode"],
    dangerouslySkipPermissions: options["dangerously-skip-permissions"],
    allowedTools: options["allowed-tools"],
    ...(options.write ? { write: true } : {}),
  });
  output(receipt, renderLaunch(receipt), options.json);
}

async function interrupt(argv) {
  const { options, positionals } = parse(argv);
  const receipt = await runtimeFor(options).interrupt(positionals[0]);
  output(receipt, renderInterrupt(receipt), options.json);
}

async function cancel(argv) {
  const { options, positionals } = parse(argv);
  const receipt = await runtimeFor(options).cancel(positionals[0]);
  output(receipt, renderCancel(receipt), options.json);
}

async function worker(argv) {
  const { options } = parse(argv, { valueOptions: ["job-id"] });
  if (!options["job-id"]) throw new Error("worker requires --job-id.");
  await runtimeFor(options).runWorker(options["job-id"]);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "start":
    case "task":
      await start(argv);
      break;
    case "status": await status(argv); break;
    case "result": result(argv); break;
    case "steer": steer(argv); break;
    case "follow-up": await followUp(argv); break;
    case "interrupt": await interrupt(argv); break;
    case "cancel": await cancel(argv); break;
    case "worker": await worker(argv); break;
    case "readiness": {
      const { options } = parse(argv);
      const receipt = runtimeFor(options).readiness();
      output(receipt, `${receipt.ready ? "ready" : "not ready"}: ${receipt.auth.detail}\n`, options.json);
      break;
    }
    case undefined:
    case "help":
    case "--help":
      process.stdout.write(`${usage()}\n`);
      break;
    default:
      throw new Error(`Unknown command ${command}.\n${usage()}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

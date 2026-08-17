#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import path from "node:path";
import process from "node:process";

import { createAgentStore } from "./agent-store.mjs";
import { parseArgs } from "./args.mjs";
import { createInternalClaudeRuntime } from "./internal-runtime.mjs";
import {
  appendDisposition,
  buildUsageReport,
} from "./operator-usage-ledger.mjs";

function usage() {
  return [
    "Usage:",
    "  node runtime/operator-cli.mjs list-agents --all [--cwd <path>] [--env-file <path>] [--json]",
    "  node runtime/operator-cli.mjs list-harnesses --all [--cwd <path>] [--env-file <path>] [--json]",
    "  node runtime/operator-cli.mjs record-disposition --delivery-token <opaque-token> --disposition <accepted_first_pass|accepted_after_correction|rejected_or_escalated|surface_failure> [--json]",
    "  node runtime/operator-cli.mjs usage-report --all [--days <positive-integer>] [--until <UTC-timestamp>] [--json]",
    "",
    "These are explicit operator diagnostics. Plugin skills and model-facing tools never invoke them.",
  ].join("\n");
}

function output(payload, pretty) {
  process.stdout.write(`${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`);
}

function parsePositiveDays(value) {
  if (value == null) return 7;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("Operator usage-report --days must be a positive integer.");
  }
  const days = Number(value);
  if (!Number.isSafeInteger(days)) {
    throw new Error("Operator usage-report --days must be a safe positive integer.");
  }
  return days;
}

function listAgents(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd", "env-file"],
    booleanOptions: ["all", "json"],
  });
  if (!options.all || positionals.length > 0) {
    throw new Error("Operator list-agents requires explicit --all and accepts no target.");
  }
  const runtime = createInternalClaudeRuntime({
    cwd: options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd(),
    envFile: options["env-file"] ?? null,
    env: process.env,
    operatorMode: true,
    ownerRootId: "operator-diagnostic",
  });
  const store = createAgentStore({
    cwd: runtime.cwd,
    ownerRootId: "operator-diagnostic",
    claudeConfigDir: runtime.env.CLAUDE_CONFIG_DIR,
  });
  output({
    workspaceRoot: runtime.cwd,
    operatorMode: true,
    readOnly: true,
    agents: store.listAllAgents(),
  }, options.json);
}

/**
 * Observe the admitted Harnesses and their instances. Inspection only: this
 * neither spawns, routes, ranks, nor repairs anything, and it mirrors exactly
 * what the model-facing listing reports.
 */
async function listHarnesses(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["cwd", "env-file"],
    booleanOptions: ["all", "json"],
  });
  if (!options.all || positionals.length > 0) {
    throw new Error("Operator list-harnesses requires explicit --all and accepts no target.");
  }
  const runtime = createInternalClaudeRuntime({
    cwd: options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd(),
    envFile: options["env-file"] ?? null,
    env: process.env,
    operatorMode: true,
    ownerRootId: "operator-diagnostic",
  });
  output({
    workspaceRoot: runtime.cwd,
    operatorMode: true,
    readOnly: true,
    harnesses: await runtime.inspectAdmittedHarnesses(),
  }, options.json);
}

function recordDisposition(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["delivery-token", "disposition"],
    booleanOptions: ["json"],
  });
  if (positionals.length > 0 || !options["delivery-token"] || !options.disposition) {
    throw new Error("Operator record-disposition requires --delivery-token and --disposition and accepts no positional values.");
  }
  output(appendDisposition({
    deliveryToken: options["delivery-token"],
    disposition: options.disposition,
    env: process.env,
  }), options.json);
}

async function usageReport(argv) {
  const { options, positionals } = parseArgs(argv, {
    valueOptions: ["days", "until"],
    booleanOptions: ["all", "json"],
  });
  if (!options.all || positionals.length > 0) {
    throw new Error("Operator usage-report requires explicit --all and accepts no positional values.");
  }
  const report = await buildUsageReport({
    days: parsePositiveDays(options.days),
    until: options.until,
    env: process.env,
  });
  output(report, options.json);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if ([undefined, "help", "--help"].includes(command)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === "list-agents") {
    listAgents(argv);
    return;
  }
  if (command === "list-harnesses") {
    await listHarnesses(argv);
    return;
  }
  if (command === "record-disposition") {
    recordDisposition(argv);
    return;
  }
  if (command === "usage-report") {
    await usageReport(argv);
    return;
  }
  throw new Error(`Unknown operator command ${command}.\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

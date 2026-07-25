#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import path from "node:path";
import process from "node:process";

import { parseArgs } from "./args.mjs";
import { createInternalClaudeRuntime } from "./internal-runtime.mjs";

function usage() {
  return [
    "Usage:",
    "  node runtime/operator-cli.mjs list-jobs --all [--cwd <path>] [--env-file <path>] [--json]",
    "",
    "This CLI is an explicit read-only operator diagnostic. It is not used by plugin skills.",
  ].join("\n");
}

function redactedJob(job) {
  return {
    id: job.id,
    ownerRootId: job.ownerRootId ?? job.sessionId ?? null,
    status: job.status,
    summary: job.summary ?? null,
    workspaceRoot: job.workspaceRoot ?? null,
    createdAt: job.createdAt ?? null,
    updatedAt: job.updatedAt ?? null,
    hasClaudeSession: Boolean(job.threadId ?? job.result?.sessionId),
    requiresAttention: Boolean(job.requiresAttention ?? job.result?.requiresAttention),
  };
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  if ([undefined, "help", "--help"].includes(command)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== "list-jobs") throw new Error(`Unknown operator command ${command}.\n${usage()}`);
  const { options } = parseArgs(argv, {
    valueOptions: ["cwd", "env-file"],
    booleanOptions: ["all", "json"],
  });
  if (!options.all) throw new Error("Operator list-jobs requires explicit --all.");
  const runtime = createInternalClaudeRuntime({
    cwd: options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd(),
    envFile: options["env-file"] ?? null,
    env: process.env,
    operatorMode: true,
  });
  const payload = { workspaceRoot: runtime.cwd, jobs: runtime.operatorListAllJobs().map(redactedJob) };
  process.stdout.write(`${JSON.stringify(payload, null, options.json ? 2 : 0)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

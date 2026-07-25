#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import path from "node:path";
import process from "node:process";

import { createAgentStore } from "./agent-store.mjs";
import { parseArgs } from "./args.mjs";
import { createInternalClaudeRuntime } from "./internal-runtime.mjs";

function usage() {
  return [
    "Usage:",
    "  node runtime/operator-cli.mjs list-agents --all [--cwd <path>] [--env-file <path>] [--json]",
    "",
    "This is an explicit read-only operator diagnostic. Plugin skills never invoke it.",
  ].join("\n");
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  if ([undefined, "help", "--help"].includes(command)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== "list-agents") throw new Error(`Unknown operator command ${command}.\n${usage()}`);
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
  const payload = {
    workspaceRoot: runtime.cwd,
    operatorMode: true,
    readOnly: true,
    agents: store.listAllAgents(),
  };
  process.stdout.write(`${JSON.stringify(payload, null, options.json ? 2 : 0)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

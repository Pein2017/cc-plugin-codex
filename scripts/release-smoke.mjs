#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assertCheckoutDependencies } from "../plugins/cc-for-pein/bootstrap/dependency-preflight.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(argv) {
  let json = false;
  let realClaude = false;
  let nativeTeamWitness = false;
  let workspace = sourceRoot;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") json = true;
    else if (argument === "--real-claude") realClaude = true;
    else if (argument === "--native-team-witness") nativeTeamWitness = true;
    else if (argument === "--workspace") {
      workspace = path.resolve(argv[++index] ?? "");
      if (!argv[index]) throw new Error("--workspace requires a path.");
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        "Usage: npm run smoke:release -- [--json] [--workspace <path>] [--real-claude | --native-team-witness]\n" +
        "Default is zero-model-cost. --real-claude adds one Haiku 4.5 low read-only MCP smoke; --native-team-witness directly runs one paid Opus low read-only production-Driver witness.\n",
      );
      process.exit(0);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (realClaude && nativeTeamWitness) {
    throw new Error("--real-claude and --native-team-witness are mutually exclusive paid smoke modes.");
  }
  return { json, realClaude, nativeTeamWitness, workspace };
}

try {
  const options = parseArguments(process.argv.slice(2));
  assertCheckoutDependencies(sourceRoot);
  const { runNativeTeamWitness, runReleaseSmoke } = await import("../runtime/release-smoke.mjs");
  const report = options.nativeTeamWitness
    ? await (() => {
      process.stderr.write(
        "Starting explicit paid native-team witness: claude-opus-5, effort=low, write=false.\n",
      );
      return runNativeTeamWitness({ sourceRoot });
    })()
    : await runReleaseSmoke({
      workspace: options.workspace,
      realClaude: options.realClaude,
      onPaidStart(receipt) {
        process.stderr.write(
          `Starting explicit paid smoke: ${receipt.model}, effort=${receipt.reasoningEffort}, write=${receipt.write}.\n`,
        );
      },
    });
  process.stdout.write(`${JSON.stringify(report, null, options.json ? 2 : 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

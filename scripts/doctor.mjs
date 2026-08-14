#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import process from "node:process";

import { runDoctor } from "../runtime/operator-diagnostics.mjs";

function parseArguments(argv) {
  let json = false;
  for (const argument of argv) {
    if (argument === "--json") json = true;
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write("Usage: npm run doctor -- [--json]\nOperator-only, redacted, and zero-model-cost.\n");
      process.exit(0);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return { json };
}

function renderHuman(report) {
  const lines = [`HarnessDock for Codex doctor: ${report.status.toUpperCase()}`];
  for (const check of report.checks) {
    lines.push(`${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.summary}`);
    if (check.recovery) lines.push(`     recovery: ${check.recovery}`);
  }
  return `${lines.join("\n")}\n`;
}

try {
  const { json } = parseArguments(process.argv.slice(2));
  const report = await runDoctor();
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report));
  if (report.status === "fail") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

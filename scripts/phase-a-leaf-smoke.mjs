#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 8.3 operator entry point: one explicitly authorized real Claude Code
 * read-only leaf smoke through the production Driver/Supervisor seam.
 *
 * Usage:
 *   node scripts/phase-a-leaf-smoke.mjs --authorize --fence-file <path> [--max-ms <ms>]
 *
 * `--authorize` and `--fence-file` are both mandatory and have no defaults:
 * without them this script reaches no Driver, creates no durable state, and
 * costs nothing. The fence is created atomically before any Driver work and is
 * never removed, so one fence path admits exactly one authorized attempt.
 * Exactly one native attempt is made per invocation and nothing is ever
 * retried; a second real call would be a second explicitly authorized decision
 * with its own fresh fence path.
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assertCheckoutDependencies } from "../plugins/codex-harnessdock/bootstrap/dependency-preflight.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = [
  "Usage: node scripts/phase-a-leaf-smoke.mjs --authorize --fence-file <path> [--max-ms <ms>]",
  "",
  "Runs exactly one authorized real Claude Code read-only leaf turn (claude-haiku-4-5, effort=low,",
  "write=false, leaf delegation, no Native Agent Team, no follow-up) in a disposable Git workspace",
  "through the production Driver, supervisor session, and version-three worker loop.",
  "--fence-file must be an absolute path outside this checkout that does not exist yet; it is created",
  "atomically before any Driver work and is never removed, so it admits exactly one authorized attempt.",
  "Exit codes: 0 verified, 2 auth/account/quota stopped (stop further real calls), 1 otherwise.",
].join("\n");

function parseArguments(argv) {
  const options = { authorized: false, fenceFile: null, maxMs: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--authorize") options.authorized = true;
    else if (argument === "--fence-file") {
      const value = argv[++index];
      if (!value) throw new Error("--fence-file requires a path.");
      options.fenceFile = path.resolve(value);
    } else if (argument === "--max-ms") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("--max-ms requires a positive integer.");
      options.maxMs = value;
    } else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

/** A bounded local refusal receipt. Nothing was consumed, so nothing is spent. */
function localRefusal(failureClass) {
  return {
    version: 1,
    phase: "A",
    status: "preflight_rejected",
    failureClass,
    stopFurtherRealCalls: false,
  };
}

function exitCodeFor(status) {
  if (status === "verified") return 0;
  if (status === "auth_or_quota_stopped") return 2;
  return 1;
}

export async function runPhaseALeafSmokeCli(argv, dependencies = {}) {
  const writeStdout = dependencies.writeStdout ?? ((value) => process.stdout.write(value));
  const writeStderr = dependencies.writeStderr ?? ((value) => process.stderr.write(value));
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    return 1;
  }
  if (options.help) {
    writeStdout(`${USAGE}\n`);
    return 0;
  }
  // Both refusals are local, before any Driver, durable record, fence, or
  // native call, and neither consumes an authorized attempt.
  if (!options.authorized) {
    writeStderr(`This smoke makes one real, billed Claude call and requires explicit --authorize.\n${USAGE}\n`);
    writeStdout(`${JSON.stringify(localRefusal("preflight_not_authorized"), null, 2)}\n`);
    return 1;
  }
  if (!options.fenceFile) {
    writeStderr(
      "--authorize requires --fence-file <absolute path>: the durable one-shot fence is mandatory, " +
      `so one authorized attempt can never be replayed.\n${USAGE}\n`,
    );
    writeStdout(`${JSON.stringify(localRefusal("preflight_fence_required"), null, 2)}\n`);
    return 1;
  }
  try {
    (dependencies.assertCheckoutDependencies ?? assertCheckoutDependencies)(sourceRoot);
  } catch (error) {
    writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const runPhaseALeafSmoke = dependencies.runPhaseALeafSmoke
    ?? (await import("../runtime/phase-a-leaf-smoke.mjs")).runPhaseALeafSmoke;
  writeStderr(
    "Starting the one authorized Phase-A leaf smoke: claude-haiku-4-5, effort=low, write=false, " +
    "leaf delegation, disposable Git workspace, one native attempt with reconnect pinned to zero. " +
    "It is not retried, and its durable fence is not removed.\n",
  );
  let receipt;
  try {
    receipt = await runPhaseALeafSmoke({
      authorized: true,
      sourceRoot,
      fenceFile: options.fenceFile,
      ...(options.maxMs == null ? {} : { maxMs: options.maxMs }),
    });
  } catch {
    // The runner itself is the only thing that may classify an attempt, and it
    // never rethrows. Anything that still escapes is reported as unknown, and
    // never as a terminal success or a safe-to-retry state.
    writeStdout(`${JSON.stringify({
      version: 1,
      phase: "A",
      status: "unverified",
      failureClass: "internal_error",
      // The fence was already consumed by the time the runner could throw, so
      // this attempt is spent whatever happened inside it.
      stopFurtherRealCalls: true,
    }, null, 2)}\n`);
    return 1;
  }
  writeStdout(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.status === "auth_or_quota_stopped") {
    writeStderr("Account, authentication, or quota evidence observed: stop further real Claude calls.\n");
  }
  return exitCodeFor(receipt.status);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPhaseALeafSmokeCli(process.argv.slice(2));
}

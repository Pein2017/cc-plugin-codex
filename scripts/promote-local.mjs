#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { acquirePromotionGate } from "../runtime/promotion-gate.mjs";
import { classifyPromotionPaths } from "./promotion-policy.mjs";

export const LIVE_CHECKOUT = "/data/CoordExp/codex-harnessdock";
export const DEVELOPMENT_CHECKOUT = "/data/CoordExp/codex-harnessdock-dev";

function commandFailure(command, result) {
  return new Error(
    [
      `${command.join(" ")} failed with exit code ${result.status ?? "unknown"}.`,
      result.stderr?.trim(),
      result.stdout?.trim(),
    ].filter(Boolean).join("\n"),
  );
}

function defaultRun(command, options = {}) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: options.cwd,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) throw commandFailure(command, result);
  return result;
}

function output(run, cwd, args) {
  return run(["git", ...args], { cwd }).stdout.trim();
}

function assertExactCheckout(run, checkout, branch) {
  const canonical = fs.realpathSync.native(checkout);
  if (canonical !== path.resolve(checkout)) {
    throw new Error(`Checkout path must not resolve through a symlink: ${checkout}`);
  }
  const topLevel = fs.realpathSync.native(output(run, canonical, ["rev-parse", "--show-toplevel"]));
  if (topLevel !== canonical) throw new Error(`Unexpected Git top-level for ${checkout}: ${topLevel}`);
  const currentBranch = output(run, canonical, ["branch", "--show-current"]);
  if (currentBranch !== branch) {
    throw new Error(`Expected ${checkout} on branch ${branch}, found ${currentBranch || "detached HEAD"}.`);
  }
  const status = output(run, canonical, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error(`Promotion requires a clean ${branch} checkout at ${checkout}.`);
  const commonDirectory = fs.realpathSync.native(
    output(run, canonical, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  );
  return { canonical, commonDirectory };
}

function isAncestor(run, cwd, ancestor, descendant) {
  const result = run(["git", "merge-base", "--is-ancestor", ancestor, descendant], {
    cwd,
    allowFailure: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw commandFailure(["git", "merge-base", "--is-ancestor", ancestor, descendant], result);
}

function changedPaths(run, cwd, fromCommit, toCommit) {
  const value = output(run, cwd, ["diff", "--name-only", "-z", fromCommit, toCommit]);
  return value.split("\0").filter(Boolean);
}

function nextAction(classification) {
  if (classification.activation !== "restart_required") {
    return "Existing Codex tasks use the promoted implementation on their next MCP call; no Plugin refresh is required.";
  }
  const steps = [];
  const decisive = classification.decisivePaths;
  if (decisive.includes("package-lock.json")) {
    steps.push(`Run npm ci in ${LIVE_CHECKOUT}.`);
  }
  if (decisive.includes("runtime/mcp-api.mjs")) {
    steps.push(`Run npm run release:local in ${LIVE_CHECKOUT}.`);
  } else if (decisive.some((candidate) => candidate.startsWith("plugins/") || candidate.startsWith(".agents/"))) {
    steps.push(
      `Run npm run refresh:local in ${LIVE_CHECKOUT}, or release:local if the Plugin version changed.`,
    );
  }
  if (steps.length === 0) steps.push("No Plugin refresh is required.");
  steps.push("Start a new Codex task.");
  return steps.join(" ");
}

export async function promoteLocal(options = {}) {
  if (process.platform !== "linux" && !options.allowUnsupportedPlatform) {
    throw new Error("Local two-track promotion is supported only on Linux.");
  }
  const run = options.run ?? defaultRun;
  const live = assertExactCheckout(run, options.liveCheckout ?? LIVE_CHECKOUT, "main");
  const development = assertExactCheckout(
    run,
    options.developmentCheckout ?? DEVELOPMENT_CHECKOUT,
    "developer",
  );
  if (live.commonDirectory !== development.commonDirectory) {
    throw new Error("Live and development checkouts do not share the same Git common directory.");
  }

  const fromCommit = output(run, live.canonical, ["rev-parse", "HEAD"]);
  const toCommit = output(run, development.canonical, ["rev-parse", "HEAD"]);
  if (fromCommit === toCommit) {
    return {
      version: 1,
      operation: "promote_local",
      status: "up_to_date",
      fromCommit,
      toCommit,
      activation: "hot_compatible",
      changedPathCount: 0,
      decisivePaths: [],
      nextAction: "No promotion or Plugin action is required.",
    };
  }
  if (!isAncestor(run, live.canonical, fromCommit, toCommit)) {
    throw new Error("developer does not descend from main; resolve branch divergence explicitly before promotion.");
  }

  const classification = classifyPromotionPaths(changedPaths(run, live.canonical, fromCommit, toCommit));
  const runAcceptance = options.runAcceptance ?? (() => {
    run(["npm", "run", "check"], { cwd: development.canonical });
  });
  await runAcceptance({ live, development, fromCommit, toCommit, classification });

  const checkedLive = assertExactCheckout(run, live.canonical, "main");
  const checkedDevelopment = assertExactCheckout(run, development.canonical, "developer");
  if (output(run, checkedLive.canonical, ["rev-parse", "HEAD"]) !== fromCommit) {
    throw new Error("main changed while acceptance was running; retry promotion from the new baseline.");
  }
  if (output(run, checkedDevelopment.canonical, ["rev-parse", "HEAD"]) !== toCommit) {
    throw new Error("developer changed after acceptance began; rerun acceptance for the new commit.");
  }

  const gateDirectory = options.gateDirectory
    ?? path.join(live.commonDirectory, "codex-harnessdock-promotion-gate");
  const gate = await acquirePromotionGate({
    gateDirectory,
    timeoutMs: options.gateTimeoutMs,
    pollMs: options.gatePollMs,
  });
  try {
    const gatedLive = assertExactCheckout(run, live.canonical, "main");
    const gatedDevelopment = assertExactCheckout(run, development.canonical, "developer");
    if (output(run, gatedLive.canonical, ["rev-parse", "HEAD"]) !== fromCommit) {
      throw new Error("main changed before the promotion gate was acquired; retry from the new baseline.");
    }
    if (output(run, gatedDevelopment.canonical, ["rev-parse", "HEAD"]) !== toCommit) {
      throw new Error("developer changed before the promotion gate was acquired; rerun acceptance.");
    }
    run(["git", "merge", "--ff-only", toCommit], { cwd: live.canonical });
    const promotedCommit = output(run, live.canonical, ["rev-parse", "HEAD"]);
    if (promotedCommit !== toCommit) {
      throw new Error(`Promotion ended at unexpected commit ${promotedCommit}; expected ${toCommit}.`);
    }
  } finally {
    gate.release();
  }

  return {
    version: 1,
    operation: "promote_local",
    status: "promoted",
    fromCommit,
    toCommit,
    ...classification,
    nextAction: nextAction(classification),
  };
}

async function main() {
  if (process.argv.length > 2) throw new Error("promote:local accepts no path or branch overrides.");
  if (fs.realpathSync.native(process.cwd()) !== fs.realpathSync.native(DEVELOPMENT_CHECKOUT)) {
    throw new Error(`Run promote:local from ${DEVELOPMENT_CHECKOUT}.`);
  }
  const receipt = await promoteLocal();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

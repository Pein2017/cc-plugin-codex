#!/usr/bin/env node
/** SPDX-License-Identifier: Apache-2.0 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createInternalClaudeRuntime } from "../runtime/internal-runtime.mjs";

const PROMPT = "Reply exactly CC_CAPACITY_OK; do not use tools";
const DEFAULT_LEVELS = [1, 3, 6];
const DEFAULT_TIMEOUT_MS = 180_000;
const MIN_AVAILABLE_MEMORY_BYTES = 2 * 1024 ** 3;
const MAX_AVAILABLE_MEMORY_DROP_RATIO = 0.25;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function availableMemoryBytes() {
  if (process.platform !== "linux") return null;
  try {
    const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(fs.readFileSync("/proc/meminfo", "utf8"));
    return match ? Number(match[1]) * 1024 : null;
  } catch {
    return null;
  }
}

function processRssBytes(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || process.platform === "win32") return null;
  const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) return null;
  const kib = Number(result.stdout.trim());
  return Number.isFinite(kib) ? kib * 1024 : null;
}

function latencyMs(job) {
  const start = Date.parse(job.startedAt ?? job.createdAt ?? "");
  const end = Date.parse(job.completedAt ?? job.updatedAt ?? "");
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
}

function stopDecision(levelReceipt, hostBaselineAvailable) {
  if (levelReceipt.failures.length > 0) return "terminal_failure";
  if (!levelReceipt.postTerminalClean) return "resident_process_or_identity";
  if (levelReceipt.leaseConflicts.length > 0) return "session_lease_conflict";
  const after = levelReceipt.hostAvailableAfterBytes;
  if (after != null && after < MIN_AVAILABLE_MEMORY_BYTES) return "low_available_memory";
  if (after != null && hostBaselineAvailable != null) {
    const dropRatio = Math.max(0, hostBaselineAvailable - after) / hostBaselineAvailable;
    if (dropRatio > MAX_AVAILABLE_MEMORY_DROP_RATIO) return "available_memory_drop";
  }
  return null;
}

async function runLevel(runtime, concurrency, timeoutMs, hostBaselineAvailable) {
  const startedAt = new Date().toISOString();
  const launches = await Promise.all(
    Array.from({ length: concurrency }, (_, index) => runtime.start(PROMPT, {
      profile: "terminal-parity",
      write: false,
      title: `CC capacity ${concurrency}.${index + 1}`,
    }))
  );
  const jobIds = launches.map((launch) => launch.jobId);
  const peakByJob = Object.fromEntries(jobIds.map((id) => [id, 0]));
  let aggregatePeakRssBytes = 0;
  const deadline = Date.now() + timeoutMs;
  let jobs = [];
  while (Date.now() < deadline) {
    jobs = jobIds.map((id) => runtime.status(id));
    let aggregate = 0;
    for (const job of jobs) {
      const pids = [...new Set([job.workerPid, job.pid].filter(Number.isSafeInteger))];
      const rss = pids.reduce((sum, pid) => sum + (processRssBytes(pid) ?? 0), 0);
      peakByJob[job.id] = Math.max(peakByJob[job.id], rss);
      aggregate += rss;
    }
    aggregatePeakRssBytes = Math.max(aggregatePeakRssBytes, aggregate);
    if (jobs.every((job) => ["completed", "failed", "interrupted", "cancelled"].includes(job.status))) break;
    await sleep(250);
  }
  jobs = jobIds.map((id) => runtime.status(id));
  const timedOut = jobs.some((job) => !["completed", "failed", "interrupted", "cancelled"].includes(job.status));
  const failures = jobs
    .filter((job) => job.status !== "completed" || job.result?.rawOutput?.trim() !== "CC_CAPACITY_OK")
    .map((job) => ({ id: job.id, status: job.status, output: job.result?.rawOutput ?? null }));
  if (timedOut) failures.push({ id: null, status: "timed_out", output: null });
  const leaseConflicts = jobs
    .filter((job) => /already owned|lease/i.test(job.errorMessage ?? job.result?.failureReason ?? ""))
    .map((job) => job.id);
  const postTerminalClean = jobs.every((job) =>
    job.pid == null &&
    job.pidIdentity == null &&
    job.workerPid == null &&
    job.workerPidIdentity == null &&
    job.residencyReceipt?.sessionLeaseReleased === true
  );
  const receipt = {
    concurrency,
    prompt: PROMPT,
    startedAt,
    completedAt: new Date().toISOString(),
    timeoutMs,
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      latencyMs: latencyMs(job),
      peakRssBytes: peakByJob[job.id],
      recoveryAttempts: job.result?.recoveryAttempts ?? null,
      outputMatched: job.result?.rawOutput?.trim() === "CC_CAPACITY_OK",
    })),
    aggregatePeakRssBytes,
    failures,
    leaseConflicts,
    postTerminalClean,
    hostAvailableAfterBytes: availableMemoryBytes(),
  };
  return { ...receipt, stopReason: stopDecision(receipt, hostBaselineAvailable) };
}

async function main() {
  const envFile = optionValue("--env-file");
  const levels = String(optionValue("--levels") ?? DEFAULT_LEVELS.join(","))
    .split(",")
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  const timeoutMs = Number(optionValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const ownerRootId = String(process.env.CODEX_THREAD_ID ?? "capacity-probe").trim();
  const env = {
    ...process.env,
    CODEX_THREAD_ID: ownerRootId,
    CC_TRUSTED_OWNER_ROOT_ID: ownerRootId,
  };
  const runtime = createInternalClaudeRuntime({
    cwd: path.resolve(optionValue("--cwd") ?? process.cwd()),
    envFile,
    env,
  });
  const hostAvailableBaselineBytes = availableMemoryBytes();
  const receipt = {
    schemaVersion: 1,
    workload: {
      prompt: PROMPT,
      oneClaudeTurn: true,
      timeoutMsPerLevel: timeoutMs,
      levels,
    },
    thresholds: {
      minimumAvailableMemoryBytes: MIN_AVAILABLE_MEMORY_BYTES,
      maximumAvailableMemoryDropRatio: MAX_AVAILABLE_MEMORY_DROP_RATIO,
      stopOnAnyFailure: true,
      stopOnLeaseConflict: true,
      stopOnResidentProcess: true,
    },
    hostAvailableBaselineBytes,
    levels: [],
  };
  for (const concurrency of levels) {
    const level = await runLevel(runtime, concurrency, timeoutMs, hostAvailableBaselineBytes);
    receipt.levels.push(level);
    if (level.stopReason) break;
  }
  receipt.decision = receipt.levels.at(-1)?.stopReason
    ? { capRequired: true, observedBoundary: receipt.levels.at(-1).concurrency, reason: receipt.levels.at(-1).stopReason }
    : { capRequired: false, observedBoundary: null, reason: "all_planned_levels_safe" };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.levels.some((level) => level.failures.length > 0)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});

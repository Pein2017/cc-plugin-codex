/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read models over persisted Claude runtime jobs.
 */

import fs from "node:fs";

import {
  listJobs,
  readJobFile,
  resolveJobFile,
  resolveJobLogFile,
} from "./job-store.mjs";
import { OWNER_ROOT_ID_ENV } from "./job-runner.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";

export const DEFAULT_MAX_STATUS_JOBS = 15;
export const DEFAULT_MAX_PROGRESS_LINES = 4;

export function sortJobsNewestFirst(jobs) {
  return [...jobs].sort((left, right) =>
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
  );
}

function getCurrentOwnerRootId(options = {}) {
  return (
    options.env?.[OWNER_ROOT_ID_ENV] ??
    process.env[OWNER_ROOT_ID_ENV] ??
    process.env.CODEX_THREAD_ID ??
    null
  );
}

function filterJobsForCurrentSession(jobs, options = {}) {
  const ownerRootId = getCurrentOwnerRootId(options);
  if (!ownerRootId) return [];
  return jobs.filter((job) => (job.ownerRootId ?? job.sessionId) === ownerRootId);
}

function getJobTypeLabel(job) {
  if (typeof job.kindLabel === "string" && job.kindLabel) return job.kindLabel;
  if (job.jobClass === "task") return "run";
  if (job.kind === "task") return "run";
  return "job";
}

function stripLogPrefix(line) {
  return line.replace(/^\[[^\]]+\]\s*/, "").trim();
}

export function readJobProgressPreview(logFile, maxLines = DEFAULT_MAX_PROGRESS_LINES) {
  if (!logFile || !fs.existsSync(logFile)) return [];
  const lines = fs
    .readFileSync(logFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .filter((l) => l.startsWith("["))
    .map(stripLogPrefix)
    .filter(Boolean);
  return lines.slice(-maxLines);
}

function formatElapsedDuration(startValue, endValue = null) {
  const start = Date.parse(startValue ?? "");
  if (!Number.isFinite(start)) return null;
  const end = endValue ? Date.parse(endValue) : Date.now();
  if (!Number.isFinite(end) || end < start) return null;
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const ACTIVE_STATUSES = new Set(["harness_queued", "running", "interrupting", "cancelling"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
  "unknown",
]);

function inferJobPhase(job, progressPreview = []) {
  switch (job.status) {
    case "cancelled": return "cancelled";
    case "cancel_failed": return "cancel_failed";
    case "cancelling": return "cancelling";
    case "interrupted": return "interrupted";
    case "interrupt_failed": return "interrupt_failed";
    case "interrupting": return "interrupting";
    case "failed": return "failed";
    case "completed": return "done";
    case "unknown": return "unknown";
    default: break;
  }
  for (let i = progressPreview.length - 1; i >= 0; i--) {
    const line = progressPreview[i].toLowerCase();
    if (line.startsWith("starting claude")) return "starting";
    if (line.startsWith("running command:") || line.startsWith("tool_use:")) return "investigating";
    if (line.startsWith("editing") || line.startsWith("writing")) return "editing";
    if (line.startsWith("turn completed")) return "finalizing";
    if (line.includes("error") || line.includes("failed")) return "failed";
  }
  return "running";
}

export function enrichJob(job, options = {}) {
  const maxProgressLines = options.maxProgressLines ?? DEFAULT_MAX_PROGRESS_LINES;
  const managedLogFile =
    job?.workspaceRoot && job?.id ? resolveJobLogFile(job.workspaceRoot, job.id) : null;
  const enriched = {
    ...job,
    kindLabel: getJobTypeLabel(job),
    progressPreview:
      ACTIVE_STATUSES.has(job.status) || job.status === "failed"
        ? readJobProgressPreview(managedLogFile, maxProgressLines)
        : [],
    logFile: managedLogFile,
    elapsed: formatElapsedDuration(
      job.startedAt ?? job.createdAt,
      TERMINAL_STATUSES.has(job.status) ? (job.completedAt ?? null) : null
    ),
    duration: TERMINAL_STATUSES.has(job.status)
      ? formatElapsedDuration(job.startedAt ?? job.createdAt, job.completedAt ?? job.updatedAt)
      : null,
  };
  return {
    ...enriched,
    phase: enriched.phase ?? inferJobPhase(enriched, enriched.progressPreview),
  };
}

export function readStoredJob(workspaceRoot, jobId) {
  return readJobFile(workspaceRoot, jobId);
}

function matchJobReference(jobs, reference, predicate = (_job) => true) {
  const filtered = jobs.filter(predicate);
  if (!reference) return filtered[0] ?? null;
  const exact = filtered.find((job) => job.id === reference);
  if (exact) return exact;
  const prefixMatches = filtered.filter((job) => job.id.startsWith(reference));
  if (prefixMatches.length === 1) return prefixMatches[0];
  if (prefixMatches.length > 1) throw new Error(`Job reference "${reference}" is ambiguous. Use a longer job id.`);
  throw new Error(`No job found for "${reference}". Run status to list known jobs.`);
}

export function buildStatusSnapshot(cwd, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(
    options.all
      ? listJobs(workspaceRoot)
      : filterJobsForCurrentSession(listJobs(workspaceRoot), {
          ...options,
          cwd: workspaceRoot,
        })
  );
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_STATUS_JOBS;
  const maxProgressLines = options.maxProgressLines ?? DEFAULT_MAX_PROGRESS_LINES;

  const running = jobs
    .filter((job) => ACTIVE_STATUSES.has(job.status))
    .map((job) => enrichJob(job, { maxProgressLines }));

  const finishedJobs = jobs.filter((job) => TERMINAL_STATUSES.has(job.status));
  const latestFinishedRaw = finishedJobs[0] ?? null;
  const latestFinished = latestFinishedRaw
    ? enrichJob(latestFinishedRaw, { maxProgressLines })
    : null;

  const recent = (options.all ? finishedJobs.slice(1) : finishedJobs.slice(1, maxJobs))
    .map((job) => enrichJob(job, { maxProgressLines }));

  return {
    workspaceRoot,
    running,
    latestFinished,
    recent,
  };
}

export function buildSingleJobSnapshot(cwd, reference, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot));
  const selected = matchJobReference(jobs, reference);
  if (!selected) throw new Error(`No job found for "${reference}".`);
  return {
    workspaceRoot,
    job: enrichJob(selected, { maxProgressLines: options.maxProgressLines }),
  };
}

export function resolveResultJob(cwd, reference) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(
    reference
      ? listJobs(workspaceRoot)
      : filterJobsForCurrentSession(listJobs(workspaceRoot), {
          cwd: workspaceRoot,
        })
  );
  if (reference) {
    const selected = matchJobReference(jobs, reference);
    const enriched = enrichJob(selected);
    if (TERMINAL_STATUSES.has(enriched.status)) {
      return { workspaceRoot, job: enriched, state: "terminal" };
    }
    if (enriched.status === "queued" || ACTIVE_STATUSES.has(enriched.status)) {
      return { workspaceRoot, job: enriched, state: "active" };
    }
    throw new Error(
      `Job ${enriched.id} is ${enriched.status}. Check status for more details.`
    );
  }

  const selected = matchJobReference(jobs, reference, (job) =>
    TERMINAL_STATUSES.has(job.status)
  );
  if (selected) {
    return { workspaceRoot, job: enrichJob(selected), state: "terminal" };
  }
  throw new Error("No finished Claude Code jobs found for this repository yet.");
}

export function resolveCancelableJob(cwd, reference) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot));
  const activeJobs = jobs.filter((job) =>
    ["running", "queued", "harness_queued", "interrupting"].includes(job.status)
  );
  if (reference) {
    const selected = matchJobReference(activeJobs, reference);
    if (!selected) throw new Error(`No active job found for "${reference}".`);
    return { workspaceRoot, job: selected };
  }
  if (activeJobs.length === 1) return { workspaceRoot, job: activeJobs[0] };
  if (activeJobs.length > 1) throw new Error("Multiple Claude Code jobs are active. Pass a job id to $cc-for-pein:cancel.");
  throw new Error("No active Claude Code jobs to cancel.");
}

export function resolveInterruptibleJob(cwd, reference) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = sortJobsNewestFirst(listJobs(workspaceRoot));
  const runningJobs = jobs.filter((job) => job.status === "running");
  if (reference) {
    const selected = matchJobReference(runningJobs, reference);
    return { workspaceRoot, job: selected };
  }
  if (runningJobs.length === 1) return { workspaceRoot, job: runningJobs[0] };
  if (runningJobs.length > 1) {
    throw new Error("Multiple Claude Code jobs are running. Pass a job id to $cc-for-pein:interrupt.");
  }
  throw new Error("No running Claude Code jobs to interrupt.");
}

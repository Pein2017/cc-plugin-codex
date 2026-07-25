/**
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Atomic workspace-scoped job state and durable steering mailbox.
 */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolvePluginDataRoot, resolvePluginStateRoot } from "./paths.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";
import { validateProcessIdentity, getProcessIdentity } from "./process-control.mjs";
import { createAgentStore } from "./agent-store.mjs";
import {
  markCompletionDetailedResultUnavailable,
  reconcileTerminalJobCompletion,
} from "./completion-inbox.mjs";

const STATE_VERSION = 1;
let ensuredPluginDataRoot = null;
const CONFIG_FILE_NAME = "config.json";
const JOBS_DIR_NAME = "jobs";
const CURRENT_SESSION_FILE_NAME = "current-session.json";
const CURRENT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CURRENT_SESSION_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_TERMINAL_JOBS_PER_SESSION = 100;
const REAP_GRACE_MS = 2_000;
const RESERVED_JOB_FILE_MAX_AGE_MS = 60 * 60 * 1000;
export const JOB_RESERVATION_SUFFIX = ".reserve";
export const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "running",
  "interrupting",
  "cancelling",
]);
const NO_SESSION_RETENTION_BUCKET = "__no-session__";
const SESSION_LEASES_DIR_NAME = "session-leases";
const SESSION_LEASE_PENDING_GRACE_MS = 10_000;
const TERMINAL_JOB_STATUSES = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
  "unknown",
]);

function exactSessionIdOf(job) {
  return job?.threadId ?? job?.result?.sessionId ?? job?.request?.resumeSessionId ?? null;
}

export function classifyJobRecoverability(job, status = job?.status) {
  const exactSessionId = exactSessionIdOf(job);
  if (status === "cancelled") {
    return {
      resumable: false,
      mode: "blocked",
      exactSessionId: null,
      reason: "destructive_cancellation",
    };
  }
  if (status === "completed" || status === "interrupted") {
    return exactSessionId
      ? {
          resumable: true,
          mode: "exact_session",
          exactSessionId,
          reason: status === "completed" ? "completed_exact_session" : "interrupted_exact_session",
        }
      : {
          resumable: false,
          mode: "blocked",
          exactSessionId: null,
          reason: `${status}_without_exact_session`,
        };
  }
  if (status === "failed") {
    const explicitlyResumable = job?.result?.resumable === true;
    const drifted = job?.result?.failureClass === "protocol_session_drift";
    const safeFreshRetry = !exactSessionId && (
      job?.safeFreshRetry === true ||
      job?.result?.safeFreshRetry === true ||
      job?.failureClass === "worker_launch_failed" ||
      job?.result?.failureClass === "worker_launch_failed"
    );
    if (safeFreshRetry) {
      return {
        resumable: true,
        mode: "safe_fresh",
        exactSessionId: null,
        reason: "failure_proven_safe_fresh_retry",
      };
    }
    return explicitlyResumable && exactSessionId && !drifted
      ? {
          resumable: true,
          mode: "exact_session",
          exactSessionId,
          reason: "failure_explicitly_resumable",
        }
      : {
          resumable: false,
          mode: "blocked",
          exactSessionId: null,
          reason: drifted
            ? "session_drift"
            : job?.result?.failureClass ?? job?.errorMessage ?? "failure_not_proven_resumable",
        };
  }
  return {
    resumable: false,
    mode: "blocked",
    exactSessionId: null,
    reason: `unsupported_terminal_status_${status ?? "missing"}`,
  };
}

export function nowIso() {
  return new Date().toISOString();
}

function defaultConfig() {
  return { version: STATE_VERSION };
}

function ensurePluginDataLayout() {
  const destinationRoot = resolvePluginDataRoot();
  if (ensuredPluginDataRoot === destinationRoot) {
    return;
  }
  fs.mkdirSync(resolvePluginStateRoot(), { recursive: true, mode: 0o700 });
  ensuredPluginDataRoot = destinationRoot;
}

function resolveStateRoot() {
  ensurePluginDataLayout();
  return resolvePluginStateRoot();
}

// ---------------------------------------------------------------------------
// Workspace directory resolution
// ---------------------------------------------------------------------------

export function resolveWorkspaceHash(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonical = workspaceRoot;
  try {
    canonical = fs.realpathSync.native(workspaceRoot);
  } catch {
    canonical = workspaceRoot;
  }
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

export function resolveStateDir(cwd) {
  return path.join(resolveStateRoot(), resolveWorkspaceHash(cwd));
}

export function resolveJobsDir(cwd) {
  return path.join(resolveStateDir(cwd), JOBS_DIR_NAME);
}

export function ensureStateDir(cwd) {
  fs.mkdirSync(resolveJobsDir(cwd), { recursive: true, mode: 0o700 });
}

export function getStateProtectionReceipt(cwd, options = {}) {
  const platform = options.platform ?? process.platform;
  ensureStateDir(cwd);
  if (platform === "win32") {
    return {
      platform,
      status: "unverified",
      mechanism: "native_windows_user_acl",
      detail: "The runtime uses the current user's plugin data directory, but this process did not verify an effective owner-only Windows ACL.",
    };
  }
  const stateMode = fs.statSync(resolveStateDir(cwd)).mode & 0o777;
  const jobsMode = fs.statSync(resolveJobsDir(cwd)).mode & 0o777;
  const verified = (stateMode & 0o077) === 0 && (jobsMode & 0o077) === 0;
  return {
    platform,
    status: verified ? "verified_owner_only" : "unverified",
    mechanism: "posix_mode",
    stateMode: stateMode.toString(8).padStart(3, "0"),
    jobsMode: jobsMode.toString(8).padStart(3, "0"),
  };
}

// ---------------------------------------------------------------------------
// Config (separate from jobs — minimal write contention)
// ---------------------------------------------------------------------------

function resolveConfigFile(cwd) {
  return path.join(resolveStateDir(cwd), CONFIG_FILE_NAME);
}

function resolveCurrentSessionFile(cwd) {
  return path.join(resolveStateDir(cwd), CURRENT_SESSION_FILE_NAME);
}

export function loadConfig(cwd) {
  const configFile = resolveConfigFile(cwd);
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (parsed.version !== STATE_VERSION) {
      throw new Error(`Incompatible config version: ${parsed.version}`);
    }
    return { ...defaultConfig(), ...parsed };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(cwd, config) {
  ensureStateDir(cwd);
  const data = { ...defaultConfig(), ...config, version: STATE_VERSION };
  writeAtomic(resolveConfigFile(cwd), data);
  return data;
}

export function setConfig(cwd, key, value) {
  const config = loadConfig(cwd);
  config[key] = value;
  return saveConfig(cwd, config);
}

export function getConfig(cwd) {
  return loadConfig(cwd);
}

// ---------------------------------------------------------------------------
// Current session marker (fallback when Codex does not propagate env vars)
// ---------------------------------------------------------------------------

export function setCurrentSession(cwd, sessionId) {
  sanitizeId(sessionId, "session ID");
  ensureStateDir(cwd);
  writeAtomic(resolveCurrentSessionFile(cwd), {
    sessionId,
    updatedAt: nowIso(),
  });
}

export function getCurrentSession(cwd) {
  const filePath = resolveCurrentSessionFile(cwd);
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const updatedAt = Date.parse(payload.updatedAt);
    const ageMs = Date.now() - updatedAt;
    if (
      !Number.isFinite(updatedAt) ||
      ageMs > CURRENT_SESSION_MAX_AGE_MS ||
      ageMs < -CURRENT_SESSION_MAX_CLOCK_SKEW_MS
    ) {
      fs.unlinkSync(filePath);
      return null;
    }
    return sanitizeId(payload.sessionId, "session ID");
  } catch {
    return null;
  }
}

export function clearCurrentSession(cwd, sessionId = null) {
  const filePath = resolveCurrentSessionFile(cwd);
  if (sessionId != null) {
    const current = getCurrentSession(cwd);
    if (current !== sessionId) {
      return;
    }
  }
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

export function sanitizeId(id, label = "ID") {
  if (typeof id !== "string" || !/^[\w\-.]+$/.test(id)) {
    throw new Error(`Invalid ${label}: ${String(id).slice(0, 50)}`);
  }
  return id;
}

function canonicalPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function sessionLeaseIdentity(claudeConfigDir, sessionId) {
  sanitizeId(sessionId, "Claude session ID");
  const configIdentity = canonicalPath(
    claudeConfigDir || path.join(os.homedir(), ".claude")
  );
  const key = createHash("sha256")
    .update(`${configIdentity}\0${sessionId}`)
    .digest("hex");
  return { configIdentity, sessionId, key };
}

function resolveSessionLeaseFile(claudeConfigDir, sessionId) {
  const identity = sessionLeaseIdentity(claudeConfigDir, sessionId);
  return {
    ...identity,
    leaseFile: path.join(resolveStateRoot(), SESSION_LEASES_DIR_NAME, `${identity.key}.json`),
  };
}

function activeLeaseOwner(lease) {
  if (!lease?.workspaceRoot || !lease?.jobId) return null;
  const owner = readJobFile(lease.workspaceRoot, lease.jobId);
  if (!owner || !ACTIVE_JOB_STATUSES.has(owner.status)) return null;
  if (isWithinReapGracePeriod(owner)) return owner;
  const controlPid = owner.pid ?? owner.workerPid ?? null;
  const controlIdentity = owner.pid ? owner.pidIdentity : owner.workerPidIdentity;
  if (!controlPid) return null;
  if (!controlIdentity) return null;
  const alive = validateProcessIdentity(controlPid, controlIdentity);
  return alive ? owner : null;
}

export function reserveSessionLease(cwd, claudeConfigDir, sessionId, jobId) {
  const descriptor = resolveSessionLeaseFile(claudeConfigDir, sessionId);
  fs.mkdirSync(path.dirname(descriptor.leaseFile), { recursive: true, mode: 0o700 });
  const ownership = acquireJobLock(`${descriptor.leaseFile}.lock`);
  try {
    if (fs.existsSync(descriptor.leaseFile)) {
      let existing = null;
      let existingAgeMs = Number.POSITIVE_INFINITY;
      try {
        const stat = fs.statSync(descriptor.leaseFile);
        existingAgeMs = Date.now() - stat.mtimeMs;
        existing = JSON.parse(fs.readFileSync(descriptor.leaseFile, "utf8"));
      } catch {}
      if (existing?.jobId === jobId) return existing;
      const owner = activeLeaseOwner(existing);
      if (owner || existingAgeMs < SESSION_LEASE_PENDING_GRACE_MS) {
        const ownerLabel = existing?.jobId ?? "an initializing job";
        throw new Error(
          `Claude session ${sessionId} is already owned by active job ${ownerLabel}.`
        );
      }
      try { fs.unlinkSync(descriptor.leaseFile); } catch {}
    }

    const lease = {
      version: STATE_VERSION,
      key: descriptor.key,
      configIdentity: descriptor.configIdentity,
      sessionId,
      jobId,
      workspaceRoot: canonicalPath(cwd),
      createdAt: nowIso(),
    };
    writeAtomic(descriptor.leaseFile, lease);
    return lease;
  } finally {
    releaseJobLock(`${descriptor.leaseFile}.lock`, ownership);
  }
}

export function releaseSessionLease(claudeConfigDir, sessionId, jobId) {
  if (!sessionId || !jobId) return false;
  const descriptor = resolveSessionLeaseFile(claudeConfigDir, sessionId);
  if (!fs.existsSync(descriptor.leaseFile)) return false;
  const ownership = acquireJobLock(`${descriptor.leaseFile}.lock`);
  try {
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(descriptor.leaseFile, "utf8")); } catch {}
    if (existing?.jobId !== jobId) return false;
    try {
      fs.unlinkSync(descriptor.leaseFile);
      return true;
    } catch {
      return false;
    }
  } finally {
    releaseJobLock(`${descriptor.leaseFile}.lock`, ownership);
  }
}

export function claimJobSessionLease(cwd, jobId, claudeConfigDir, sessionId) {
  const lease = reserveSessionLease(cwd, claudeConfigDir, sessionId, jobId);
  try {
    mutateJob(cwd, jobId, (job) => ({
      ...job,
      sessionLease: {
        configIdentity: lease.configIdentity,
        sessionId: lease.sessionId,
      },
    }));
    return lease;
  } catch (error) {
    releaseSessionLease(claudeConfigDir, sessionId, jobId);
    throw error;
  }
}

function releaseJobSessionLease(job) {
  const sessionId = job?.sessionLease?.sessionId;
  const configIdentity = job?.sessionLease?.configIdentity;
  if (sessionId && configIdentity) {
    return releaseSessionLease(configIdentity, sessionId, job.id);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Job files (per-job isolation)
// ---------------------------------------------------------------------------

export function resolveJobFile(cwd, jobId) {
  sanitizeId(jobId, "job ID");
  return path.join(resolveJobsDir(cwd), `${jobId}.json`);
}

export function resolveJobLogFile(cwd, jobId) {
  sanitizeId(jobId, "job ID");
  return path.join(resolveJobsDir(cwd), `${jobId}.log`);
}

export function generateJobId(prefix = "job") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function writeJobFile(cwd, jobId, payload) {
  ensureStateDir(cwd);
  const jobFile = resolveJobFile(cwd, jobId);
  writeAtomic(jobFile, { ...payload, updatedAt: nowIso() });
  return jobFile;
}

export function readJobFile(cwd, jobId) {
  const jobFile = resolveJobFile(cwd, jobId);
  try {
    return JSON.parse(fs.readFileSync(jobFile, "utf8"));
  } catch {
    return null;
  }
}

function readAllJobs(cwd) {
  const jobsDir = resolveJobsDir(cwd);
  if (!fs.existsSync(jobsDir)) return [];
  return fs
    .readdirSync(jobsDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".lock"))
    .map((f) => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(jobsDir, f), "utf8")
        );
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime()
    );
}

export function listStoredJobs(cwd) {
  return readAllJobs(cwd);
}

function readReconciledJobs(cwd) {
  const jobs = reapStaleJobs(cwd, readAllJobs(cwd));
  reconcileCompletionEvents(cwd, jobs);
  return jobs;
}

export function listJobs(cwd) {
  return partitionJobsForRetention(readReconciledJobs(cwd)).retained;
}

/**
 * Read-only reconciliation view for Agent projections.
 *
 * Public diagnostics intentionally retain only a bounded terminal-job window,
 * but cleanup must keep any Agent-linked terminal fact whose registry
 * projection has not yet been recorded.  The Agent runtime therefore needs a
 * narrow, durable view of precisely those facts; otherwise an old retained
 * file can become permanently invisible before it is projected.
 */
export function listJobsForAgentReconciliation(cwd) {
  const jobs = readReconciledJobs(cwd);
  const retained = partitionJobsForRetention(jobs).retained;
  const byId = new Map(retained.map((job) => [job.id, job]));
  for (const job of jobs) {
    if (
      Boolean(job?.agentId) &&
      TERMINAL_JOB_STATUSES.has(job.status) &&
      !job.agentProjectionReconciledAt
    ) {
      byId.set(job.id, job);
    }
  }
  return [...byId.values()];
}

function ownerRootIdOf(job) {
  return typeof job?.ownerRootId === "string" && job.ownerRootId.trim()
    ? job.ownerRootId.trim()
    : typeof job?.sessionId === "string" && job.sessionId.trim()
      ? job.sessionId.trim()
      : null;
}

function isUnboundPreClaudePreparedJob(job) {
  return job?.activationPrepared === true &&
    job.activationAttached !== true &&
    job.preClaudeLaunch === true &&
    !job.agentId;
}

/**
 * Bind an Agent-owned Claude session before its terminal receipt becomes
 * externally observable.  The session-binding lock is the serialization
 * point across workspaces, while the job receipt remains the source of the
 * terminal lifecycle fact.  A deterministic identity violation is therefore
 * recorded as a failed, blocked job before completion publication.
 *
 * This helper also repairs terminal receipts written by an older runtime that
 * crashed between terminal-state persistence and binding.  Operational errors
 * (for example a transient registry lock timeout) are deliberately left for a
 * later reconciliation pass rather than misclassified as a session conflict.
 */
function prepareTerminalAgentSessionBinding(cwd, job) {
  if (!job?.agentId || !TERMINAL_JOB_STATUSES.has(job.status)) return job;
  const ownerRootId = ownerRootIdOf(job);
  const sessionId = exactSessionIdOf(job);
  if (!ownerRootId || !sessionId) return job;

  let store;
  let agent;
  try {
    store = createAgentStore({
      cwd,
      ownerRootId,
      claudeConfigDir: job.claudeConfigDir,
    });
    agent = store.readAgent(job.agentId);
  } catch {
    // A missing or temporarily unreadable projection must not rewrite a
    // terminal execution receipt. Startup reconciliation can retry later.
    return job;
  }
  // Retained raw job receipts can predate (or outlive) an Agent registry.
  // They remain valid diagnostic facts and must not make cleanup/recovery
  // fail merely because no current Agent projection exists.
  if (!agent) return job;

  if (agent.claudeSessionId === sessionId) return job;
  const isCurrent = agent.activeJobId === job.id || (
    agent.activeJobId == null && (agent.latestJobId == null || agent.latestJobId === job.id)
  );
  if (!isCurrent) return job;

  try {
    store.bindSession(agent.agentId, sessionId, {
      jobId: job.id,
      // Early releases did not duplicate the Agent config directory into
      // every job receipt. The Agent's validated directory is the only safe
      // fallback; never silently substitute a process-global config path.
      claudeConfigDir: job.claudeConfigDir ?? agent.claudeConfigDir,
      allowTerminal: agent.activeJobId == null,
    });
    return job;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = /already bound to a different logical root or Agent/.test(detail)
      ? "session_binding_conflict"
      : /Claude session drift/.test(detail)
        ? "session_drift"
        : null;
    if (!reason) return job;

    return mutateJob(cwd, job.id, (current) => {
      if (
        current.status === "failed" &&
        current.failureClass === reason &&
        current.recoverability?.mode === "blocked"
      ) {
        return current;
      }
      // If the job changed while binding, leave the newer fact intact. A
      // subsequent reconciliation pass will inspect that receipt directly.
      if (!TERMINAL_JOB_STATUSES.has(current.status) || current.agentId !== job.agentId) {
        return current;
      }
      const errorMessage = reason === "session_binding_conflict"
        ? "Claude session is already bound to a different logical root or Agent."
        : "Observed Claude session differs from this Agent's validated session.";
      return {
        ...current,
        status: "failed",
        phase: reason,
        failureClass: reason,
        errorMessage,
        completionSummary: errorMessage,
        recoverability: {
          resumable: false,
          mode: "blocked",
          exactSessionId: null,
          reason,
        },
        sessionBindingFailure: {
          reason,
          observedSessionId: sessionId,
          recordedAt: nowIso(),
        },
      };
    });
  }
}

export function reconcileCompletionEvents(cwd, jobs = readAllJobs(cwd)) {
  /** @type {any[]} */
  const receipts = [];
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (!TERMINAL_JOB_STATUSES.has(job.status)) continue;
    // A pre-Claude activation fact belongs to the launcher, not yet to an
    // Agent turn. Its terminal outcome is useful diagnostics only; emitting a
    // root completion here would claim a task result for work that never
    // attached to (or invoked) Claude.
    if (isUnboundPreClaudePreparedJob(job)) continue;
    const prepared = prepareTerminalAgentSessionBinding(cwd, job);
    jobs[index] = prepared;
    const ownerRootId = ownerRootIdOf(prepared);
    if (!ownerRootId) continue;
    try {
      receipts.push(reconcileTerminalJobCompletion(cwd, ownerRootId, prepared));
    } catch (error) {
      receipts.push({
        reconciled: false,
        reason: "reconciliation_failed",
        jobId: prepared.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return receipts;
}

function getRetentionBucketKey(job) {
  if (typeof job.ownerRootId === "string" && job.ownerRootId.trim()) {
    return job.ownerRootId.trim();
  }
  if (typeof job.sessionId === "string" && job.sessionId.trim()) {
    return job.sessionId.trim();
  }
  return NO_SESSION_RETENTION_BUCKET;
}

function partitionJobsForRetention(jobs) {
  const terminalSeenBySession = new Map();
  const retained = [];
  const pruned = [];

  for (const job of jobs) {
    if (ACTIVE_JOB_STATUSES.has(job.status)) {
      retained.push(job);
      continue;
    }

    const bucketKey = getRetentionBucketKey(job);
    const terminalSeen = terminalSeenBySession.get(bucketKey) ?? 0;
    if (terminalSeen < MAX_TERMINAL_JOBS_PER_SESSION) {
      terminalSeenBySession.set(bucketKey, terminalSeen + 1);
      retained.push(job);
      continue;
    }

    pruned.push(job);
  }

  return { retained, pruned };
}

const REAPABLE_STATUSES = new Set(["queued", "running", "interrupting", "cancelling"]);

function mostRecentJobTimestamp(job) {
  const candidates = [job.updatedAt, job.startedAt, job.createdAt]
    .map((value) => Date.parse(value ?? ""))
    .filter(Number.isFinite);
  if (candidates.length === 0) {
    return null;
  }
  return Math.max(...candidates);
}

function isWithinReapGracePeriod(job, now = Date.now()) {
  const timestamp = mostRecentJobTimestamp(job);
  return Number.isFinite(timestamp) && now - timestamp < REAP_GRACE_MS;
}

/**
 * Detect zombie jobs whose PID has died and auto-transition them to "failed".
 * Called from listJobs() so every job-reading path benefits automatically.
 */
export function reapStaleJobs(cwd, jobs) {
  return jobs.map((job) => {
    if (!REAPABLE_STATUSES.has(job.status)) return job;
    if (isWithinReapGracePeriod(job)) return job;

    const controlPid = job.pid ?? job.workerPid ?? null;
    const controlIdentity = job.pid
      ? job.pidIdentity
      : job.workerPidIdentity;
    const alive = controlPid && controlIdentity
      ? validateProcessIdentity(controlPid, controlIdentity)
      : false;
    if (alive) return job;

    // Process is dead — transition to failed via CAS
    try {
      const transitioned = transitionJob(cwd, job.id, [job.status], "failed", {
        errorMessage: controlPid
          ? controlIdentity
            ? `Control process ${controlPid} died or changed identity without completing. Auto-reaped.`
            : `Control process ${controlPid} has no deterministic identity; refusing PID-only liveness ownership.`
          : "No live worker claimed this job before the startup grace period. Auto-reaped.",
        requiresAttention: Boolean(controlPid && !controlIdentity),
        controlFailure: controlPid && !controlIdentity ? "missing_identity" : null,
        completedAt: nowIso(),
        pid: null,
        pidIdentity: null,
        workerPid: null,
        workerPidIdentity: null,
        phase: "failed",
      });
      if (transitioned.transitioned) {
        return readJobFile(cwd, job.id) ?? job;
      }
      // CAS miss — another actor already transitioned; re-read current state
      return readJobFile(cwd, job.id) ?? job;
    } catch {
      return job; // Reaper failure is non-fatal — return original
    }
  });
}

export function upsertJob(cwd, jobPatch) {
  const existing = jobPatch.id ? readJobFile(cwd, jobPatch.id) : null;
  const timestamp = nowIso();
  const job = existing
    ? { ...existing, ...jobPatch, updatedAt: timestamp }
    : { createdAt: timestamp, updatedAt: timestamp, ...jobPatch };
  writeJobFile(cwd, job.id, job);
  return job;
}

export function patchJob(cwd, jobId, patch) {
  if (!readJobFile(cwd, jobId)) return null;
  try {
    return mutateJob(cwd, jobId, (existing) => ({
      ...existing,
      ...patch,
      id: jobId,
    }));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function mutateJob(cwd, jobId, updater) {
  const jobFile = resolveJobFile(cwd, jobId);
  const lockFile = jobFile + ".lock";
  const fd = acquireJobLock(lockFile);
  try {
    const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
    const next = updater(job);
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      throw new Error(`Job mutation for ${jobId} did not return a job object.`);
    }
    const updatedJob = {
      ...next,
      id: jobId,
      updatedAt: nowIso(),
    };
    writeAtomic(jobFile, updatedJob);
    return updatedJob;
  } finally {
    releaseJobLock(lockFile, fd);
  }
}

function normalizeSteeringState(job) {
  const steering = job?.steering && typeof job.steering === "object"
    ? job.steering
    : {};
  const messages = Array.isArray(steering.messages) ? steering.messages : [];
  const lastSequence = messages.reduce(
    (max, message) => Math.max(max, Number(message?.sequence) || 0),
    0
  );
  return {
    nextSequence: Math.max(Number(steering.nextSequence) || 1, lastSequence + 1),
    latestAcknowledgedSequence:
      Number(steering.latestAcknowledgedSequence) || 0,
    messages,
  };
}

/**
 * Append one manual steering message, or get the existing entry for an Agent
 * mailbox message ID while holding the job's durable mutation lock.
 *
 * @param {{ kind?: string, messageId?: string }} [options]
 */
export function enqueueSteeringMessage(cwd, jobId, text, options = {}) {
  const normalizedText = String(text ?? "").trim();
  if (!normalizedText) throw new Error("Steering message must not be empty.");
  const requestMessageId = Reflect.get(options, "messageId");
  const agentMessageId = requestMessageId == null
    ? null
    : String(requestMessageId).trim();
  if (requestMessageId != null && !agentMessageId) {
    throw new Error("Steering message idempotency key must not be empty.");
  }
  const kind = Reflect.get(options, "kind") ?? "steer";
  /** @type {any} */
  let queuedMessage = null;
  mutateJob(cwd, jobId, (job) => {
    if (!["queued", "running"].includes(job.status)) {
      throw new Error(`Job ${jobId} is ${job.status}; use an explicit follow-up.`);
    }
    if (job.acceptingSteering === false) {
      throw new Error(`Job ${jobId} is not accepting steering while finalizing.`);
    }
    const steering = normalizeSteeringState(job);
    // Agent mailbox delivery is a two-record transaction: the job receives a
    // stream-json steering entry first, then the Agent record is marked
    // dispatched.  A crash in that gap retries this mutation.  Persisting and
    // looking up the Agent message ID while holding the job lock makes the
    // steering sequence a durable get-or-create result instead of appending a
    // duplicate user message on every recovery pass.  Legacy steering entries
    // intentionally have no agentMessageId and retain their append-only
    // behavior.
    const existing = agentMessageId
      ? steering.messages.find((message) => message?.agentMessageId === agentMessageId)
      : null;
    if (existing) {
      if (existing.text !== normalizedText || (existing.kind ?? "steer") !== kind) {
        throw new Error(`Steering idempotency key ${agentMessageId} conflicts with an existing message.`);
      }
      queuedMessage = existing;
      return job;
    }
    queuedMessage = {
      sequence: steering.nextSequence,
      kind,
      text: normalizedText,
      queuedAt: nowIso(),
      dispatchedAt: null,
      deliveredAt: null,
      acknowledgedAt: null,
      deliveryMode: null,
      attempt: null,
      ...(agentMessageId ? { agentMessageId } : {}),
    };
    return {
      ...job,
      steering: {
        ...steering,
        nextSequence: steering.nextSequence + 1,
        messages: [...steering.messages, queuedMessage],
      },
    };
  });
  return /** @type {any} */ (queuedMessage);
}

export function listPendingSteeringMessages(cwd, jobId) {
  const job = readJobFile(cwd, jobId);
  if (!job) return [];
  return normalizeSteeringState(job).messages.filter(
    (message) => !message.dispatchedAt
  );
}

export function markSteeringMessageDispatched(cwd, jobId, sequence, receipt = {}) {
  return mutateJob(cwd, jobId, (job) => {
    const steering = normalizeSteeringState(job);
    const dispatchedAt = nowIso();
    return {
      ...job,
      steering: {
        ...steering,
        messages: steering.messages.map((message) =>
          message.sequence === sequence
            ? {
                ...message,
                dispatchedAt,
                deliveredAt: dispatchedAt,
                deliveryMode: receipt.deliveryMode ?? "live_stdin",
                attempt: receipt.attempt ?? null,
              }
            : message
        ),
      },
    };
  });
}

export function acknowledgeSteeringMessage(cwd, jobId, sequence) {
  return mutateJob(cwd, jobId, (job) => {
    const steering = normalizeSteeringState(job);
    const acknowledgedAt = nowIso();
    return {
      ...job,
      steering: {
        ...steering,
        latestAcknowledgedSequence: Math.max(
          steering.latestAcknowledgedSequence,
          Number(sequence) || 0
        ),
        messages: steering.messages.map((message) =>
          message.sequence === sequence
            ? { ...message, acknowledgedAt }
            : message
        ),
      },
    };
  });
}

export function getSteeringSnapshot(cwd, jobId) {
  const job = readJobFile(cwd, jobId);
  const steering = normalizeSteeringState(job);
  return {
    pendingCount: steering.messages.filter((message) => !message.dispatchedAt).length,
    unacknowledgedCount: steering.messages.filter(
      (message) => message.dispatchedAt && !message.acknowledgedAt
    ).length,
    latestAcknowledgedSequence: steering.latestAcknowledgedSequence,
    lastSequence: steering.nextSequence - 1,
  };
}

export function tryCloseSteeringWindow(cwd, jobId) {
  let closed = false;
  const job = mutateJob(cwd, jobId, (current) => {
    const steering = normalizeSteeringState(current);
    if (steering.messages.some((message) => !message.dispatchedAt)) {
      return current;
    }
    closed = true;
    return {
      ...current,
      acceptingSteering: false,
      phase: "finalizing",
    };
  });
  return { closed, job };
}

// ---------------------------------------------------------------------------
// CAS (Compare-And-Swap) for job status transitions
// ---------------------------------------------------------------------------

const LOCK_ACQUIRE_TIMEOUT_MS = 30_000;
const LOCK_RETRY_MIN_DELAY_MS = 10;
const LOCK_RETRY_MAX_DELAY_MS = 50;

function sleepSync(ms) {
  const boundedMs = Math.max(0, Math.min(Number(ms) || 0, 1_000));
  if (typeof SharedArrayBuffer === "function" && typeof Atomics.wait === "function") {
    const shared = new SharedArrayBuffer(4);
    const view = new Int32Array(shared);
    Atomics.wait(view, 0, 0, boundedMs);
    return;
  }

  const start = Date.now();
  while (Date.now() - start < boundedMs) {
    // Bounded busy-wait fallback when SharedArrayBuffer is unavailable.
  }
}

function sameFileIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function recoverStaleLock(lockFile) {
  if (!fs.existsSync(lockFile)) {
    return false;
  }
  let observedStat = null;
  try {
    observedStat = fs.statSync(lockFile);
    const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    const ageMs = Date.now() - Number(lockData.timestamp ?? observedStat.mtimeMs);
    const ownerMatch = lockData.identity == null
      ? Number.isFinite(ageMs) && ageMs <= LOCK_ACQUIRE_TIMEOUT_MS
      : validateProcessIdentity(lockData.pid, lockData.identity);
    if (ownerMatch) return false;
  } catch {}

  try {
    const currentStat = fs.statSync(lockFile);
    if (observedStat && !sameFileIdentity(observedStat, currentStat)) return false;
    fs.unlinkSync(lockFile);
    return true;
  } catch {
    return false;
  }
}

function writeLockOwnership(fd, token) {
  let myIdentity = null;
  try {
    myIdentity = getProcessIdentity(process.pid);
  } catch {}
  fs.writeFileSync(
    fd,
    JSON.stringify({
      pid: process.pid,
      identity: myIdentity,
      token,
      timestamp: Date.now(),
    }),
    { encoding: "utf8" }
  );
  fs.fsyncSync(fd);
}

function acquireJobLock(lockFile) {
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  while (true) {
    recoverStaleLock(lockFile);
    const token = randomBytes(16).toString("hex");
    const candidateFile = `${lockFile}.${process.pid}.${token}.candidate`;
    let fd = null;
    try {
      // Publish only a complete, fsynced ownership record. linkSync is an
      // atomic no-clobber operation in the lock's own directory, so another
      // process can never observe the empty-file window produced by
      // open(lockFile, "wx") followed by a separate write.
      fd = fs.openSync(candidateFile, "wx", 0o600);
      try {
        writeLockOwnership(fd, token);
        const stat = fs.fstatSync(fd);
        fs.linkSync(candidateFile, lockFile);
        fs.unlinkSync(candidateFile);
        return { fd, token, stat };
      } catch (error) {
        try { fs.closeSync(fd); } catch {}
        try { fs.unlinkSync(candidateFile); } catch {}
        throw error;
      }
    } catch (err) {
      if (fd != null) {
        try { fs.closeSync(fd); } catch {}
      }
      try { fs.unlinkSync(candidateFile); } catch {}
      if (err.code === "EEXIST" && Date.now() < deadline) {
        const delay = LOCK_RETRY_MIN_DELAY_MS +
          Math.random() * (LOCK_RETRY_MAX_DELAY_MS - LOCK_RETRY_MIN_DELAY_MS);
        sleepSync(delay);
        continue;
      }
      if (err.code === "EEXIST") {
        const timeout = Object.assign(
          new Error(`Timed out acquiring job lock ${lockFile}.`),
          { code: "ETIMEDOUT" }
        );
        throw timeout;
      }
      throw err;
    }
  }
}

function releaseJobLock(lockFile, ownership) {
  if (!ownership) return;
  let owned = false;
  try {
    const currentStat = fs.statSync(lockFile);
    const currentData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    owned = Boolean(
      sameFileIdentity(ownership.stat, currentStat) &&
      currentData.token === ownership.token
    );
  } catch {}
  try { fs.closeSync(ownership.fd); } catch {}
  if (!owned) return;
  try {
    const currentStat = fs.statSync(lockFile);
    if (sameFileIdentity(ownership.stat, currentStat)) fs.unlinkSync(lockFile);
  } catch {}
}

/**
 * Atomically transition job status from `expected` to `next`.
 * Returns true on success, false if current status !== expected.
 * Throws on persistent lock contention.
 */
export function casJobStatus(cwd, jobId, expected, next, extra = {}) {
  return transitionJob(cwd, jobId, [expected], next, extra).transitioned;
}

export function transitionJob(cwd, jobId, expectedStatuses, next, extra = {}) {
  const jobFile = resolveJobFile(cwd, jobId);
  const lockFile = jobFile + ".lock";
  const expectedList = Array.isArray(expectedStatuses)
    ? expectedStatuses
    : [expectedStatuses];
  const fd = acquireJobLock(lockFile);

  /** @type {any} */
  let outcome;
  try {
    const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
    if (!expectedList.includes(job.status)) {
      outcome = {
        transitioned: false,
        previousStatus: job.status,
        job,
      };
    } else {
      let updatedJob = {
        ...job,
        status: next,
        ...extra,
        updatedAt: nowIso(),
      };
      if (TERMINAL_JOB_STATUSES.has(next)) {
        updatedJob = {
          ...updatedJob,
          recoverability:
            extra.recoverability ?? classifyJobRecoverability(updatedJob, next),
        };
      }
      writeAtomic(jobFile, updatedJob);
      outcome = {
        transitioned: true,
        previousStatus: job.status,
        job: updatedJob,
      };
    }
  } finally {
    releaseJobLock(lockFile, fd);
  }
  if (outcome.transitioned && TERMINAL_JOB_STATUSES.has(next)) {
    // Persist the execution outcome first, then bind (or correct) its
    // Agent-owned session before publishing the completion. If this process
    // crashes in-between, list/recovery reconciliation runs the same helper
    // before it can publish an Agent completion event.
    outcome.job = prepareTerminalAgentSessionBinding(cwd, outcome.job);
    const sessionLeaseReleased = releaseJobSessionLease(outcome.job);
    const residencyReceipt = {
      childProcessExited: outcome.job.pid == null,
      processIdentitiesCleared:
        outcome.job.pid == null &&
        outcome.job.pidIdentity == null &&
        outcome.job.workerPid == null &&
        outcome.job.workerPidIdentity == null,
      sessionLeaseReleased,
      supervisorExitExpected: true,
      verifiedAt: nowIso(),
    };
    outcome.job = patchJob(cwd, jobId, { residencyReceipt }) ?? {
      ...outcome.job,
      residencyReceipt,
    };
    const ownerRootId = ownerRootIdOf(outcome.job);
    if (ownerRootId && !isUnboundPreClaudePreparedJob(outcome.job)) {
      try {
        const completion = reconcileTerminalJobCompletion(cwd, ownerRootId, outcome.job);
        outcome.completion = completion;
      } catch (error) {
        outcome.completion = {
          reconciled: false,
          reason: "publication_failed",
          error: error instanceof Error ? error.message : String(error),
        };
        try {
          patchJob(cwd, jobId, {
            completionPending: true,
            completionError: outcome.completion.error,
          });
        } catch {}
      }
    }
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

function writeAtomic(filePath, data) {
  const tmp = filePath + `.tmp.${process.pid}.${Date.now().toString(36)}.${randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

export function cleanupOldJobs(cwd) {
  const jobs = reapStaleJobs(cwd, readAllJobs(cwd));
  // Reconcile while the terminal receipt still exists.  A completion inbox is
  // a rebuildable projection, but it must be materialized before bounded job
  // retention can remove the detailed receipt it is derived from.
  const completionReceipts = reconcileCompletionEvents(cwd, jobs);
  const completionByJobId = new Map(
    completionReceipts
      .filter((receipt) => receipt?.jobId || receipt?.event?.jobId)
      .map((receipt) => [receipt.jobId ?? receipt.event.jobId, receipt])
  );
  const { pruned: toRemove } = partitionJobsForRetention(jobs);
  for (const job of toRemove) {
    const ownerRootId = ownerRootIdOf(job);
    const completion = completionByJobId.get(job.id);
    // Keep an Agent-linked terminal fact until its event has been durably
    // reconciled.  Legacy unowned job diagnostics keep their historical
    // cleanup behavior; a modern Agent job can never be safely detached from
    // its root-owned completion projection.
    const completionReady = ownerRootId
      ? Boolean(completion?.event)
      : !job.agentId;
    const agentProjectionReady = !job.agentId || Boolean(job.agentProjectionReconciledAt);
    if (!completionReady || !agentProjectionReady) {
      continue;
    }
    if (ownerRootId) {
      try { markCompletionDetailedResultUnavailable(cwd, ownerRootId, job.id); } catch {}
    }
    const jobFile = resolveJobFile(cwd, job.id);
    try {
      fs.unlinkSync(jobFile);
    } catch {}
    const defaultLogFile = resolveJobLogFile(cwd, job.id);
    try {
      fs.unlinkSync(defaultLogFile);
    } catch {}
  }

  const jobsDir = resolveJobsDir(cwd);
  try {
    for (const entry of fs.readdirSync(jobsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(JOB_RESERVATION_SUFFIX)) {
        continue;
      }
      try {
        const reservationPath = path.join(jobsDir, entry.name);
        const stat = fs.statSync(reservationPath);
        if (Date.now() - stat.mtimeMs <= RESERVED_JOB_FILE_MAX_AGE_MS) {
          continue;
        }
        fs.unlinkSync(reservationPath);
      } catch {
        continue;
      }
    }
  } catch {}
}

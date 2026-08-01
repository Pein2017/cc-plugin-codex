/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Internal one-turn Claude job runtime. The public Agent lifecycle is composed
 * above this module; subprocess, persistence, retries, and stream-json details
 * stay here.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRuntimeEnvironment } from "./environment.mjs";
import {
  HARNESS_CAPABILITY_NAMES,
  assertHarnessCapability,
  validateHarnessCapabilities,
} from "./harness-capabilities.mjs";
import { validateHarnessTurnResult } from "./harness-contract.mjs";
import { DEFAULT_HARNESS_ID, resolveHarnessDriver } from "./harness-registry.mjs";
import {
  ACTIVE_JOB_STATUSES,
  HARNESS_QUEUED_JOB_STATUS,
  cleanupOldJobs,
  claimJobPublicProgress,
  generateJobId,
  getSteeringSnapshot,
  getStateProtectionReceipt,
  isJobPublicProgressDeliveryEligible,
  listJobsForOwner,
  listStoredJobs,
  nowIso,
  patchJob,
  readJobFile,
  releaseSessionLease,
  reserveSessionLease,
  resolveJobFile,
  resolveJobLogFile,
  transitionJob,
  writeJobFile,
} from "./job-store.mjs";
import {
  appendLogLine,
  createJobLogFile,
  createJobProgressUpdater,
  createJobRecord,
  createProgressReporter,
  createWorkerLogStdio,
  runTrackedJob,
  safePublicToolName,
  OWNER_ROOT_ID_ENV,
} from "./job-runner.mjs";
import { enrichJob, sortJobsNewestFirst } from "./job-query.mjs";
import { getProcessIdentity } from "./process-control.mjs";
import { configureRuntimePaths, samePath } from "./paths.mjs";
import { renderTaskResult } from "./render.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";
import {
  acknowledgeAgentCompletionEvents,
  readUnreadAgentCompletionSummaries,
  readUnreadCompletionEvents,
} from "./completion-inbox.mjs";

const CLI_PATH = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const SOURCE_ROOT = fs.realpathSync.native(path.resolve(path.dirname(CLI_PATH), ".."));
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
  "unknown",
]);
const HANDOFF_DISPOSITIONS = new Set([
  "rollback_safe",
  "lifecycle_owned",
  "ownership_uncertain",
]);
const CHILD_SPAWN_WAIT_MS = 1_000;
const CHILD_EXIT_WAIT_MS = 1_000;
/** Version-2 durable Harness evidence on every job this runtime prepares. */
export const HARNESS_JOB_STATE_VERSION = 2;

export function preparedStartDisposition(error) {
  const value = String(error?.handoffDisposition ?? "");
  return HANDOFF_DISPOSITIONS.has(value) ? value : "ownership_uncertain";
}

function withPreparedStartDisposition(error, disposition) {
  const resolved = HANDOFF_DISPOSITIONS.has(disposition)
    ? disposition
    : "ownership_uncertain";
  if (error && typeof error === "object") {
    error.handoffDisposition = resolved;
    return error;
  }
  const wrapped = new Error(String(error));
  /** @type {any} */ (wrapped).handoffDisposition = resolved;
  return wrapped;
}

function nonEmptyString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function isTerminalJob(job) {
  return Boolean(job && TERMINAL_STATUSES.has(job.status));
}

function matchesClaimedWorker(job, childPid, childIdentity = null) {
  if (!job || !["queued", HARNESS_QUEUED_JOB_STATUS, "running"].includes(job.status)) return false;
  if (!Number.isFinite(childPid) || job.workerPid !== childPid) return false;
  const storedIdentity = nonEmptyString(job.workerPidIdentity);
  if (!storedIdentity) return false;
  const expectedIdentity = nonEmptyString(childIdentity);
  return expectedIdentity == null || storedIdentity === expectedIdentity;
}

function matchesLauncherOwnership(job, launcher) {
  return Boolean(
    job &&
    ["queued", HARNESS_QUEUED_JOB_STATUS].includes(job.status) &&
    Number.isFinite(launcher?.pid) &&
    job.workerPid === launcher.pid &&
    nonEmptyString(job.workerPidIdentity) === nonEmptyString(launcher.identity) &&
    nonEmptyString(job.launcherGeneration) === nonEmptyString(launcher.generation)
  );
}

function waitFor(promise, milliseconds, fallback) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), milliseconds);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function observeChild(child, onPostSpawnError) {
  if (!child || typeof child.once !== "function") {
    throw new Error("Worker spawn did not return an observable child process.");
  }
  let spawned = false;
  let exited = child.exitCode != null || child.signalCode != null;
  let postSpawnError = null;
  let resolveSpawn = null;
  let resolveExit = null;
  const spawnOutcome = new Promise((resolve) => { resolveSpawn = resolve; });
  const exitOutcome = new Promise((resolve) => { resolveExit = resolve; });
  const markExit = () => {
    if (exited) return;
    exited = true;
    resolveExit?.(true);
  };
  if (exited) resolveExit?.(true);
  child.once("spawn", () => {
    spawned = true;
    resolveSpawn?.({ kind: "spawned" });
  });
  child.once("error", (error) => {
    resolveSpawn?.({ kind: "error", error });
    if (spawned) {
      postSpawnError = error;
      onPostSpawnError?.(error);
    }
  });
  child.once("exit", markExit);
  child.once("close", markExit);
  return {
    hasExited: () => exited,
    postSpawnError: () => postSpawnError,
    waitForSpawn: () => waitFor(spawnOutcome, CHILD_SPAWN_WAIT_MS, { kind: "timeout" }),
    waitForExit: () => exited
      ? Promise.resolve(true)
      : waitFor(exitOutcome, CHILD_EXIT_WAIT_MS, false),
  };
}

function terminalizeFencedWorker(cwd, jobId, errorMessage) {
  return transitionJob(cwd, jobId, ["cancelling"], "failed", {
    phase: "worker_handoff_failed",
    completedAt: nowIso(),
    errorMessage,
    failureClass: "worker_handoff_failed",
    safeFreshRetry: true,
    workerPid: null,
    workerPidIdentity: null,
    pid: null,
    pidIdentity: null,
  });
}

function recordWorkerHandoffUncertainty(cwd, jobId, errorMessage) {
  const current = readJobFile(cwd, jobId);
  if (!current) return null;
  const uncertainAt = nowIso();
  const diagnostic = {
    workerHandoffUncertainAt: uncertainAt,
    workerHandoffError: errorMessage,
  };
  if (isTerminalJob(current)) patchJob(cwd, jobId, diagnostic);
  else {
    patchJob(cwd, jobId, {
      ...diagnostic,
      phase: current.status === "cancelling"
        ? "worker_handoff_cancelling"
        : "worker_handoff_uncertain",
    });
  }
  const durable = readJobFile(cwd, jobId);
  if (durable?.workerHandoffUncertainAt !== uncertainAt) {
    throw new Error(`Worker handoff uncertainty for ${jobId} was not durably persisted.`);
  }
  return durable;
}

function mayUnrefUnresolvedChild(cwd, jobId, observer) {
  if (observer.hasExited()) return true;
  const durable = readJobFile(cwd, jobId);
  return Boolean(
    isTerminalJob(durable) ||
    nonEmptyString(durable?.workerHandoffUncertainAt)
  );
}

async function fenceQueuedWorkerAndTerminate({
  cwd,
  jobId,
  child,
  observer,
  childPid,
  childIdentity,
  launcher,
  reason,
  recordUncertainty,
}) {
  let fence;
  try {
    fence = transitionJob(cwd, jobId, ["queued", HARNESS_QUEUED_JOB_STATUS], "cancelling", {
      phase: "worker_handoff_cancelling",
      workerHandoffFenceAt: nowIso(),
      workerHandoffUncertainAt: nowIso(),
      workerHandoffError: reason,
      workerPid: Number.isFinite(childPid) ? childPid : null,
      workerPidIdentity: childIdentity ?? null,
      pid: null,
      pidIdentity: null,
    }, {
      predicate: (job) => matchesLauncherOwnership(job, launcher),
    });
  } catch {
    return { kind: "unknown" };
  }

  if (!fence.transitioned) {
    const observed = fence.job ?? readJobFile(cwd, jobId);
    // A worker claim that won before the fence has already crossed the
    // execution boundary. The parent must never send it a cleanup signal.
    if (matchesClaimedWorker(observed, childPid, childIdentity)) return { kind: "claimed" };
    // A queued-to-terminal control CAS is also an execution fence: the worker
    // claims only from queued, so an old child cannot accept Claude input.
    if (isTerminalJob(observed)) return { kind: "terminal" };
    return { kind: "unknown" };
  }

  let delivered = false;
  try {
    delivered = child.kill("SIGTERM") === true;
  } catch {}
  if (!delivered || !(await observer.waitForExit())) {
    try { recordUncertainty(cwd, jobId, reason); } catch {}
    return { kind: "unknown" };
  }

  let terminalized = null;
  try {
    terminalized = terminalizeFencedWorker(cwd, jobId, reason);
  } catch {
    return { kind: "unknown" };
  }
  if (terminalized.transitioned || isTerminalJob(terminalized.job)) return { kind: "terminal" };
  return { kind: "unknown" };
}

async function resolveSpawnedWorkerHandoff({
  cwd,
  jobId,
  child,
  observer,
  getWorkerIdentity,
  publishWorkerIdentity,
  launcher,
  recordUncertainty,
}) {
  const childPid = Number.isFinite(child?.pid) ? child.pid : null;
  let childIdentity = null;
  let publicationError = null;
  if (childPid != null) {
    try {
      childIdentity = nonEmptyString(await getWorkerIdentity(childPid));
    } catch (error) {
      publicationError = error;
    }
  }

  if (!observer.postSpawnError() && childPid != null && childIdentity) {
    try {
      const publication = await publishWorkerIdentity(
        cwd,
        jobId,
        childPid,
        childIdentity,
        launcher
      );
      if (publication?.transitioned && matchesClaimedWorker(publication.job, childPid, childIdentity)) {
        return { kind: "published" };
      }
    } catch (error) {
      publicationError = error;
    }
  }

  const observed = readJobFile(cwd, jobId);
  if (matchesClaimedWorker(observed, childPid, childIdentity)) return { kind: "claimed" };
  if (isTerminalJob(observed)) return { kind: "terminal" };

  const detail = observer.postSpawnError()
    ? `worker reported a post-spawn error: ${observer.postSpawnError() instanceof Error
      ? observer.postSpawnError().message
      : String(observer.postSpawnError())}`
    : publicationError instanceof Error
    ? publicationError.message
    : childIdentity
      ? "queued worker identity publication did not prove ownership"
      : "worker PID identity could not be proven";
  return fenceQueuedWorkerAndTerminate({
    cwd,
    jobId,
    child,
    observer,
    childPid,
    childIdentity,
    launcher,
    reason: `Worker handoff failed: ${detail}`,
    recordUncertainty,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitAbortError() {
  const error = new Error("CC Agent wait observation was cancelled by the caller.");
  error.name = "AbortError";
  return error;
}

function throwIfWaitAborted(signal) {
  if (signal?.aborted) throw waitAbortError();
}

function sleepForWait(ms, signal) {
  if (!signal) return sleep(ms);
  throwIfWaitAborted(signal);
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", onAbort);
      resolve(undefined);
    };
    const onAbort = () => {
      clearTimeout(timer);
      reject(waitAbortError());
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function summaryOf(prompt) {
  const normalized = String(prompt ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "Continue Claude session";
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93)}...`;
}

function normalizeAllowedTools(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resultSessionId(job) {
  return job?.threadId ?? job?.result?.sessionId ?? job?.request?.resumeSessionId ?? null;
}

function assertJobId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error("A Claude job id is required.");
  if (!/^[\w.-]+$/.test(id)) throw new Error(`Invalid Claude job id: ${id}`);
  return id;
}

function resolveJob(jobs, reference) {
  const id = assertJobId(reference);
  const exact = jobs.find((job) => job.id === id);
  if (exact) return exact;
  const matches = jobs.filter((job) => job.id.startsWith(id));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Job reference ${id} is ambiguous.`);
  throw new Error(`No Claude job found for ${id}.`);
}

function legacyOwnerRootId(job) {
  return typeof job?.sessionId === "string" && job.sessionId.trim()
    ? job.sessionId.trim()
    : null;
}

function jobOwnerRootId(job) {
  return typeof job?.ownerRootId === "string" && job.ownerRootId.trim()
    ? job.ownerRootId.trim()
    : legacyOwnerRootId(job);
}

const PUBLIC_PROGRESS_ACTIVITY = Object.freeze({
  initialized: { phase: "running", summary: "Claude session initialized." },
  thinking: { phase: "thinking", summary: "Claude is reasoning." },
  responding: { phase: "running", summary: "Claude is drafting its response." },
  tool: { phase: "tool", summary: "Claude is using a tool." },
  retrying: { phase: "retry", summary: "Claude is retrying an API request." },
  reconnecting: { phase: "reconnect_backoff", summary: "Claude is reconnecting." },
});

function projectPublicProgress(job, ownerRootId, jobId = null, options = {}) {
  if (
    jobOwnerRootId(job) !== ownerRootId ||
    !job.agentId ||
    !ACTIVE_JOB_STATUSES.has(job.status) ||
    (jobId != null && job.id !== jobId)
  ) {
    return null;
  }
      const progress = job.publicProgress;
      const revision = Number(progress?.revision ?? 0);
      const deliveredRevision = Number(job.publicProgressDeliveredRevision ?? 0);
      const activity = typeof progress?.activity === "string" ? progress.activity : "";
      const template = PUBLIC_PROGRESS_ACTIVITY[activity];
      if (
        !template ||
        !Number.isSafeInteger(revision) ||
        revision < 1 ||
        (options.requirePending !== false && (
          revision <= deliveredRevision ||
          !isJobPublicProgressDeliveryEligible(job)
        ))
      ) {
        return null;
      }
      let summary = template.summary;
      if (activity === "tool") {
        const match = String(progress?.summary ?? "").match(
          /^Claude is using ([A-Za-z0-9_.:-]{1,80})\.$/
        );
        const tool = safePublicToolName(match?.[1]);
        if (tool) summary = `Claude is using ${tool}.`;
      }
      const updatedAt = typeof progress?.updatedAt === "string" && Number.isFinite(Date.parse(progress.updatedAt))
        ? progress.updatedAt
        : job.updatedAt;
  return {
        kind: "progress",
        jobId: job.id,
        agentId: job.agentId,
        progress: {
          revision,
          activity,
          phase: template.phase,
          summary,
          updatedAt,
        },
  };
}

function pendingPublicProgress(cwd, ownerRootId, jobId = null, progressJobIds = null) {
  const jobs = jobId
    ? [readJobFile(cwd, jobId)].filter(Boolean)
    : Array.isArray(progressJobIds)
      ? progressJobIds.map((candidate) => readJobFile(cwd, candidate)).filter(Boolean)
      : listStoredJobs(cwd);
  return jobs
    .map((job) => projectPublicProgress(job, ownerRootId, jobId))
    .filter(Boolean)
    .sort((left, right) =>
      Date.parse(left.progress.updatedAt ?? 0) - Date.parse(right.progress.updatedAt ?? 0) ||
      left.jobId.localeCompare(right.jobId)
    )[0] ?? null;
}

class ClaudeRuntime {
  constructor(options = {}) {
    const inheritedEnv = options.env ?? process.env;
    const inheritedOwnerRootId = String(
      inheritedEnv[OWNER_ROOT_ID_ENV] ?? inheritedEnv.CODEX_THREAD_ID ?? ""
    ).trim();
    this.cwd = resolveWorkspaceRoot(options.cwd ?? process.cwd());
    const environment = resolveRuntimeEnvironment({
      cwd: this.cwd,
      env: inheritedEnv,
      envFile: options.envFile,
    });
    this.env = environment.env;
    configureRuntimePaths(this.env);
    this.environmentReceipt = environment.receipt;
    const configuredCheckout = String(this.env.CC_RUNTIME_CHECKOUT ?? "").trim();
    if (configuredCheckout) {
      const expectedSourceRoot = fs.realpathSync.native(path.resolve(configuredCheckout));
      if (!samePath(expectedSourceRoot, SOURCE_ROOT)) {
        throw new Error(
          `Refusing runtime source ${SOURCE_ROOT}; CC_RUNTIME_CHECKOUT requires ${expectedSourceRoot}.`
        );
      }
    }
    this.sourceRoot = SOURCE_ROOT;
    this.env.CC_RUNTIME_SOURCE_ROOT = this.sourceRoot;
    // Kept internal to this runtime constructor so local tests can freeze
    // launch races without starting a real Claude worker. The public Agent API
    // never accepts or exposes these dependencies.
    this.launchDependencies = {
      spawn: options.launchDependencies?.spawn ?? spawn,
      getProcessIdentity: options.launchDependencies?.getProcessIdentity ?? getProcessIdentity,
      createWorkerLogStdio: options.launchDependencies?.createWorkerLogStdio ?? createWorkerLogStdio,
      publishWorkerIdentity: options.launchDependencies?.publishWorkerIdentity ??
        ((cwd, jobId, workerPid, workerPidIdentity, launcher) => {
          const current = readJobFile(cwd, jobId);
          const status = current?.status;
          if (!["queued", HARNESS_QUEUED_JOB_STATUS].includes(status)) {
            return { transitioned: false, job: current, previousStatus: status ?? null };
          }
          return transitionJob(cwd, jobId, [status], status, {
            workerPid,
            workerPidIdentity,
            workerHandoffAt: nowIso(),
          }, {
            predicate: (job) => matchesLauncherOwnership(job, launcher),
          });
        }),
      recordWorkerHandoffUncertainty:
        options.launchDependencies?.recordWorkerHandoffUncertainty ?? recordWorkerHandoffUncertainty,
    };
    // Preserve the historical default projection for internal callers while
    // resolving every durable Agent/job from its own admitted Harness route.
    this.driver = resolveHarnessDriver(DEFAULT_HARNESS_ID, { env: this.env });
    this.harnessInstance = Object.freeze({
      harnessId: this.driver.harnessId,
      instanceKey: this.driver.resolveInstanceKey(this.env),
    });
    this.operatorMode = options.operatorMode === true;
    this.ownerRootId = String(
      this.operatorMode && options.ownerRootId
        ? options.ownerRootId
        : inheritedOwnerRootId
    ).trim() || null;
  }

  driverForHarness(harnessId = DEFAULT_HARNESS_ID) {
    // Preserve the existing in-process test seam while production composition
    // still resolves every non-default route from the static registry.
    if (this.driver?.harnessId === harnessId) return this.driver;
    return resolveHarnessDriver(harnessId, { env: this.env });
  }

  harnessInstanceFor(driver) {
    return Object.freeze({
      harnessId: driver.harnessId,
      instanceKey: driver.resolveInstanceKey(this.env),
    });
  }

  assertOwnerRoot() {
    if (!this.ownerRootId) {
      throw new Error(
        "A Codex root identity is required. Invoke this lifecycle through the plugin bootstrap so CODEX_THREAD_ID can be captured."
      );
    }
    return this.ownerRootId;
  }

  migrateMatchingLegacyOwner(job) {
    if (job?.ownerRootId || legacyOwnerRootId(job) !== this.ownerRootId) return job;
    return patchJob(this.cwd, job.id, { ownerRootId: this.ownerRootId }) ?? job;
  }

  readiness(harnessId = DEFAULT_HARNESS_ID) {
    const driver = this.driverForHarness(harnessId);
    const preflight = driver.preflight({ cwd: this.cwd, env: this.env });
    return {
      ...preflight,
      harness: {
        harnessId: driver.harnessId,
        driverVersion: driver.driverVersion,
        instanceKey: preflight.instanceKey,
        capabilities: driver.capabilities,
      },
      cwd: this.cwd,
      claudeConfigDir: this.env.CLAUDE_CONFIG_DIR ?? null,
      environment: this.environmentReceipt,
      sourceRoot: this.sourceRoot,
      ownerRoot: {
        available: Boolean(this.ownerRootId),
        source: this.ownerRootId ? "codex_thread_environment" : null,
        scope: "logical_root",
      },
      stateProtection: getStateProtectionReceipt(this.cwd),
    };
  }

  assertReady(harnessId = DEFAULT_HARNESS_ID) {
    const driver = this.driverForHarness(harnessId);
    const receipt = this.readiness(driver.harnessId);
    const unready = driver.describeUnreadiness(receipt);
    if (unready) throw new Error(unready);
    return receipt;
  }

  assertPreparedReadiness(receipt, driver = this.driver) {
    if (receipt == null) return this.assertReady(driver.harnessId);
    return driver.validatePreparedPreflight(receipt, {
      cwd: this.cwd,
      env: this.env,
      sourceRoot: this.sourceRoot,
    });
  }

  list() {
    const ownerRootId = this.assertOwnerRoot();
    const jobs = sortJobsNewestFirst(listJobsForOwner(this.cwd, ownerRootId));
    return jobs
      .filter((job) => jobOwnerRootId(job) === ownerRootId)
      .map((job) => enrichJob(this.migrateMatchingLegacyOwner(job)));
  }

  status(jobId = null) {
    const jobs = this.list();
    if (jobId) return enrichJob(resolveJob(jobs, jobId));
    const ownerRootId = this.assertOwnerRoot();
    return {
      workspaceRoot: this.cwd,
      active: jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)),
      recent: jobs.slice(0, 15),
      unreadCompletions: readUnreadCompletionEvents(this.cwd, ownerRootId),
    };
  }

  operatorListAllJobs() {
    if (!this.operatorMode) throw new Error("Cross-root listing is operator-only.");
    return sortJobsNewestFirst(listStoredJobs(this.cwd)).map((job) => enrichJob(job));
  }

  assertSessionAvailable(sessionId, excludingJobId = null) {
    if (!sessionId) return;
    const owner = listStoredJobs(this.cwd).find((job) =>
      job.id !== excludingJobId &&
      ACTIVE_JOB_STATUSES.has(job.status) &&
      resultSessionId(job) === sessionId
    );
    if (owner) {
      throw new Error(`Claude session ${sessionId} is already owned by active job ${owner.id}.`);
    }
  }

  prepareStart(task, options = {}) {
    const ownerRootId = this.assertOwnerRoot();
    const prompt = String(task ?? "").trim();
    const resumeSessionId = String(options.resumeSessionId ?? "").trim() || null;
    if (!prompt && !resumeSessionId) {
      throw new Error("start requires a task or an explicit Claude session to resume.");
    }
    // Keep this validation ahead of readiness and all durable job writes. The
    // public lifecycle validates first for caller-facing failure semantics;
    // preparation repeats it so internal callers cannot bypass that boundary.
    const driver = this.driverForHarness(options.harnessId ?? DEFAULT_HARNESS_ID);
    const harnessInstance = this.harnessInstanceFor(driver);
    const executionProfile = driver.validateRoute({
      profile: options.profile,
      write: options.write,
      model: options.model,
      effort: options.effort,
      permissionMode: options.permissionMode,
      dangerouslySkipPermissions: options.dangerouslySkipPermissions,
      allowedTools: options.allowedTools,
      delegationMode: options.delegationMode,
    });
    const profile = executionProfile.name;
    // Agent orchestration validates this potentially slow CLI/auth check
    // before it publishes an active Agent reservation. Reuse that exact,
    // scope-bound receipt here so the small reservation-to-job window contains
    // only local durable writes and worker launch.
    const readiness = this.assertPreparedReadiness(options.readinessReceipt, driver);
    const jobId = String(options.jobId ?? "").trim() || generateJobId("cc");
    if (!/^[\w.-]+$/.test(jobId)) throw new Error(`Invalid internal Claude job id: ${jobId}.`);
    const title = options.title ?? "Claude Code Task";
    const candidateAgentId = String(options.agentId ?? "").trim() || null;
    let launcherIdentity = null;
    try { launcherIdentity = getProcessIdentity(process.pid); } catch {}
    if (!launcherIdentity) {
      throw new Error("Unable to establish a deterministic launcher process identity.");
    }
    const launcherGeneration = generateJobId("launcher");
    try {
      const base = createJobRecord({
        id: jobId,
        kind: "task",
        kindLabel: "run",
        jobClass: "task",
        title,
        summary: summaryOf(prompt),
        workspaceRoot: this.cwd,
        write: Boolean(options.write),
        profile,
        // A prepared fact intentionally has no persisted agentId. Losing a
        // concurrent Agent reservation must leave a disposable diagnostic
        // record, never a terminal fact that can project onto an Agent.
        claudeConfigDir: this.env.CLAUDE_CONFIG_DIR,
        readiness,
        parentJobId: options.parentJobId ?? null,
      }, {
        cwd: this.cwd,
        env: this.env,
        ownerRootId,
      });
      const logFile = createJobLogFile(this.cwd, jobId, title);
      const request = {
        prompt: prompt || "Continue where you left off.",
        write: Boolean(options.write),
        profile,
        model: executionProfile.model,
        effort: executionProfile.effort ?? null,
        permissionMode: options.permissionMode ?? null,
        dangerouslySkipPermissions: executionProfile.dangerouslySkipPermissions,
        allowedTools: normalizeAllowedTools(options.allowedTools),
        delegationMode: executionProfile.delegationMode,
        sessionName: String(options.sessionName ?? "").trim() || null,
        resumeSessionId,
      };
      writeJobFile(this.cwd, jobId, {
        ...base,
        // Every prepared turn records the Driver contract that launched it, so
        // recovery is later judged against the same capabilities rather than
        // whatever the current registry happens to publish.
        harnessStateVersion: HARNESS_JOB_STATE_VERSION,
        harnessId: driver.harnessId,
        driverVersion: driver.driverVersion,
        harnessInstanceKey: harnessInstance.instanceKey,
        harnessCapabilities: driver.capabilities,
        harnessRoute: {
          harnessId: driver.harnessId,
          model: executionProfile.model,
          effort: executionProfile.effort ?? null,
          delegationMode: executionProfile.delegationMode,
          write: Boolean(options.write),
        },
        status: HARNESS_QUEUED_JOB_STATUS,
        phase: "activation_prepared",
        activationPrepared: true,
        activationAttached: false,
        preClaudeLaunch: true,
        safeFreshRetry: true,
        acceptingSteering: driver.capabilities.activeInput === "acknowledged_active_stream",
        // The caller owning this prepared fact is an identity-verified launch
        // boundary. Reaping consults this PID, so a slow local lease/write
        // cannot be mistaken for a dead reservation while the caller lives.
        workerPid: process.pid,
        workerPidIdentity: launcherIdentity,
        launcherGeneration,
        pid: null,
        pidIdentity: null,
        logFile,
        request,
      });
      appendLogLine(logFile, "Prepared for Agent activation.");
      return {
        jobId,
        agentId: candidateAgentId,
        status: "prepared",
        title,
        summary: base.summary,
        profile,
        workspaceRoot: this.cwd,
        launcherPid: process.pid,
        launcherIdentity,
        launcherGeneration,
      };
    } catch (error) {
      try { fs.unlinkSync(resolveJobFile(this.cwd, jobId)); } catch {}
      try { fs.unlinkSync(resolveJobLogFile(this.cwd, jobId)); } catch {}
      throw error;
    }
  }

  attachPreparedStart(prepared, agentId) {
    const jobId = assertJobId(prepared?.jobId);
    const id = String(agentId ?? "").trim();
    if (!id) throw new Error("Prepared Agent start requires an Agent ID.");
    const job = readJobFile(this.cwd, jobId);
    if (
      !matchesLauncherOwnership(job, {
        pid: prepared?.launcherPid,
        identity: prepared?.launcherIdentity,
        generation: prepared?.launcherGeneration,
      }) ||
      job.phase !== "activation_prepared" ||
      job.agentId
    ) {
      throw new Error(`Prepared job ${jobId} is no longer attachable to an Agent.`);
    }
    patchJob(this.cwd, jobId, {
      agentId: id,
      activationAttached: true,
      activationAttachedAt: nowIso(),
    });
    return { ...prepared, agentId: id };
  }

  abortPreparedStart(prepared, options = {}) {
    const jobId = assertJobId(prepared?.jobId);
    const job = readJobFile(this.cwd, jobId);
    // A durable launch marker is a cross-process boundary: an ordinary caller
    // may not remove it merely because no child PID was published yet. The
    // sole exception is a structured rollback_safe disposition, which proves
    // that spawn itself never succeeded.
    const rollbackSafe = options.handoffDisposition === "rollback_safe";
    if (
      !job ||
      !matchesLauncherOwnership(job, {
        pid: prepared?.launcherPid,
        identity: prepared?.launcherIdentity,
        generation: prepared?.launcherGeneration,
      }) ||
      job.pid != null ||
      (job.workerLaunchStartedAt && !rollbackSafe)
    ) {
      return false;
    }
    try { fs.unlinkSync(resolveJobFile(this.cwd, jobId)); } catch { return false; }
    try { fs.unlinkSync(resolveJobLogFile(this.cwd, jobId)); } catch {}
    return true;
  }

  async launchPreparedStart(prepared, task) {
    const jobId = assertJobId(prepared?.jobId);
    const current = readJobFile(this.cwd, jobId);
    const launcher = {
      pid: prepared?.launcherPid,
      identity: prepared?.launcherIdentity,
      generation: prepared?.launcherGeneration,
    };
    if (!matchesLauncherOwnership(current, launcher)) {
      throw new Error(`Prepared job ${jobId} is no longer owned by this launcher.`);
    }
    if (prepared.agentId && current.agentId !== prepared.agentId) {
      throw new Error(`Prepared job ${jobId} is not attached to the expected Agent.`);
    }
    const prompt = String(task ?? "").trim();
    const resumeSessionId = String(current.request?.resumeSessionId ?? "").trim() || null;
    if (!prompt && !resumeSessionId) {
      throw new Error("Prepared start requires a task or an explicit Claude session to resume.");
    }
    let sessionLease = null;
    let childReturned = false;
    let handoffResolved = false;
    let workerLog = null;
    let launched = null;
    let receipt = null;
    let failure = null;
    const harnessInstance = Object.freeze({
      harnessId: nonEmptyString(current.harnessId) ?? DEFAULT_HARNESS_ID,
      instanceKey: nonEmptyString(current.harnessInstanceKey) ??
        this.driverForHarness(current.harnessId ?? DEFAULT_HARNESS_ID).resolveInstanceKey(this.env),
    });
    try {
      sessionLease = resumeSessionId
        ? reserveSessionLease(this.cwd, harnessInstance, resumeSessionId, jobId)
        : null;
      launched = patchJob(this.cwd, jobId, {
        summary: summaryOf(prompt),
        phase: "queued",
        activationPrepared: false,
        ...(sessionLease ? {
          sessionLease: {
            harnessId: sessionLease.harnessId,
            instanceKey: sessionLease.instanceKey,
            configIdentity: sessionLease.configIdentity,
            sessionId: sessionLease.sessionId,
          },
        } : {}),
        request: {
          ...current.request,
          prompt: prompt || "Continue where you left off.",
        },
      });
      if (!launched || launched.status !== HARNESS_QUEUED_JOB_STATUS) {
        throw new Error(`Prepared job ${jobId} could not enter the queued launch state.`);
      }
      const marked = patchJob(this.cwd, jobId, { workerLaunchStartedAt: nowIso() });
      if (!matchesLauncherOwnership(marked, launcher)) {
        throw new Error(`Prepared job ${jobId} could not record detached-worker launch.`);
      }
      appendLogLine(launched.logFile, "Queued for background execution.");

      workerLog = this.launchDependencies.createWorkerLogStdio(launched.logFile);
      const child = this.launchDependencies.spawn(process.execPath, [CLI_PATH, "worker", "--cwd", this.cwd, "--job-id", jobId], {
        cwd: this.cwd,
        env: this.env,
        detached: true,
        stdio: /** @type {import("node:child_process").StdioOptions} */ (workerLog.stdio),
        windowsHide: true,
      });
      childReturned = true;
      let observer = null;
      observer = observeChild(child, (error) => {
        try {
          this.launchDependencies.recordWorkerHandoffUncertainty(
            this.cwd,
            jobId,
            `Worker reported an error after spawn: ${error instanceof Error ? error.message : String(error)}`
          );
        } catch {}
      });
      const spawnOutcome = await observer.waitForSpawn();
      if (spawnOutcome.kind === "error") {
        throw withPreparedStartDisposition(
          spawnOutcome.error instanceof Error
            ? spawnOutcome.error
            : new Error("Worker process failed before spawn."),
          "rollback_safe"
        );
      }
      if (spawnOutcome.kind !== "spawned") {
        const handoff = await fenceQueuedWorkerAndTerminate({
          cwd: this.cwd,
          jobId,
          child,
          observer,
          childPid: Number.isFinite(child?.pid) ? child.pid : null,
          childIdentity: null,
          launcher,
          reason: `Worker process did not prove spawn within the handoff window for ${jobId}.`,
          recordUncertainty: this.launchDependencies.recordWorkerHandoffUncertainty,
        });
        if (handoff.kind !== "unknown" || mayUnrefUnresolvedChild(this.cwd, jobId, observer)) {
          try { child.unref(); } catch {}
        }
        if (handoff.kind === "terminal") {
          throw withPreparedStartDisposition(
            new Error(`Worker handoff ended before Claude launch for ${jobId}.`),
            "lifecycle_owned"
          );
        }
        if (handoff.kind === "claimed") {
          handoffResolved = true;
          receipt = {
            jobId,
            agentId: launched.agentId ?? null,
            status: "queued",
            title: launched.title,
            summary: launched.summary,
            profile: launched.profile,
            workspaceRoot: this.cwd,
          };
        } else {
          throw withPreparedStartDisposition(
            new Error("Worker process did not prove spawn within the handoff window."),
            "ownership_uncertain"
          );
        }
      } else {
        const handoff = await resolveSpawnedWorkerHandoff({
          cwd: this.cwd,
          jobId,
          child,
          observer,
          getWorkerIdentity: this.launchDependencies.getProcessIdentity,
          publishWorkerIdentity: this.launchDependencies.publishWorkerIdentity,
          launcher,
          recordUncertainty: this.launchDependencies.recordWorkerHandoffUncertainty,
        });
        if (handoff.kind === "published" || handoff.kind === "claimed") {
          handoffResolved = true;
          try { child.unref(); } catch {
            try { appendLogLine(launched.logFile, "Worker handoff succeeded but child unref failed."); } catch {}
          }
          receipt = {
            jobId,
            agentId: launched.agentId ?? null,
            status: "queued",
            title: launched.title,
            summary: launched.summary,
            profile: launched.profile,
            workspaceRoot: this.cwd,
          };
        } else if (handoff.kind === "terminal") {
          handoffResolved = true;
          try { child.unref(); } catch {}
          throw withPreparedStartDisposition(
            new Error(`Worker handoff ended before Claude launch for ${jobId}.`),
            "lifecycle_owned"
          );
        } else {
          try {
            this.launchDependencies.recordWorkerHandoffUncertainty(
              this.cwd,
              jobId,
              `Worker handoff could not prove publication, claim, or exit for ${jobId}.`
            );
          } catch {}
          if (mayUnrefUnresolvedChild(this.cwd, jobId, observer)) {
            try { child.unref(); } catch {}
          }
          throw withPreparedStartDisposition(
            new Error(`Worker handoff ownership remains uncertain for ${jobId}.`),
            "ownership_uncertain"
          );
        }
      }
    } catch (error) {
      const explicitDisposition = String(error?.handoffDisposition ?? "");
      failure = withPreparedStartDisposition(
        error,
        HANDOFF_DISPOSITIONS.has(explicitDisposition)
          ? explicitDisposition
          : childReturned ? "ownership_uncertain" : "rollback_safe"
      );
    }

    try {
      workerLog?.close();
    } catch (error) {
      try {
        appendLogLine(launched?.logFile, `Worker log cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      } catch {}
      if (!handoffResolved && !failure) {
        failure = withPreparedStartDisposition(error, childReturned ? "ownership_uncertain" : "rollback_safe");
      }
    }

    if (failure) {
      if (preparedStartDisposition(failure) === "rollback_safe" && sessionLease) {
        releaseSessionLease(harnessInstance, sessionLease.sessionId, jobId);
      }
      throw failure;
    }
    return receipt;
  }

  async start(task, options = {}) {
    const prepared = this.prepareStart(task, options);
    let launchAttempted = false;
    try {
      const attached = prepared.agentId
        ? this.attachPreparedStart(prepared, prepared.agentId)
        : prepared;
      launchAttempted = true;
      return await this.launchPreparedStart(attached, task);
    } catch (error) {
      const handoffDisposition = launchAttempted
        ? preparedStartDisposition(error)
        : "rollback_safe";
      if (handoffDisposition === "rollback_safe") {
        this.abortPreparedStart(prepared, { handoffDisposition });
      }
      throw error;
    }
  }

  async runWorker(jobId) {
    const ownerRootId = this.assertOwnerRoot();
    const id = assertJobId(jobId);
    const stored = readJobFile(this.cwd, id);
    if (!stored) throw new Error(`No stored Claude job found for ${id}.`);
    if (jobOwnerRootId(stored) !== ownerRootId) {
      throw new Error(`Stored Claude job ${id} does not belong to the current Codex root scope.`);
    }
    const requiredQueueStatus = stored.harnessStateVersion === HARNESS_JOB_STATE_VERSION
      ? HARNESS_QUEUED_JOB_STATUS
      : "queued";
    if (stored.status !== requiredQueueStatus) {
      throw new Error(
        `Claude job ${id} is ${stored.status}; worker requires ${requiredQueueStatus}.`
      );
    }
    const progress = createProgressReporter({
      logFile: stored.logFile ?? resolveJobLogFile(this.cwd, id),
      onEvent: createJobProgressUpdater(this.cwd, id),
    });
    return runTrackedJob(stored, (onSpawn) => {
      const driver = this.assertJobDriver(stored);
      const launchContext = driver.revalidatePreparedPreflight(stored.readiness, {
        cwd: this.cwd,
        env: this.env,
        sourceRoot: this.sourceRoot,
      });
      return this.execute(stored, progress, onSpawn, launchContext);
    }, {
      logFile: stored.logFile,
      claimStatuses: [requiredQueueStatus],
    });
  }

  /**
   * Run one prepared turn through this job's immutable Driver route. Native
   * protocol, prompt envelope, recovery, and failure detection stay behind the
   * Driver; the supervisor only normalizes the terminal result into its own
   * durable receipt.
   */
  async execute(job, onProgress, onSpawn, launchContext) {
    const request = job.request ?? {};
    const driver = this.assertJobDriver(job);
    const turn = validateHarnessTurnResult(await driver.startTurn({
      workspaceRoot: this.cwd,
      cwd: this.cwd,
      jobId: job.id,
      prompt: request.prompt,
      route: {
        profile: request.profile,
        write: request.write,
        model: request.model,
        effort: request.effort,
        permissionMode: request.permissionMode,
        dangerouslySkipPermissions: request.dangerouslySkipPermissions,
        allowedTools: request.allowedTools,
        delegationMode: request.delegationMode,
      },
      env: this.env,
      launchContext,
      sessionName: request.sessionName ?? undefined,
      resumeSessionId: request.resumeSessionId ?? undefined,
      onProgress,
      onSpawn,
    }), driver);
    const rawOutput = String(turn.finalMessage ?? "");
    const nativeSessionId = turn.nativeSession?.nativeSessionId ?? null;
    const receipts = turn.receipts ?? {};
    const payload = {
      status: turn.status,
      sessionId: nativeSessionId,
      rawOutput,
      partialOutput: rawOutput,
      warning: turn.warning ?? null,
      failureClass: turn.failure.class ?? null,
      failureReason: turn.failure.reason ?? null,
      resumable: turn.failure.resumable === true,
      recoveryAttempts: receipts.recoveryAttempts ?? 0,
      attempts: receipts.attempts ?? [],
      steering: receipts.steering ?? null,
      lastByteAt: turn.lastActivityAt ?? null,
      manualResumeCommand: turn.manualContinuationCommand ?? null,
      requiresAttention: Boolean(turn.failure.requiresAttention),
      toolUses: receipts.toolUses ?? [],
      touchedFiles: receipts.touchedFiles ?? [],
      harnessId: turn.harnessId,
      driverVersion: turn.driverVersion,
      nativeSessionRef: turn.nativeSession,
      sessionExactness: turn.sessionExactness,
      driverReceipt: turn.driverReceipt,
      runtimeReceipt: {
        ...(turn.runtime ?? {}),
        environment: this.environmentReceipt,
        workspaceRoot: this.cwd,
        sourceRoot: this.sourceRoot,
      },
    };
    return {
      exitStatus: turn.exitStatus,
      threadId: nativeSessionId,
      turnId: null,
      payload,
      rendered: renderTaskResult({
        rawOutput,
        failureReason: turn.failure.reason,
        failureMessage: turn.failure.detail,
      }),
      summary: summaryOf(rawOutput || turn.failure.reason || job.summary),
    };
  }

  /**
   * Deliver supervisor-assigned input to an already-running turn. A Driver
   * whose persisted snapshot admits only the initial prompt refuses here rather
   * than letting the supervisor claim an unproven active delivery.
   */
  assignInput(job, text, options = {}) {
    const driver = this.assertJobDriver(job);
    assertHarnessCapability(
      job?.harnessCapabilities ?? driver.capabilities,
      "activeInput",
      ["acknowledged_active_stream"],
      `Harness ${driver.harnessId} does not accept input for a running turn`
    );
    return driver.assignInput({
      cwd: this.cwd,
      jobId: job.id,
      text,
      kind: options.kind,
      messageId: options.messageId,
    });
  }

  /**
   * Resolve the Driver a durable turn was launched with. A record naming
   * another Harness, Driver version, or capability vocabulary fails closed
   * instead of being executed by the currently registered Driver.
   */
  assertJobDriver(job, options = {}) {
    const stateVersion = job?.harnessStateVersion;
    if (stateVersion != null && stateVersion !== HARNESS_JOB_STATE_VERSION) {
      throw new Error(
        `Claude job ${job.id} carries Harness state version ${stateVersion}; ` +
        `this runtime owns version ${HARNESS_JOB_STATE_VERSION}.`
      );
    }
    const harnessId = nonEmptyString(job?.harnessId) ?? DEFAULT_HARNESS_ID;
    const driver = this.driverForHarness(harnessId);
    const driverVersion = nonEmptyString(job?.driverVersion);
    // Stopping a live turn must stay possible across a Driver version bump:
    // process control needs the Harness and its interrupt capability, not an
    // identical Driver build. Executing or steering a turn still requires one.
    if (
      options.allowDriverVersionDrift !== true &&
      driverVersion &&
      driverVersion !== driver.driverVersion
    ) {
      throw new Error(
        `Harness job ${job.id} was prepared by Driver ${driverVersion}; this runtime provides ${driver.driverVersion}.`
      );
    }
    if (job?.harnessCapabilities != null) {
      // An unknown capability name or value always fails here. A snapshot that
      // parses but disagrees with the resolved Driver means the record was
      // written by a contract this process cannot execute; process control
      // instead judges the persisted snapshot on its own terms.
      const persisted = validateHarnessCapabilities(
        job.harnessCapabilities,
        `Claude job ${job.id} capability snapshot`
      );
      for (const name of options.allowDriverVersionDrift === true ? [] : HARNESS_CAPABILITY_NAMES) {
        if (persisted[name] !== driver.capabilities[name]) {
          throw new Error(
            `Harness job ${job.id} was prepared with ${name}=${persisted[name]}; ` +
            `this runtime provides ${name}=${driver.capabilities[name]}.`
          );
        }
      }
    }
    return driver;
  }

  steer(jobId, message) {
    const job = this.status(jobId);
    if (!ACTIVE_JOB_STATUSES.has(job.status) || job.status === "cancelling" || job.status === "interrupting") {
      throw new Error(`Claude job ${job.id} is ${job.status}; use followUp for a resumable terminal job.`);
    }
    const queued = this.assignInput(job, message);
    return {
      jobId: job.id,
      status: job.status,
      sequence: queued.sequence,
      mode: "durable_stream_input",
      steering: getSteeringSnapshot(this.cwd, job.id),
    };
  }

  async followUp(jobId, message, options = {}) {
    const source = this.status(jobId);
    const recoverability = source.recoverability ?? null;
    if (!recoverability?.resumable || recoverability.mode !== "exact_session") {
      throw new Error(
        `Claude job ${source.id} is not explicitly resumable: ${recoverability?.reason ?? source.status}.`
      );
    }
    const sessionId = recoverability.exactSessionId ?? resultSessionId(source);
    if (!sessionId) throw new Error(`Claude job ${source.id} has no owner-valid exact Claude session to resume.`);
    const request = readJobFile(this.cwd, source.id)?.request ?? {};
    return this.start(message, {
      write: options.write ?? source.write,
      profile: options.profile ?? request.profile ?? source.profile,
      model: options.model ?? request.model,
      effort: options.effort ?? request.effort,
      permissionMode: options.permissionMode ?? request.permissionMode,
      dangerouslySkipPermissions:
        options.dangerouslySkipPermissions ?? request.dangerouslySkipPermissions,
      allowedTools: options.allowedTools ?? request.allowedTools,
      delegationMode: options.delegationMode ?? request.delegationMode,
      sessionName: options.sessionName ?? request.sessionName,
      resumeSessionId: sessionId,
      parentJobId: source.id,
      title: "Claude Code Follow-up",
    });
  }

  async interrupt(jobId) {
    const job = this.status(jobId);
    const stored = readJobFile(this.cwd, job.id) ?? job;
    const driver = this.assertJobDriver(stored, { allowDriverVersionDrift: true });
    assertHarnessCapability(
      stored.harnessCapabilities ?? driver.capabilities,
      "interrupt",
      ["graceful_flush_proven", "best_effort_signal"],
      `Harness ${driver.harnessId} cannot interrupt an active turn`
    );
    const transition = transitionJob(this.cwd, job.id, ["running"], "interrupting", {
      acceptingSteering: false,
      phase: "interrupting",
    });
    if (!transition.transitioned) throw new Error(`Claude job ${job.id} is no longer running.`);

    /** @type {{ interrupted: boolean, note?: string, controlFailure?: string, forced?: boolean }} */
    let receipt = {
      interrupted: true,
      note: "Supervisor will stop before spawning another Claude attempt.",
    };
    if (stored.pid) {
      if (!stored.pidIdentity) {
        receipt = {
          interrupted: false,
          note: "Refusing to signal a process without a PID identity.",
          controlFailure: "missing_identity",
        };
      } else {
        receipt = await driver.interruptTurn({
          pid: stored.pid,
          pidIdentity: stored.pidIdentity,
        });
      }
    }
    if (!receipt.interrupted) {
      const forced = !receipt.controlFailure && stored.pid && stored.pidIdentity
        ? await driver.cancelTurn({ pid: stored.pid, pidIdentity: stored.pidIdentity })
        : { cancelled: false, note: receipt.note };
      if (forced.cancelled) {
        const current = readJobFile(this.cwd, job.id) ?? stored;
        transitionJob(this.cwd, job.id, ["interrupting"], "failed", {
          phase: "forced_interruption_unflushed",
          completedAt: nowIso(),
          acceptingSteering: false,
          pid: null,
          pidIdentity: null,
          workerPid: null,
          workerPidIdentity: null,
          result: {
            ...(current.result ?? {}),
            status: "failed",
            sessionId: resultSessionId(current),
            rawOutput: current.partialOutput ?? "",
            partialOutput: current.partialOutput ?? "",
            resumable: false,
            failureClass: "forced_interruption_unflushed",
            failureReason: "Claude process tree required forced termination without transcript flush evidence.",
          },
        });
        receipt = {
          interrupted: false,
          forced: true,
          note: "Turn was force-terminated and is not considered safely resumable.",
        };
      } else {
        transitionJob(this.cwd, job.id, ["interrupting"], "running", {
          phase: "interrupt_failed",
          acceptingSteering: true,
        });
        receipt = {
          ...receipt,
          note: forced.note ?? receipt.note,
        };
      }
    } else {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (readJobFile(this.cwd, job.id)?.status !== "interrupting") break;
        await sleep(100);
      }
      const current = readJobFile(this.cwd, job.id);
      if (current?.status === "interrupting") {
        const sessionId = resultSessionId(current);
        transitionJob(this.cwd, job.id, ["interrupting"], "interrupted", {
          phase: "interrupted",
          completedAt: nowIso(),
          pid: null,
          pidIdentity: null,
          workerPid: null,
          workerPidIdentity: null,
          result: {
            ...(current.result ?? {}),
            status: "failed",
            sessionId,
            rawOutput: current.partialOutput ?? "",
            partialOutput: current.partialOutput ?? "",
            failureClass: "cancelled_or_interrupted",
          },
        });
      }
    }
    const current = readJobFile(this.cwd, job.id) ?? job;
    return {
      jobId: job.id,
      interrupted: receipt.interrupted,
      status: current.status,
      sessionId: resultSessionId(current),
      forced: receipt.forced === true,
      note: receipt.note ?? null,
    };
  }



  result(jobId = null) {
    const jobs = this.list();
    const job = jobId
      ? resolveJob(jobs, jobId)
      : jobs.find((candidate) => TERMINAL_STATUSES.has(candidate.status));
    if (!job) throw new Error("No finished Claude jobs found for this workspace.");
    return {
      state: TERMINAL_STATUSES.has(job.status) ? "terminal" : "active",
      job,
      result: job.result ?? null,
    };
  }

  async wait(jobId, options = {}) {
    const ownerRootId = this.assertOwnerRoot();
    const requestedTimeout = options.timeoutMs == null ? 30_000 : Number(options.timeoutMs);
    if (!Number.isFinite(requestedTimeout) || requestedTimeout < 0) {
      throw new Error("wait timeoutMs must be a non-negative finite number.");
    }
    const timeoutMs = requestedTimeout;
    const pollIntervalMs = Math.max(50, Number(options.pollIntervalMs) || 500);
    const signal = options.signal ?? null;
    throwIfWaitAborted(signal);
    const acknowledgeTokens = Array.isArray(options.acknowledgeTokens)
      ? options.acknowledgeTokens
      : [];
    const wakeOnProgress = options.wakeOnProgress === true;
    const resolveProgressJobIds = () => {
      const values = typeof options.progressJobIds === "function"
        ? options.progressJobIds()
        : options.progressJobIds;
      return Array.isArray(values)
        ? [...new Set(values.map((value) => assertJobId(value)))]
        : null;
    };
    const acknowledgement = acknowledgeTokens.length > 0
      ? acknowledgeAgentCompletionEvents(this.cwd, ownerRootId, acknowledgeTokens)
      : { acknowledgedCount: 0, acknowledgedThrough: null, compactedCount: 0 };
    const deadline = Date.now() + timeoutMs;
    let job = jobId ? this.status(jobId) : null;
    let inbox = { events: [] };
    let selectedProgress = null;
    while (true) {
      throwIfWaitAborted(signal);
      inbox = readUnreadAgentCompletionSummaries(this.cwd, ownerRootId);
      if (inbox.events.length > 0) break;
      const progress = wakeOnProgress
        ? pendingPublicProgress(
            this.cwd,
            ownerRootId,
            jobId,
            resolveProgressJobIds()
          )
        : null;
      if (!progress) {
        job = jobId ? this.status(jobId) : null;
        if ((job && !ACTIVE_JOB_STATUSES.has(job.status)) || Date.now() >= deadline) break;
        await sleepForWait(
          Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())),
          signal
        );
        continue;
      }
      // Completion is authoritative and always wins a race with advisory
      // progress. Recheck immediately before advancing the progress revision.
      inbox = readUnreadAgentCompletionSummaries(this.cwd, ownerRootId);
      if (inbox.events.length > 0) break;
      const claimed = claimJobPublicProgress(this.cwd, progress.jobId);
      if (claimed.claimed && claimed.job) {
        selectedProgress = projectPublicProgress(claimed.job, ownerRootId, jobId, {
          requirePending: false,
        });
        if (selectedProgress) break;
      }
      // Another waiter may have claimed the same oldest revision. Re-select
      // immediately so a different pending Agent is not reported as timeout.
    }
    const update = inbox.events[0] ?? selectedProgress ?? null;
    const waitTimedOut = update == null && (!job || ACTIVE_JOB_STATUSES.has(job.status));
    return {
      // The public Agent runtime intentionally does not expose the internal
      // acknowledgement receipt; it only needs the next delivery token.
      update,
      acknowledgement,
      waitTimedOut,
      message: waitTimedOut
        ? "Timed out waiting for CC Agent activity."
        : update?.kind === "progress"
          ? "CC Agent progress is available."
          : "CC Agent completion is available.",
    };
  }
}

export function createInternalClaudeRuntime(options = {}) {
  return new ClaudeRuntime(options);
}

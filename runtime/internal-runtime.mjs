/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * ClaudeRuntime is the only public lifecycle interface. Codex skills and tests
 * call this module; subprocess, persistence, retries, and stream-json details
 * stay internal.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cancelClaudeProcess,
  getClaudeAuthStatus,
  getClaudeAvailability,
  interruptClaudeProcess,
} from "./claude-headless-adapter.mjs";
import { createExecutionProfile, normalizeProfileName } from "./execution-profile.mjs";
import { resolveRuntimeEnvironment } from "./environment.mjs";
import { runClaudeTaskSession } from "./job-supervisor.mjs";
import {
  ACTIVE_JOB_STATUSES,
  cleanupOldJobs,
  enqueueSteeringMessage,
  generateJobId,
  getSteeringSnapshot,
  getStateProtectionReceipt,
  listJobs,
  listStoredJobs,
  nowIso,
  patchJob,
  readJobFile,
  releaseSessionLease,
  reserveSessionLease,
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
  OWNER_ROOT_ID_ENV,
} from "./job-runner.mjs";
import { enrichJob, sortJobsNewestFirst } from "./job-query.mjs";
import { getProcessIdentity } from "./process-control.mjs";
import { configureRuntimePaths, samePath } from "./paths.mjs";
import { renderTaskResult } from "./render.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";
import {
  acknowledgeCompletionEvents,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    this.operatorMode = options.operatorMode === true;
    this.ownerRootId = String(
      this.operatorMode && options.ownerRootId
        ? options.ownerRootId
        : inheritedOwnerRootId
    ).trim() || null;
  }

  assertOwnerRoot() {
    if (!this.ownerRootId) {
      throw new Error(
        "A trusted Codex root identity is required. Invoke this lifecycle through the plugin bootstrap so CODEX_THREAD_ID can be captured."
      );
    }
    return this.ownerRootId;
  }

  migrateMatchingLegacyOwner(job) {
    if (job?.ownerRootId || legacyOwnerRootId(job) !== this.ownerRootId) return job;
    return patchJob(this.cwd, job.id, { ownerRootId: this.ownerRootId }) ?? job;
  }

  readiness() {
    const availability = getClaudeAvailability(this.cwd, { env: this.env });
    const auth = availability.available
      ? getClaudeAuthStatus(this.cwd, { env: this.env })
      : { available: false, loggedIn: false, detail: availability.detail };
    return {
      ready: Boolean(availability.available && auth.loggedIn),
      availability,
      auth,
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

  assertReady() {
    const receipt = this.readiness();
    if (!receipt.availability.available) {
      throw new Error("Claude Code CLI is unavailable. Install `claude` and ensure it is on PATH.");
    }
    if (!receipt.auth.loggedIn) {
      throw new Error("Claude Code CLI is not authenticated. Run `claude auth login` in the same environment.");
    }
    return receipt;
  }

  list() {
    const ownerRootId = this.assertOwnerRoot();
    const jobs = sortJobsNewestFirst(listJobs(this.cwd));
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
    const owner = listJobs(this.cwd).find((job) =>
      job.id !== excludingJobId &&
      ACTIVE_JOB_STATUSES.has(job.status) &&
      resultSessionId(job) === sessionId
    );
    if (owner) {
      throw new Error(`Claude session ${sessionId} is already owned by active job ${owner.id}.`);
    }
  }

  async start(task, options = {}) {
    const ownerRootId = this.assertOwnerRoot();
    const prompt = String(task ?? "").trim();
    const resumeSessionId = String(options.resumeSessionId ?? "").trim() || null;
    if (!prompt && !resumeSessionId) {
      throw new Error("start requires a task or an explicit Claude session to resume.");
    }
    const profile = normalizeProfileName(options.profile);
    const readiness = this.assertReady();
    const jobId = generateJobId("cc");
    const title = options.title ?? "Claude Code Task";
    const sessionLease = resumeSessionId
      ? reserveSessionLease(
          this.cwd,
          this.env.CLAUDE_CONFIG_DIR,
          resumeSessionId,
          jobId
        )
      : null;
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
      readiness,
      ...(sessionLease ? {
        sessionLease: {
          configIdentity: sessionLease.configIdentity,
          sessionId: sessionLease.sessionId,
        },
      } : {}),
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
      model: options.model ?? null,
        effort: options.effort ?? null,
        permissionMode: options.permissionMode ?? null,
        dangerouslySkipPermissions: Boolean(options.dangerouslySkipPermissions),
        allowedTools: normalizeAllowedTools(options.allowedTools),
        resumeSessionId,
      };
      writeJobFile(this.cwd, jobId, {
        ...base,
        status: "queued",
        phase: "queued",
        acceptingSteering: true,
        workerPid: null,
        workerPidIdentity: null,
        pid: null,
        pidIdentity: null,
        logFile,
        request,
      });
      appendLogLine(logFile, "Queued for background execution.");

      const workerLog = createWorkerLogStdio(logFile);
      try {
        const child = spawn(process.execPath, [CLI_PATH, "worker", "--cwd", this.cwd, "--job-id", jobId], {
          cwd: this.cwd,
          env: this.env,
          detached: true,
          stdio: /** @type {import("node:child_process").StdioOptions} */ (workerLog.stdio),
          windowsHide: true,
        });
        child.once("error", (error) => {
          transitionJob(this.cwd, jobId, ["queued"], "failed", {
            phase: "failed",
            completedAt: nowIso(),
            errorMessage: `Worker launch failed: ${error.message}`,
            workerPid: null,
            workerPidIdentity: null,
            pid: null,
            pidIdentity: null,
          });
        });
        child.unref();
        let workerPidIdentity = null;
        try { workerPidIdentity = getProcessIdentity(child.pid); } catch {}
        transitionJob(this.cwd, jobId, ["queued"], "queued", {
          workerPid: child.pid,
          workerPidIdentity,
        });
      } finally {
        workerLog.close();
      }

      return {
        jobId,
        status: "queued",
        title,
        summary: base.summary,
        profile,
        workspaceRoot: this.cwd,
      };
    } catch (error) {
      if (sessionLease) {
        releaseSessionLease(
          sessionLease.configIdentity,
          sessionLease.sessionId,
          jobId
        );
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
      throw new Error(`Stored Claude job ${id} does not belong to the trusted Codex root.`);
    }
    if (stored.status !== "queued") {
      throw new Error(`Claude job ${id} is ${stored.status}; worker requires queued.`);
    }
    const progress = createProgressReporter({
      logFile: stored.logFile ?? resolveJobLogFile(this.cwd, id),
      onEvent: createJobProgressUpdater(this.cwd, id),
    });
    return runTrackedJob(stored, (onSpawn) => this.execute(stored, progress, onSpawn), {
      logFile: stored.logFile,
    });
  }

  async execute(job, onProgress, onSpawn) {
    const request = job.request ?? {};
    const profile = createExecutionProfile({
      profile: request.profile,
      write: request.write,
      model: request.model,
      effort: request.effort,
      permissionMode: request.permissionMode,
      dangerouslySkipPermissions: request.dangerouslySkipPermissions,
      allowedTools: request.allowedTools,
      env: this.env,
    });
    try {
      const result = await runClaudeTaskSession({
        workspaceRoot: this.cwd,
        jobId: job.id,
        cwd: this.cwd,
        prompt: request.prompt,
        write: Boolean(request.write),
        claudeOptions: {
          ...profile.claudeOptions,
          resumeSessionId: request.resumeSessionId ?? undefined,
        },
        onProgress,
        onSpawn,
      });
      const rawOutput = String(result.finalMessage ?? "");
      const payload = {
        status: result.status,
        sessionId: result.sessionId ?? null,
        rawOutput,
        partialOutput: rawOutput,
        warning: result.warning ?? null,
        failureClass: result.failureClass ?? null,
        failureReason: result.failureReason ?? null,
        resumable: result.resumable === true,
        recoveryAttempts: result.recoveryAttempts ?? 0,
        attempts: result.attempts ?? [],
        steering: result.steering ?? getSteeringSnapshot(this.cwd, job.id),
        runtimeReceipt: {
          ...(result.runtimeReceipt ?? {}),
          executionProfile: profile.receipt,
          environment: this.environmentReceipt,
          workspaceRoot: this.cwd,
          sourceRoot: this.sourceRoot,
          hostClaudeVersion: job.readiness?.availability?.detail ?? null,
        },
        lastByteAt: result.lastByteAt ?? null,
        manualResumeCommand: result.manualResumeCommand ?? null,
        requiresAttention: Boolean(result.requiresAttention),
        toolUses: result.toolUses ?? [],
        touchedFiles: result.touchedFiles ?? [],
      };
      return {
        exitStatus: result.status === "completed" ? 0 : (result.exitCode || 1),
        threadId: result.sessionId ?? null,
        turnId: null,
        payload,
        rendered: renderTaskResult({
          rawOutput,
          failureReason: result.failureReason,
          failureMessage: result.stderr,
        }),
        summary: summaryOf(rawOutput || result.failureReason || job.summary),
      };
    } finally {
      profile.cleanup();
    }
  }

  steer(jobId, message) {
    const job = this.status(jobId);
    if (!ACTIVE_JOB_STATUSES.has(job.status) || job.status === "cancelling" || job.status === "interrupting") {
      throw new Error(`Claude job ${job.id} is ${job.status}; use followUp for a resumable terminal job.`);
    }
    const queued = enqueueSteeringMessage(this.cwd, job.id, message);
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
      resumeSessionId: sessionId,
      parentJobId: source.id,
      title: "Claude Code Follow-up",
    });
  }

  async interrupt(jobId) {
    const job = this.status(jobId);
    const stored = readJobFile(this.cwd, job.id) ?? job;
    const transition = transitionJob(this.cwd, job.id, ["running"], "interrupting", {
      acceptingSteering: false,
      phase: "interrupting",
    });
    if (!transition.transitioned) throw new Error(`Claude job ${job.id} is no longer running.`);

    /** @type {{ interrupted: boolean, note?: string }} */
    let receipt = {
      interrupted: true,
      note: "Supervisor will stop before spawning another Claude attempt.",
    };
    if (stored.pid) {
      if (!stored.pidIdentity) {
        receipt = { interrupted: false, note: "Refusing to signal a process without a PID identity." };
      } else {
        receipt = await interruptClaudeProcess(stored.pid, stored.pidIdentity);
      }
    }
    if (!receipt.interrupted) {
      transitionJob(this.cwd, job.id, ["interrupting"], "running", {
        phase: "interrupt_failed",
        acceptingSteering: true,
      });
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
      note: receipt.note ?? null,
    };
  }

  async cancel(jobId) {
    const job = this.status(jobId);
    if (!new Set(["queued", "running", "interrupting"]).has(job.status)) {
      throw new Error(`Claude job ${job.id} is ${job.status}; only active jobs can be cancelled.`);
    }
    const stored = readJobFile(this.cwd, job.id) ?? job;
    const transition = transitionJob(this.cwd, job.id, ["queued", "running", "interrupting"], "cancelling", {
      acceptingSteering: false,
      phase: "cancelling",
    });
    if (!transition.transitioned) throw new Error(`Claude job ${job.id} left active state.`);
    /** @type {{ cancelled: boolean, note?: string }} */
    let receipt = { cancelled: true, note: "No Claude process to cancel; supervisor stop requested." };
    const controlPid = stored.pid ?? (stored.status === "queued" ? stored.workerPid : null);
    const controlIdentity = stored.pid
      ? stored.pidIdentity
      : stored.workerPidIdentity;
    if (controlPid) {
      receipt = controlIdentity
        ? await cancelClaudeProcess(controlPid, controlIdentity)
        : { cancelled: false, note: "Refusing to cancel a process without a PID identity." };
    }
    const status = receipt.cancelled ? "cancelled" : "running";
    transitionJob(this.cwd, job.id, ["cancelling"], status, {
      ...(receipt.cancelled ? { completedAt: nowIso() } : {}),
      phase: receipt.cancelled ? "cancelled" : "cancel_failed",
      acceptingSteering: false,
      errorMessage: receipt.cancelled ? "Cancelled by user." : `Cancel failed; retry is allowed: ${receipt.note}`,
      ...(receipt.cancelled ? {
        pid: null,
        pidIdentity: null,
        workerPid: null,
        workerPidIdentity: null,
      } : {}),
    });
    cleanupOldJobs(this.cwd);
    return {
      jobId: job.id,
      status,
      cancelFailed: !receipt.cancelled,
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
    const timeoutMs = Math.max(0, Number(options.timeoutMs) || 240_000);
    const pollIntervalMs = Math.max(50, Number(options.pollIntervalMs) || 500);
    const acknowledgeTokens = Array.isArray(options.acknowledgeTokens)
      ? options.acknowledgeTokens
      : [];
    const acknowledgement = acknowledgeTokens.length > 0
      ? acknowledgeCompletionEvents(this.cwd, ownerRootId, acknowledgeTokens)
      : { acknowledgedCount: 0, acknowledgedThrough: null, compactedCount: 0 };
    const deadline = Date.now() + timeoutMs;
    let job = jobId ? this.status(jobId) : null;
    let inbox = readUnreadCompletionEvents(this.cwd, ownerRootId);
    while (
      inbox.events.length === 0 &&
      (!job || ACTIVE_JOB_STATUSES.has(job.status)) &&
      Date.now() < deadline
    ) {
      await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
      job = jobId ? this.status(jobId) : null;
      inbox = readUnreadCompletionEvents(this.cwd, ownerRootId);
    }
    return {
      job,
      completionInbox: inbox,
      acknowledgement,
      waitTimedOut: inbox.events.length === 0 && (!job || ACTIVE_JOB_STATUSES.has(job.status)),
      timeoutMs,
    };
  }
}

export function createInternalClaudeRuntime(options = {}) {
  return new ClaudeRuntime(options);
}

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Canonical Agent orchestration. This module is the only composer allowed to
 * translate stable Agent operations into ephemeral internal Claude jobs.
 */

import fs from "node:fs";
import path from "node:path";

import { createAgentStore } from "./agent-store.mjs";
import { resolveModel } from "./claude-headless-adapter.mjs";
import { validateExecutionProfileOptions } from "./execution-profile.mjs";
import { createInternalClaudeRuntime, preparedStartDisposition } from "./internal-runtime.mjs";
import {
  ACTIVE_JOB_STATUSES,
  enqueueSteeringMessage,
  generateJobId,
  getSteeringSnapshot,
  listJobsForAgentReconciliation,
  markAgentProjectionReconciled,
  readJobFile,
} from "./job-store.mjs";

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "interrupted", "cancelled", "unknown"]);
const TERMINAL_AGENT_STATUSES = new Set(["completed", "interrupted", "errored"]);
const ACTIVATION_RECOVERY_GRACE_MS = 2_000;
const DEFAULT_AGENT_WAIT_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_AGENT_WAIT_TIMEOUT_MS = 60 * 60 * 1_000;
const TASK_NAME_PATTERN = /^[a-z0-9_]+$/;
const CLAUDE_SESSION_MODEL_SCAN_BYTES = 4 * 1024 * 1024;

function assertObject(value, label) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`${label} must be non-empty text.`);
  }
  return value.trim();
}

function optionalText(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

function messageText(messages) {
  return messages.map((message) => message.text).join("\n\n");
}

function resultSessionId(job) {
  return job?.threadId ?? job?.result?.sessionId ?? job?.recoverability?.exactSessionId ?? null;
}

function normalizeAllowedTools(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (value == null) return undefined;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function internalOptions(input, fallback = {}) {
  const requestedModel = input.model ?? fallback.model;
  return {
    write: input.write ?? fallback.write,
    profile: input.execution_profile ?? fallback.profile,
    model: requestedModel,
    effort: input.reasoning_effort ?? fallback.effort,
    permissionMode: input.permission_mode ?? fallback.permissionMode,
    dangerouslySkipPermissions:
      input.dangerously_skip_permissions ?? fallback.dangerouslySkipPermissions,
    allowedTools: normalizeAllowedTools(input.allowed_tools ?? fallback.allowedTools),
  };
}

function validatedInternalOptions(input, fallback = {}) {
  const options = internalOptions(input, fallback);
  const validated = validateExecutionProfileOptions(options);
  return {
    ...options,
    profile: validated.name,
    model: validated.model,
    effort: validated.effort,
    dangerouslySkipPermissions: validated.dangerouslySkipPermissions,
  };
}

function requiredSpawnModel(input) {
  const requested = optionalText(input.model);
  if (!requested) {
    throw new Error(
      "spawn_agent requires an explicit model: sonnet/claude-sonnet-5, opus/claude-opus-5, or test-only haiku/claude-haiku-4-5."
    );
  }
  return requested;
}

function normalizedObservedModel(value) {
  const model = optionalText(value);
  if (!model) return null;
  const stripped = model.replace(/\[[^\]]+\]$/, "");
  return /^claude-haiku-4-5-\d{8}$/.test(stripped)
    ? "claude-haiku-4-5"
    : stripped;
}

function observedModelFromJob(job) {
  return normalizedObservedModel(
    job?.result?.runtimeReceipt?.model ??
    job?.runtimeReceipt?.model ??
    job?.result?.model ??
    job?.model
  );
}

function explicitRequestModel(job) {
  const requested = optionalText(job?.request?.model)?.replace(/\[[^\]]+\]$/, "") ?? null;
  return requested?.startsWith("claude-") ? requested : null;
}

function findClaudeSessionArtifact(claudeConfigDir, sessionId) {
  const target = `${optionalText(sessionId)}.jsonl`;
  const projects = path.join(String(claudeConfigDir ?? ""), "projects");
  if (target === "null.jsonl" || !fs.existsSync(projects)) return null;
  const pending = [projects];
  while (pending.length > 0) {
    const directory = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === target) return candidate;
      if (entry.isDirectory()) pending.push(candidate);
    }
  }
  return null;
}

function claudeSessionArtifactKey(claudeConfigDir, sessionId) {
  return `${String(claudeConfigDir ?? "")}\0${String(sessionId ?? "")}`;
}

function expectedClaudeSessionArtifact(agent) {
  if (!agent.claudeConfigDir || !agent.claudeSessionId || !agent.workspaceRoot) return null;
  const projectDirectory = String(agent.workspaceRoot).replace(/[^a-zA-Z0-9]/g, "-");
  return path.join(
    agent.claudeConfigDir,
    "projects",
    projectDirectory,
    `${agent.claudeSessionId}.jsonl`,
  );
}

function findClaudeSessionArtifacts(agents, jobs) {
  const artifacts = new Map();
  const wantedByProjects = new Map();
  for (const agent of agents) {
    if (agent.selectedModel || !agent.claudeSessionId ||
        agent.continuation?.evidence?.reason === "legacy_agent_model_unsupported") continue;
    const latestJob = jobs.find((job) => job.id === agent.latestJobId) ?? null;
    if (observedModelFromJob(latestJob) || explicitRequestModel(latestJob)) continue;
    const key = claudeSessionArtifactKey(agent.claudeConfigDir, agent.claudeSessionId);
    const directCandidates = [
      agent.continuation?.evidence?.modelArtifactPath,
      expectedClaudeSessionArtifact(agent),
    ].filter(Boolean);
    const directArtifact = directCandidates.find((candidate) => fs.existsSync(candidate));
    if (directArtifact) {
      artifacts.set(key, directArtifact);
      continue;
    }
    if ([
      "legacy_agent_model_pending",
      "legacy_agent_model_unproven",
    ].includes(agent.continuation?.evidence?.reason)) continue;
    const projects = path.join(String(agent.claudeConfigDir ?? ""), "projects");
    const target = `${agent.claudeSessionId}.jsonl`;
    const wanted = wantedByProjects.get(projects) ?? new Map();
    wanted.set(target, claudeSessionArtifactKey(agent.claudeConfigDir, agent.claudeSessionId));
    wantedByProjects.set(projects, wanted);
  }
  for (const [projects, wanted] of wantedByProjects) {
    if (!fs.existsSync(projects)) continue;
    const pending = [projects];
    while (pending.length > 0 && wanted.size > 0) {
      const directory = pending.pop();
      let entries;
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const candidate = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          pending.push(candidate);
          continue;
        }
        const key = wanted.get(entry.name);
        if (entry.isFile() && key) {
          artifacts.set(key, candidate);
          wanted.delete(entry.name);
        }
      }
    }
  }
  return artifacts;
}

function observedModelFromClaudeArtifact(claudeConfigDir, sessionId, artifacts = null) {
  const artifact = artifacts == null
    ? findClaudeSessionArtifact(claudeConfigDir, sessionId)
    : artifacts.get(claudeSessionArtifactKey(claudeConfigDir, sessionId)) ?? null;
  if (!artifact) return null;
  let descriptor;
  try {
    descriptor = fs.openSync(artifact, "r");
    const size = fs.fstatSync(descriptor).size;
    const length = Math.min(size, CLAUDE_SESSION_MODEL_SCAN_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(descriptor, buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split(/\r?\n/);
    if (size > length) lines.shift();
    for (const line of lines.reverse()) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const model = normalizedObservedModel(
          event?.message?.model ?? event?.model ?? event?.data?.model ?? event?.event?.model
        );
        if (model) return model;
      } catch {
        // Ignore malformed or partial JSONL lines while scanning bounded tail evidence.
      }
    }
  } catch {
    return null;
  } finally {
    if (descriptor != null) fs.closeSync(descriptor);
  }
  return null;
}

function canonicalAgentStatus(agent) {
  switch (agent.status) {
    case "pending_init":
    case "running":
    case "interrupted":
      return agent.status;
    case "completed":
      return { completed: null };
    case "errored":
      return { errored: "Claude Agent execution failed." };
    default:
      return { errored: "Claude Agent entered an unknown lifecycle state." };
  }
}

function canonicalFrozenAgentStatus(status) {
  switch (status) {
    case "completed":
      return { completed: null };
    case "interrupted":
      return "interrupted";
    case "errored":
      return { errored: "Claude Agent execution failed." };
    default:
      return { errored: "Claude Agent entered an unknown terminal state." };
  }
}

function publicCompletionUpdate(summary, agents) {
  const agent = agents.find((candidate) => candidate.agentId === summary.agentId);
  return {
    kind: "completion",
    agent_name: agent?.path ?? summary.agentId,
    // Completion delivery is at-least-once. Keep every token's terminal status
    // tied to the frozen inbox fact instead of a later follow-up lifecycle.
    agent_status: canonicalFrozenAgentStatus(summary.agentStatus),
    summary: summary.summary,
    completion_message: summary.completionMessage,
    completion_message_truncated: summary.completionMessageTruncated,
    delivery_token: summary.deliveryToken,
  };
}

function publicProgressUpdate(update, agents) {
  const agent = agents.find((candidate) => candidate.agentId === update.agentId);
  return {
    kind: "progress",
    agent_name: agent?.path ?? update.agentId,
    agent_status: agent ? canonicalAgentStatus(agent) : { errored: "Claude Agent record is unavailable." },
    progress: {
      revision: update.progress.revision,
      activity: update.progress.activity,
      phase: update.progress.phase,
      summary: update.progress.summary,
      updated_at: update.progress.updatedAt,
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPreClaudeActivation(job) {
  return job?.preClaudeLaunch === true;
}

function isTerminalPreClaudeActivation(job) {
  return isPreClaudeActivation(job) && TERMINAL_JOB_STATUSES.has(job?.status);
}

function requeuePreClaudeMailboxMessage(message, jobId) {
  if (
    message.assignedJobId !== jobId ||
    !["assigned", "dispatched"].includes(message.state)
  ) {
    return message;
  }
  // The durable child boundary was never crossed, so any historical dispatch
  // receipt is a pre-launch artifact, not proof that Claude consumed input.
  // Remove it before making the message eligible for the next winning turn.
  const { receipt, ...withoutReceipt } = message;
  return {
    ...withoutReceipt,
    state: "queued",
    assignedJobId: null,
    assignedAt: null,
    deliveryIntent: null,
    dispatchedAt: null,
    acknowledgedAt: null,
  };
}

class AgentRuntime {
  constructor(options = {}) {
    this.jobs = createInternalClaudeRuntime(options);
    this.ownerRootId = this.jobs.assertOwnerRoot();
    this.cwd = this.jobs.cwd;
    this.store = createAgentStore({
      cwd: this.cwd,
      ownerRootId: this.ownerRootId,
      claudeConfigDir: this.jobs.env.CLAUDE_CONFIG_DIR,
    });
  }

  rootJobs() {
    const activeJobIds = new Set(
      this.store.listAgents().map((agent) => agent.activeJobId).filter(Boolean)
    );
    return listJobsForAgentReconciliation(this.cwd, this.ownerRootId)
      .map((job) => this.jobs.migrateMatchingLegacyOwner(job))
      .filter((job) =>
        (typeof job.agentId === "string" && job.agentId) || activeJobIds.has(job.id)
      );
  }

  migrateLegacySelectedModel(agent, jobs, sessionArtifacts = null) {
    if (agent.selectedModel ||
        agent.continuation?.evidence?.reason === "legacy_agent_model_unsupported") return;
    const latestJob = jobs.find((job) => job.id === agent.latestJobId) ?? null;
    const observed = observedModelFromJob(latestJob)
      ?? observedModelFromClaudeArtifact(agent.claudeConfigDir, agent.claudeSessionId, sessionArtifacts);
    const candidate = observed ?? explicitRequestModel(latestJob);
    if (candidate) {
      try {
        const selectedModel = resolveModel(candidate);
        this.store.updateAgent(agent.agentId, (current) => {
          if (current.selectedModel) return current;
          const migrationReason = current.continuation?.evidence?.reason;
          if (!["legacy_agent_model_pending", "legacy_agent_model_unproven"].includes(migrationReason)) {
            return { ...current, selectedModel };
          }
          const priorEvidence = { ...current.continuation.evidence };
          delete priorEvidence.reason;
          delete priorEvidence.modelMigrationBlockedAt;
          delete priorEvidence.modelMigrationDeferredAt;
          return {
            ...current,
            selectedModel,
            continuation: {
              mode: migrationReason === "legacy_agent_model_unproven"
                ? (current.claudeSessionId ? "exact_session" : "none")
                : current.continuation.mode,
              evidence: {
                ...priorEvidence,
                reason: "legacy_agent_model_migrated",
                observedModel: candidate,
                modelMigrationRecoveredAt: new Date().toISOString(),
              },
            },
          };
        });
        return;
      } catch {
        if (agent.continuation.mode === "blocked") return;
        this.store.updateAgent(agent.agentId, (current) => ({
          ...current,
          continuation: {
            mode: "blocked",
            evidence: {
              ...(current.continuation?.evidence ?? {}),
              reason: "legacy_agent_model_unsupported",
              observedModel: candidate,
              modelMigrationBlockedAt: new Date().toISOString(),
            },
          },
        }));
        return;
      }
    }
    if (agent.activeJobId || !TERMINAL_AGENT_STATUSES.has(agent.status)) {
      if (agent.continuation?.evidence?.reason === "legacy_agent_model_pending") return;
      const modelArtifactPath = sessionArtifacts?.get(
        claudeSessionArtifactKey(agent.claudeConfigDir, agent.claudeSessionId),
      ) ?? expectedClaudeSessionArtifact(agent);
      this.store.updateAgent(agent.agentId, (current) => ({
        ...current,
        continuation: {
          ...current.continuation,
          evidence: {
            ...(current.continuation?.evidence ?? {}),
            reason: "legacy_agent_model_pending",
            modelMigrationDeferredAt: new Date().toISOString(),
            ...(modelArtifactPath ? { modelArtifactPath } : {}),
          },
        },
      }));
      return;
    }
    if (agent.continuation?.evidence?.reason === "legacy_agent_model_unproven") return;
    if (!agent.claudeSessionId || agent.continuation.mode === "blocked") return;
    const modelArtifactPath = sessionArtifacts?.get(
      claudeSessionArtifactKey(agent.claudeConfigDir, agent.claudeSessionId),
    ) ?? expectedClaudeSessionArtifact(agent);
    this.store.updateAgent(agent.agentId, (current) => ({
      ...current,
      continuation: {
        mode: "blocked",
        evidence: {
          ...(current.continuation?.evidence ?? {}),
          reason: "legacy_agent_model_unproven",
          modelMigrationBlockedAt: new Date().toISOString(),
          ...(modelArtifactPath && fs.existsSync(modelArtifactPath) ? { modelArtifactPath } : {}),
        },
      },
    }));
  }

  recoverMissingActivation(agent, jobs, now = Date.now(), options = {}) {
    const jobId = agent.activeJobId;
    const evidence = agent.continuation?.evidence ?? {};
    const terminatedPreparedJob = options.terminatedPreparedJobId === jobId;
    if (!jobId || (!terminatedPreparedJob && jobs.some((job) => job.id === jobId))) return false;
    if (evidence.activationJobId !== jobId) return false;
    if (!["initial", "followup"].includes(evidence.activationKind)) return false;

    const reservedAt = Date.parse(evidence.activationReservedAt ?? agent.updatedAt ?? "");
    if (!terminatedPreparedJob &&
      (!Number.isFinite(reservedAt) || now - reservedAt < ACTIVATION_RECOVERY_GRACE_MS)) return false;

    const recoveryReason = terminatedPreparedJob
      ? "activation_prepared_job_terminated_before_attach"
      : "activation_missing_job_after_grace";

    const initial = evidence.activationKind === "initial";
    if (initial && agent.latestJobId == null && !agent.claudeSessionId) {
      try {
        this.store.updateAgent(agent.agentId, (current) => ({
          ...current,
          activeJobId: current.activeJobId === jobId ? null : current.activeJobId,
          status: "pending_init",
          continuation: {
            mode: "safe_fresh",
            evidence: {
              reason: initial && terminatedPreparedJob
                ? "initial_activation_prepared_job_terminated_before_attach"
                : "initial_activation_missing_job_after_grace",
              activationJobId: jobId,
              recoveredAt: new Date(now).toISOString(),
            },
          },
          mailbox: {
            ...current.mailbox,
            messages: current.mailbox.messages.map((message) =>
              requeuePreClaudeMailboxMessage(message, jobId)
            ),
          },
        }));
        // Do not request a destructive rollback. The store atomically keeps a
        // pending-init Agent whenever a sender raced this recovery, while an
        // empty never-launched Agent is still reclaimed.
        this.store.rollbackReservation(agent.agentId);
        return true;
      } catch {
        return false;
      }
    }

    const priorStatus = TERMINAL_AGENT_STATUSES.has(evidence.activationPreviousStatus)
      ? evidence.activationPreviousStatus
      : agent.continuation?.mode === "exact_session"
        ? "completed"
        : "errored";
    try {
      this.store.updateAgent(agent.agentId, (current) => ({
        ...current,
        activeJobId: current.activeJobId === jobId ? null : current.activeJobId,
        status: priorStatus,
        continuation: {
          ...current.continuation,
          evidence: {
            ...current.continuation.evidence,
            reason: recoveryReason,
            activationRecoveryJobId: jobId,
            activationRecoveredAt: new Date(now).toISOString(),
          },
        },
        mailbox: {
          ...current.mailbox,
          messages: current.mailbox.messages.map((message) =>
            terminatedPreparedJob
              ? requeuePreClaudeMailboxMessage(message, jobId)
              : message.state === "assigned" && message.assignedJobId === jobId
                ? {
                    ...message,
                    state: "queued",
                    assignedJobId: null,
                    assignedAt: null,
                    deliveryIntent: null,
                  }
                : message
          ),
        },
      }));
      return true;
    } catch {
      return false;
    }
  }

  acknowledgeMailboxFromJob(agent, job) {
    const steering = getSteeringSnapshot(this.cwd, job.id);
    for (const message of this.store.listMessages(agent.agentId)) {
      if (message.assignedJobId !== job.id || message.state !== "dispatched") continue;
      const receipt = message.receipt ?? {};
      const initialPrompt = receipt.delivery === "initial_prompt";
      const steeringSequence = Number(receipt.steeringSequence ?? 0);
      if (
        (initialPrompt && TERMINAL_JOB_STATUSES.has(job.status)) ||
        (steeringSequence > 0 && steering.latestAcknowledgedSequence >= steeringSequence)
      ) {
        this.store.acknowledgeMessage(agent.agentId, message.messageId, {
          jobId: job.id,
          receipt: {
            delivery: initialPrompt ? "terminal_initial_prompt" : "stream_acknowledged",
            steeringSequence: steeringSequence || null,
          },
        });
      }
    }
  }

  requeueAssignedMessage(agentId, messageId, jobId) {
    this.store.updateAgent(agentId, (agent) => ({
      ...agent,
      mailbox: {
        ...agent.mailbox,
        messages: agent.mailbox.messages.map((message) =>
          message.messageId === messageId &&
          message.state === "assigned" &&
          message.assignedJobId === jobId
            ? {
                ...message,
                state: "queued",
                assignedJobId: null,
                assignedAt: null,
                deliveryIntent: null,
              }
            : message
        ),
      },
    }));
  }

  reconcile() {
    // Grace is evaluated at the beginning of this pass.  Scanning a large
    // retained receipt set can itself take longer than the grace window, and
    // must not turn a healthy just-reserved activation into a false orphan.
    const reconciliationStartedAt = Date.now();
    const jobs = this.rootJobs();
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const diagnosticReceipts = [];
    const agentsByActiveJob = new Map(
      this.store.listAgents()
        .filter((agent) => agent.activeJobId)
        .map((agent) => [agent.activeJobId, agent])
    );
    for (const job of jobs) {
      if (!isTerminalPreClaudeActivation(job) || job.agentProjectionReconciledAt) continue;
      const target = job.agentId ?? agentsByActiveJob.get(job.id)?.agentId ?? null;
      if (!target) continue;
      try {
        const recovery = this.store.recoverPreClaudeActivation(target, job.id);
        if (!recovery.recovered) {
          diagnosticReceipts.push({
            jobId: job.id,
            reconciled: false,
            reason: recovery.reason ?? "pre_claude_recovery_deferred",
          });
          continue;
        }
        markAgentProjectionReconciled(this.cwd, job.id);
        diagnosticReceipts.push({
          jobId: job.id,
          reconciled: true,
          reason: "pre_claude_activation_recovered",
          agent: recovery.agent,
        });
      } catch (error) {
        diagnosticReceipts.push({
          jobId: job.id,
          reconciled: false,
          reason: "pre_claude_recovery_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const ordinaryJobs = jobs.filter((job) => !isTerminalPreClaudeActivation(job));
    const ordinaryReceipts = this.store.reconcileFromJobs(ordinaryJobs);
    const receipts = [...diagnosticReceipts, ...ordinaryReceipts];
    for (const receipt of ordinaryReceipts) {
      if (!receipt.jobId) continue;
      const projectionMarkerMissing = !jobsById.get(receipt.jobId)?.agentProjectionReconciledAt;
      if (!receipt.reconciled && !(receipt.reason === "already_finalized" && projectionMarkerMissing)) {
        continue;
      }
      try {
        markAgentProjectionReconciled(this.cwd, receipt.jobId);
      } catch {
        // The Agent projection is already durable. A later cleanup/reconcile
        // pass may record the missing pruning marker if this job still exists.
      }
    }
    const agentsBeforeMigration = this.store.listAgents();
    const sessionArtifacts = findClaudeSessionArtifacts(agentsBeforeMigration, jobs);
    for (const agent of agentsBeforeMigration) {
      this.migrateLegacySelectedModel(agent, jobs, sessionArtifacts);
    }
    for (const agent of this.store.listAgents()) {
      const jobId = agent.activeJobId ?? agent.latestJobId;
      const job = jobId ? jobs.find((candidate) => candidate.id === jobId) : null;
      if (!job) {
        this.recoverMissingActivation(agent, jobs, reconciliationStartedAt);
        continue;
      }
      if (isTerminalPreClaudeActivation(job)) {
        // Dedicated recovery runs before generic projection. If it could not
        // complete, retain the receipt and make no session, mailbox, or
        // completion mutation in this pass.
        continue;
      }
      const sessionId = resultSessionId(job);
      if (sessionId && !agent.claudeSessionId && ACTIVE_JOB_STATUSES.has(job.status)) {
        try {
          this.store.bindSession(agent.agentId, sessionId, {
            jobId: job.id,
            claudeConfigDir: this.jobs.env.CLAUDE_CONFIG_DIR,
          });
        } catch {
          // The Agent store persists drift/binding evidence. Reconciliation
          // continues so completion delivery remains available.
        }
      }
      if (TERMINAL_JOB_STATUSES.has(job.status)) {
        for (const message of this.store.listMessages(agent.agentId, { state: "assigned" })) {
          if (message.assignedJobId === job.id) {
            // Follow-up messages are atomically marked as an initial prompt
            // before their job record becomes visible. A crash before the
            // normal post-start acknowledgement must not requeue and replay a
            // prompt that the terminal job already consumed.
            if (message.deliveryIntent === "initial_prompt") {
              this.store.markMessageDispatched(agent.agentId, message.messageId, {
                jobId: job.id,
                receipt: { delivery: "initial_prompt" },
              });
            } else {
              this.requeueAssignedMessage(agent.agentId, message.messageId, job.id);
            }
          }
        }
      } else if (ACTIVE_JOB_STATUSES.has(job.status) && job.status !== "interrupting") {
        for (const message of this.store.listMessages(agent.agentId, { state: "assigned" })) {
          if (message.assignedJobId === job.id) this.deliverAssignedMessage(agent, message);
        }
      }
      this.acknowledgeMailboxFromJob(agent, job);
    }
    return receipts;
  }

  rollbackActivation(agentId, jobId, previous, {
    initial = false,
    removableMessageId = null,
  } = {}) {
    try {
      this.store.updateAgent(agentId, (agent) => ({
        ...agent,
        activeJobId: agent.activeJobId === jobId ? null : agent.activeJobId,
        status: previous.status,
        continuation: previous.continuation,
        mailbox: {
          ...agent.mailbox,
          messages: agent.mailbox.messages.map((message) =>
            initial
              ? requeuePreClaudeMailboxMessage(message, jobId)
              : message.assignedJobId === jobId && message.state === "assigned"
              ? {
                  ...message,
                  state: "queued",
                  assignedJobId: null,
                  assignedAt: null,
                  deliveryIntent: null,
                }
              : message
          ),
        },
      }));
      // An initial activation that failed before its turn was established may
      // have received sender messages. Let the store delete only an empty
      // pending-init record; queued messages are the durable reason to keep it.
      if (initial) this.store.rollbackReservation(agentId, { removableMessageId });
    } catch {
      // A durable job may already exist. Later reconciliation is authoritative.
    }
  }

  async spawnAgent(inputValue) {
    const input = assertObject(inputValue, "spawn_agent input");
    for (const key of ["agent_type", "service_tier", "session_id", "claude_session_id", "resume_session_id"]) {
      if (input[key] != null) throw new Error(`spawn_agent does not support ${key}.`);
    }
    const taskName = assertText(input.task_name, "spawn_agent task_name");
    if (!TASK_NAME_PATTERN.test(taskName)) {
      throw new Error("spawn_agent task_name must match [a-z0-9_]+.");
    }
    const message = assertText(input.message, "spawn_agent message");
    if (input.fork_turns !== "none") {
      throw new Error(
        "spawn_agent requires fork_turns=none; Codex context inheritance cannot be reproduced as a native Claude session."
      );
    }
    // Validate the caller-owned model decision before readiness checks or any
    // durable Agent reservation. There is no implicit or fallback model.
    const requestedModel = requiredSpawnModel(input);
    const executionOptions = validatedInternalOptions({ ...input, model: requestedModel });
    const model = executionOptions.model;

    this.reconcile();
    // CLI availability/auth can each take seconds. Do not create a durable
    // active Agent reservation until that external preflight has succeeded.
    const readinessReceipt = this.jobs.assertReady();
    const agent = this.store.createAgent({
      task_name: taskName,
      description: input.description,
      selectedModel: model,
      initialMessage: message,
    });
    const initialMessage = this.store.listMessages(agent.agentId)[0];
    const jobId = generateJobId("cc-agent");
    let prepared;
    try {
      prepared = this.jobs.prepareStart(message, {
        ...executionOptions,
        readinessReceipt,
        jobId,
        agentId: agent.agentId,
        sessionName: agent.name,
        title: `Claude Agent ${agent.name}`,
      });
    } catch (error) {
      // A sender may have reached this newly-created Agent while local job
      // preparation was failing. The store removes only an empty reservation.
      this.store.rollbackReservation(agent.agentId, {
        removableMessageId: initialMessage?.messageId,
      });
      throw error;
    }
    const activation = this.store.reserveActivation(agent.agentId, jobId, { initial: true });
    if (!activation.reserved) {
      this.jobs.abortPreparedStart(prepared);
      this.store.rollbackReservation(agent.agentId, {
        removableMessageId: initialMessage?.messageId,
      });
      throw new Error(`Unable to activate ${agent.path}: ${activation.reason}.`);
    }
    let launchAttempted = false;
    try {
      const attached = this.jobs.attachPreparedStart(prepared, agent.agentId);
      launchAttempted = true;
      const assigned = activation.assignedMessages;
      const turn = await this.jobs.launchPreparedStart(attached, messageText(assigned));
      this.markInitialPromptMessages(agent.agentId, jobId, assigned);
      return {
        agent: this.store.resolveTarget(agent.agentId),
        turn,
        topology: "flat",
        residency: "ephemeral_turn",
      };
    } catch (error) {
      const handoffDisposition = launchAttempted
        ? preparedStartDisposition(error)
        : "rollback_safe";
      if (handoffDisposition === "rollback_safe") {
        this.jobs.abortPreparedStart(prepared, { handoffDisposition });
        this.rollbackActivation(agent.agentId, jobId, agent, {
          initial: true,
          removableMessageId: initialMessage?.messageId,
        });
      }
      throw error;
    }
  }

  deliverAssignedMessage(agent, mailboxMessage) {
    const activeJobId = mailboxMessage.assignedJobId ?? agent.activeJobId;
    if (!activeJobId) return { delivered: false, reason: "queued_no_turn" };
    const activeJob = readJobFile(this.cwd, activeJobId);
    if (!activeJob) {
      return { delivered: false, reason: "activation_pending", jobId: activeJobId };
    }
    if (!ACTIVE_JOB_STATUSES.has(activeJob.status) || activeJob.status === "interrupting") {
      this.requeueAssignedMessage(agent.agentId, mailboxMessage.messageId, activeJobId);
      return { delivered: false, reason: "queued_no_turn" };
    }
    if (isPreClaudeActivation(activeJob)) {
      return { delivered: false, reason: "activation_pending", jobId: activeJobId };
    }
    if (mailboxMessage.deliveryIntent === "initial_prompt") {
      return { delivered: false, reason: "initial_prompt", jobId: activeJobId };
    }
    let steering;
    try {
      steering = enqueueSteeringMessage(this.cwd, activeJobId, mailboxMessage.text, {
        kind: "agent_message",
        messageId: mailboxMessage.messageId,
      });
    } catch {
      this.requeueAssignedMessage(agent.agentId, mailboxMessage.messageId, activeJobId);
      return { delivered: false, reason: "queued_no_turn" };
    }
    this.store.markMessageDispatched(agent.agentId, mailboxMessage.messageId, {
      jobId: activeJobId,
      receipt: { delivery: "durable_stream_input", steeringSequence: steering.sequence },
    });
    return { delivered: true, jobId: activeJobId, steeringSequence: steering.sequence };
  }

  sendMessage(inputValue) {
    const input = assertObject(inputValue, "send_message input");
    this.reconcile();
    const agent = this.store.resolveTarget(assertText(input.target, "send_message target"));
    if (agent.continuation.mode === "blocked") {
      throw new Error(`Agent ${agent.path} cannot accept messages: ${agent.continuation.evidence?.reason ?? "blocked"}.`);
    }
    const queued = this.store.enqueueMessage(agent.agentId, assertText(input.message, "send_message message"), {
      kind: "send_message",
    });
    const delivery = queued.delivery === "assigned_active"
      ? this.deliverAssignedMessage(queued.agent, queued.message)
      : { delivered: false, reason: "queued_no_turn" };
    return {
      agent: this.store.resolveTarget(agent.agentId),
      message: queued.message,
      delivery: delivery.delivered
        ? "dispatched_active"
        : delivery.reason === "activation_pending"
          ? "activation_pending"
          : "queued_no_turn",
      turn: delivery.delivered || delivery.reason === "activation_pending"
        ? {
            jobId: delivery.jobId,
            steeringSequence: delivery.delivered ? delivery.steeringSequence : null,
          }
        : null,
    };
  }

  async waitForAssignedDelivery(agent, mailboxMessage, timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs;
    let delivery = this.deliverAssignedMessage(agent, mailboxMessage);
    while (!delivery.delivered && delivery.reason === "activation_pending" && Date.now() < deadline) {
      await sleep(Math.min(25, Math.max(0, deadline - Date.now())));
      delivery = this.deliverAssignedMessage(this.store.resolveTarget(agent.agentId), mailboxMessage);
    }
    return delivery;
  }

  markInitialPromptMessages(agentId, jobId, messages) {
    let marked = 0;
    for (const message of messages) {
      try {
        const receipt = this.store.markMessageDispatched(agentId, message.messageId, {
          jobId,
          receipt: { delivery: "initial_prompt" },
        });
        if (receipt.changed || receipt.message?.state === "dispatched") marked += 1;
      } catch {
        // Once the detached worker is launched, its durable job receipt owns
        // recovery. Leaving an entry assigned with initial_prompt intent is
        // safe: active delivery will not steer it, and terminal reconciliation
        // will finish its dispatch/acknowledgement projection.
      }
    }
    return marked;
  }

  async followupTask(inputValue) {
    const input = assertObject(inputValue, "followup_task input");
    if (input.model != null) {
      throw new Error("followup_task inherits the Agent's selected model and does not accept a model override.");
    }
    // Resolve and validate against a read-only snapshot before reconciliation:
    // invalid caller options must not repair an unrelated terminal receipt,
    // publish completion, or otherwise mutate durable state before rejection.
    let agent = this.store.resolveTarget(assertText(input.target, "followup_task target"));
    if (agent.continuation.mode === "blocked") {
      throw new Error(`Agent ${agent.path} cannot continue: ${agent.continuation.evidence?.reason ?? "blocked"}.`);
    }
    const validationJobId = agent.activeJobId ?? agent.latestJobId;
    const validationLatestJob = validationJobId
      ? readJobFile(this.cwd, validationJobId)
      : null;
    // Validate before enqueueing even if the current active turn may win a
    // delivery race: should that turn become terminal during delivery, this
    // same call is allowed to activate the queued message and must not leave
    // invalid execution options behind as durable mailbox state.
    const executionOptions = validatedInternalOptions(input, {
      ...(validationLatestJob?.request ?? {}),
      model: validationLatestJob?.request?.model ?? agent.selectedModel,
    });
    this.reconcile();
    agent = this.store.resolveTarget(agent.agentId);
    if (agent.continuation.mode === "blocked") {
      throw new Error(`Agent ${agent.path} cannot continue: ${agent.continuation.evidence?.reason ?? "blocked"}.`);
    }
    const queued = this.store.enqueueMessage(
      agent.agentId,
      assertText(input.message, "followup_task message"),
      { kind: "followup_task" }
    );
    agent = queued.agent;
    if (agent.activeJobId) {
      const delivery = await this.waitForAssignedDelivery(agent, queued.message);
      if (delivery.delivered) {
        return {
          agent: this.store.resolveTarget(agent.agentId),
          activated: false,
          delivery: "dispatched_active",
          turn: { jobId: delivery.jobId, steeringSequence: delivery.steeringSequence },
        };
      }
      if (delivery.reason === "activation_pending") {
        return {
          agent: this.store.resolveTarget(agent.agentId),
          activated: false,
          delivery: "activation_pending",
          turn: { jobId: delivery.jobId, steeringSequence: null },
        };
      }
      if (delivery.reason === "initial_prompt") {
        return {
          agent: this.store.resolveTarget(agent.agentId),
          activated: false,
          delivery: "already_active_initial_prompt",
          turn: { jobId: delivery.jobId, steeringSequence: null },
        };
      }
      this.reconcile();
      agent = this.store.resolveTarget(agent.agentId);
    }
    // Keep slow Claude CLI/auth preflight outside the active-reservation
    // interval. A concurrent follow-up then sees an idle Agent until a winner
    // is genuinely ready to publish its local job receipt.
    const readinessReceipt = this.jobs.assertReady();
    const jobId = generateJobId("cc-agent");
    const previous = agent;
    const latestJob = validationLatestJob;
    const resumeSessionId = agent.continuation.mode === "exact_session"
      ? agent.claudeSessionId
      : null;
    const initialActivation = agent.status === "pending_init" &&
      agent.latestJobId == null &&
      !agent.claudeSessionId;
    // This provisional prompt is replaced with the atomically assigned
    // mailbox batch immediately before the worker starts. It lets us publish
    // an unbound launch fact before an Agent becomes active.
    const prepared = this.jobs.prepareStart(
      assertText(input.message, "followup_task message"),
      {
        ...executionOptions,
        readinessReceipt,
        jobId,
        agentId: agent.agentId,
        resumeSessionId,
        parentJobId: agent.latestJobId,
        sessionName: agent.name,
        title: initialActivation
          ? `Claude Agent ${agent.name} initial activation`
          : `Claude Agent ${agent.name} follow-up`,
      }
    );
    let activation = this.store.reserveActivation(agent.agentId, jobId, {
      initial: initialActivation,
    });
    if (!activation.reserved && activation.reason === "already_active") {
      this.jobs.abortPreparedStart(prepared);
      const latest = this.store.resolveTarget(agent.agentId);
      const assigned = this.store.assignQueuedMessages(agent.agentId, latest.activeJobId);
      const message = assigned.assignedMessages.find((candidate) => candidate.messageId === queued.message.messageId)
        ?? this.store.listMessages(agent.agentId).find((candidate) =>
          candidate.messageId === queued.message.messageId &&
          candidate.assignedJobId === latest.activeJobId
        );
      if (message?.deliveryIntent === "initial_prompt") {
        return {
          agent: this.store.resolveTarget(agent.agentId),
          activated: false,
          delivery: "already_active_initial_prompt",
          turn: { jobId: latest.activeJobId, steeringSequence: null },
        };
      }
      if (message?.state === "dispatched" || message?.state === "acknowledged") {
        return {
          agent: this.store.resolveTarget(agent.agentId),
          activated: false,
          delivery: "already_active_dispatched",
          turn: {
            jobId: latest.activeJobId,
            steeringSequence: message.receipt?.steeringSequence ?? null,
          },
        };
      }
      const delivery = message
        ? await this.waitForAssignedDelivery(latest, message)
        : { delivered: false };
      if (delivery.delivered) {
        return {
          agent: this.store.resolveTarget(agent.agentId),
          activated: false,
          delivery: "dispatched_active",
          turn: { jobId: delivery.jobId, steeringSequence: delivery.steeringSequence },
        };
      }
      if (delivery.reason === "activation_pending") {
        return {
          agent: this.store.resolveTarget(agent.agentId),
          activated: false,
          delivery: "activation_pending",
          turn: { jobId: delivery.jobId, steeringSequence: null },
        };
      }
      throw new Error(`Agent ${agent.path} became active but its message could not be delivered.`);
    }
    if (!activation.reserved) {
      this.jobs.abortPreparedStart(prepared);
      throw new Error(`Unable to activate ${agent.path}: ${activation.reason}.`);
    }

    const assigned = activation.assignedMessages;
    const prompt = messageText(assigned);
    let launchAttempted = false;
    try {
      const attached = this.jobs.attachPreparedStart(prepared, agent.agentId);
      launchAttempted = true;
      const turn = await this.jobs.launchPreparedStart(attached, prompt);
      this.markInitialPromptMessages(agent.agentId, jobId, assigned);
      return {
        agent: this.store.resolveTarget(agent.agentId),
        activated: true,
        delivery: "new_turn",
        turn,
        assignedMessageIds: assigned.map((message) => message.messageId),
      };
    } catch (error) {
      const handoffDisposition = launchAttempted
        ? preparedStartDisposition(error)
        : "rollback_safe";
      if (handoffDisposition === "rollback_safe") {
        this.jobs.abortPreparedStart(prepared, { handoffDisposition });
        this.rollbackActivation(agent.agentId, jobId, previous, { initial: initialActivation });
      }
      throw error;
    }
  }

  async waitAgent(inputValue = {}) {
    const input = assertObject(inputValue, "wait_agent input");
    const timeout = input.timeout_ms == null
      ? DEFAULT_AGENT_WAIT_TIMEOUT_MS
      : Number(input.timeout_ms);
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > MAX_AGENT_WAIT_TIMEOUT_MS) {
      throw new Error("wait_agent timeout_ms must be between 0 and 3600000 milliseconds.");
    }
    const acknowledgeTokens = Array.isArray(input.acknowledge_tokens)
      ? input.acknowledge_tokens
      : [];
    // Correct any recoverable terminal fact before the completion payload is
    // first exposed and frozen under its delivery token.
    this.reconcile();
    // Refresh the light Agent registry on every poll so a root-wide wait can
    // observe progress from a turn started after the wait began.
    const progressJobIds = () => this.store.listAgents()
      .map((agent) => agent.activeJobId)
      .filter(Boolean);
    const waited = await this.jobs.wait(null, {
      timeoutMs: timeout,
      acknowledgeTokens,
      progressJobIds,
    });
    this.reconcile();
    const agents = this.store.listAgents();
    const receipt = {
      message: waited.message,
      timedOut: waited.waitTimedOut,
    };
    if (waited.update) {
      receipt.update = waited.update.kind === "progress"
        ? publicProgressUpdate(waited.update, agents)
        : publicCompletionUpdate(waited.update, agents);
    }
    return receipt;
  }

  async interruptAgent(inputValue) {
    const input = assertObject(inputValue, "interrupt_agent input");
    this.reconcile();
    const agent = this.store.resolveTarget(assertText(input.target, "interrupt_agent target"));
    if (!agent.activeJobId) {
      return { agent, interrupted: false, status: "no_active_turn", turn: null };
    }
    const turn = await this.jobs.interrupt(agent.activeJobId);
    const reconciliation = this.reconcile();
    return {
      agent: this.store.resolveTarget(agent.agentId),
      interrupted: turn.interrupted,
      status: turn.status,
      turn,
      reconciliation,
    };
  }

  listAgents(inputValue = {}) {
    const input = assertObject(inputValue, "list_agents input");
    if (input.all != null) throw new Error("list_agents does not expose cross-root all.");
    this.reconcile();
    const agents = this.store.listAgents({ pathPrefix: optionalText(input.path_prefix) }).map((agent) => ({
      agent_name: agent.path,
      agent_status: canonicalAgentStatus(agent),
    }));
    return {
      agents,
    };
  }
}

export function createAgentRuntime(options = {}) {
  return new AgentRuntime(options);
}

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Canonical Agent orchestration. This module is the only composer allowed to
 * translate stable Agent operations into ephemeral internal Claude jobs.
 */

import { createAgentStore } from "./agent-store.mjs";
import { resolveModel } from "./claude-headless-adapter.mjs";
import { readUnreadCompletionEvents } from "./completion-inbox.mjs";
import { createInternalClaudeRuntime } from "./internal-runtime.mjs";
import {
  ACTIVE_JOB_STATUSES,
  enqueueSteeringMessage,
  generateJobId,
  getSteeringSnapshot,
  listJobsForAgentReconciliation,
  patchJob,
  readJobFile,
} from "./job-store.mjs";

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "interrupted", "cancelled", "unknown"]);
const TERMINAL_AGENT_STATUSES = new Set(["completed", "interrupted", "errored"]);
const ACTIVATION_RECOVERY_GRACE_MS = 2_000;
const TASK_NAME_PATTERN = /^[a-z0-9_]+$/;

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
    model: requestedModel ? resolveModel(requestedModel) : requestedModel,
    effort: input.reasoning_effort ?? fallback.effort,
    permissionMode: input.permission_mode ?? fallback.permissionMode,
    dangerouslySkipPermissions:
      input.dangerously_skip_permissions ?? fallback.dangerouslySkipPermissions,
    allowedTools: normalizeAllowedTools(input.allowed_tools ?? fallback.allowedTools),
  };
}

function publicCompletionForAgent(event, agentId) {
  return event.agentId === agentId;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnattachedPreClaudeActivation(job) {
  return job?.activationPrepared === true &&
    job.activationAttached !== true &&
    job.preClaudeLaunch === true;
}

function isTerminalUnboundPreparedActivation(job, jobId) {
  return job?.id === jobId &&
    isUnattachedPreClaudeActivation(job) &&
    !job.agentId &&
    TERMINAL_JOB_STATUSES.has(job.status);
}

function requeueUnboundPreClaudeMailboxMessage(message, jobId) {
  if (
    message.assignedJobId !== jobId ||
    !["assigned", "dispatched"].includes(message.state)
  ) {
    return message;
  }
  // This job never attached to the Agent, so any historical dispatch receipt
  // is an unsafe pre-launch artifact, not proof that Claude consumed input.
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
    return listJobsForAgentReconciliation(this.cwd).filter((job) =>
      job.ownerRootId === this.ownerRootId &&
      ((typeof job.agentId === "string" && job.agentId) || activeJobIds.has(job.id))
    );
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
              requeueUnboundPreClaudeMailboxMessage(message, jobId)
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
              ? requeueUnboundPreClaudeMailboxMessage(message, jobId)
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
    const receipts = this.store.reconcileFromJobs(jobs);
    for (const receipt of receipts) {
      if (!receipt.jobId || !(receipt.reconciled || receipt.reason === "already_finalized")) continue;
      try {
        patchJob(this.cwd, receipt.jobId, {
          agentProjectionReconciledAt: new Date().toISOString(),
        });
      } catch {
        // The Agent projection is already durable. A later cleanup/reconcile
        // pass may refresh the pruning marker if this job still exists.
      }
    }
    for (const agent of this.store.listAgents()) {
      const jobId = agent.activeJobId ?? agent.latestJobId;
      const job = jobId ? jobs.find((candidate) => candidate.id === jobId) : null;
      if (!job) {
        this.recoverMissingActivation(agent, jobs, reconciliationStartedAt);
        continue;
      }
      if (isTerminalUnboundPreparedActivation(job, agent.activeJobId)) {
        // A prepared fact is deliberately unbound until after activation wins.
        // If its launcher dies before attach, it proves that no Claude turn
        // exists to project. Roll back only the Agent reservation; do not
        // let this generic terminal diagnostic finalize the Agent.
        this.recoverMissingActivation(agent, jobs, reconciliationStartedAt, {
          terminatedPreparedJobId: job.id,
        });
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

  rollbackActivation(agentId, jobId, previous, { initial = false } = {}) {
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
              ? requeueUnboundPreClaudeMailboxMessage(message, jobId)
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
      if (initial) this.store.rollbackReservation(agentId);
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

    this.reconcile();
    // CLI availability/auth can each take seconds. Do not create a durable
    // active Agent reservation until that external preflight has succeeded.
    const readinessReceipt = this.jobs.assertReady();
    const agent = this.store.createAgent({ task_name: taskName, description: input.description });
    const jobId = generateJobId("cc-agent");
    let prepared;
    try {
      prepared = this.jobs.prepareStart(message, {
        ...internalOptions(input),
        readinessReceipt,
        jobId,
        agentId: agent.agentId,
        sessionName: agent.name,
        title: `Claude Agent ${agent.name}`,
      });
    } catch (error) {
      // A sender may have reached this newly-created Agent while local job
      // preparation was failing. The store removes only an empty reservation.
      this.store.rollbackReservation(agent.agentId);
      throw error;
    }
    const activation = this.store.reserveActivation(agent.agentId, jobId, { initial: true });
    if (!activation.reserved) {
      this.jobs.abortPreparedStart(prepared);
      this.store.rollbackReservation(agent.agentId);
      throw new Error(`Unable to activate ${agent.path}: ${activation.reason}.`);
    }
    try {
      const attached = this.jobs.attachPreparedStart(prepared, agent.agentId);
      const turn = await this.jobs.launchPreparedStart(attached, message);
      return {
        agent: this.store.resolveTarget(agent.agentId),
        turn,
        topology: "flat",
        residency: "ephemeral_turn",
      };
    } catch (error) {
      this.jobs.abortPreparedStart(prepared);
      this.rollbackActivation(agent.agentId, jobId, agent, { initial: true });
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
    if (isUnattachedPreClaudeActivation(activeJob)) {
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
    for (const message of messages) {
      this.store.markMessageDispatched(agentId, message.messageId, {
        jobId,
        receipt: { delivery: "initial_prompt" },
      });
    }
  }

  async followupTask(inputValue) {
    const input = assertObject(inputValue, "followup_task input");
    this.reconcile();
    let agent = this.store.resolveTarget(assertText(input.target, "followup_task target"));
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

    if (agent.continuation.mode === "blocked") {
      throw new Error(`Agent ${agent.path} cannot continue: ${agent.continuation.evidence?.reason ?? "blocked"}.`);
    }
    // Keep slow Claude CLI/auth preflight outside the active-reservation
    // interval. A concurrent follow-up then sees an idle Agent until a winner
    // is genuinely ready to publish its local job receipt.
    const readinessReceipt = this.jobs.assertReady();
    const jobId = generateJobId("cc-agent");
    const previous = agent;
    const latestJob = agent.latestJobId
      ? readJobFile(this.cwd, agent.latestJobId)
      : null;
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
        ...internalOptions(input, latestJob?.request ?? {}),
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
    try {
      const attached = this.jobs.attachPreparedStart(prepared, agent.agentId);
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
      this.jobs.abortPreparedStart(prepared);
      this.rollbackActivation(agent.agentId, jobId, previous, { initial: initialActivation });
      throw error;
    }
  }

  async waitAgent(inputValue = {}) {
    const input = assertObject(inputValue, "wait_agent input");
    const timeout = input.timeout_ms == null ? 240_000 : Number(input.timeout_ms);
    if (!Number.isFinite(timeout) || timeout < 0) throw new Error("wait_agent timeout_ms must be non-negative.");
    const acknowledgeTokens = Array.isArray(input.acknowledge_tokens)
      ? input.acknowledge_tokens
      : [];
    const waited = await this.jobs.wait(null, {
      timeoutMs: timeout,
      acknowledgeTokens,
    });
    const reconciliation = this.reconcile();
    return {
      timeoutMs: timeout,
      timedOut: waited.waitTimedOut,
      acknowledgement: waited.acknowledgement,
      completionInbox: waited.completionInbox,
      agents: this.store.listAgents(),
      reconciliation,
    };
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
    const reconciliation = this.reconcile();
    const inbox = readUnreadCompletionEvents(this.cwd, this.ownerRootId);
    const agents = this.store.listAgents({ pathPrefix: optionalText(input.path_prefix) }).map((agent) => ({
      ...agent,
      resident: Boolean(agent.activeJobId),
      unreadCompletions: inbox.events.filter((event) => publicCompletionForAgent(event, agent.agentId)),
    }));
    return {
      rootThreadId: this.ownerRootId,
      topology: "flat",
      agents,
      completionInbox: inbox,
      reconciliation,
      storageProtection: this.store.getProtection(),
    };
  }
}

export function createAgentRuntime(options = {}) {
  return new AgentRuntime(options);
}

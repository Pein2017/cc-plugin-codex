/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * The `claude-code` Harness Driver.
 *
 * This module composes the established Claude owners — executable discovery,
 * environment, execution profile, version compatibility, stream-json session,
 * durable steering, transport recovery, process control, and native history —
 * behind the turn-level Driver contract. It re-implements none of them, so the
 * observable Claude behavior is exactly what those owners already produce.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cancelClaudeProcess,
  getClaudeAuthStatus,
  getClaudeAvailability,
  interruptClaudeProcess,
  sanitizeUnknownEventSummary,
} from "./claude-headless-adapter.mjs";
import { readBoundClaudeAgentMessages } from "./claude-session-history.mjs";
import {
  assertPreparedClaudeCompatibility,
  formatClaudeCompatibilityError,
  inspectClaudeCompatibility,
  recordSuccessfulClaudeTurn,
} from "./claude-version-compatibility.mjs";
import {
  createExecutionProfile,
  validateExecutionProfileOptions,
} from "./execution-profile.mjs";
import {
  HARNESS_DRIVER_CONTRACT_VERSION,
  boundedDriverReceipt,
  canonicalNativeSessionRef,
} from "./harness-contract.mjs";
import { enqueueSteeringMessage, getSteeringSnapshot } from "./job-store.mjs";
import { runClaudeTaskSession } from "./job-supervisor.mjs";
import { terminalMetricsFromEvidence } from "./terminal-metrics.mjs";

export const CLAUDE_CODE_HARNESS_ID = "claude-code";
export const CLAUDE_CODE_DRIVER_VERSION = "claude-code@1";

/**
 * Observable behavior of a Claude Code turn under this checkout.
 *
 * `authorityEnforcement` is `prompt_only` deliberately: `terminal-parity`
 * always passes the dangerous permission bypass, so write intent is a
 * behavioral and recovery-risk boundary carried in the delegation prompt, not a
 * process-level security control. `leafEnforcement` is stronger because leaf
 * delegation denies the native Agent tool at the CLI boundary.
 */
export const CLAUDE_CODE_CAPABILITIES = Object.freeze({
  activeInput: "acknowledged_active_stream",
  continuation: "exact_resume",
  history: "assistant_messages",
  interrupt: "graceful_flush_proven",
  automaticRecovery: "exact_session_transport",
  authorityEnforcement: "prompt_only",
  leafEnforcement: "effective_tool_denial",
  nativeOrchestration: "opaque_bounded",
});

function canonicalPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

/**
 * Claude Code's stable native configuration identity. Two Agents that resolve
 * the same `CLAUDE_CONFIG_DIR` share one session namespace and therefore one
 * ownership scope.
 */
export function resolveClaudeInstanceKey(env = process.env) {
  return canonicalPath(env?.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"));
}

function nativeSessionRef(env, nativeSessionId) {
  if (!nativeSessionId) return null;
  try {
    return canonicalNativeSessionRef({
      harnessId: CLAUDE_CODE_HARNESS_ID,
      instanceKey: resolveClaudeInstanceKey(env),
      nativeSessionId,
    });
  } catch {
    return null;
  }
}

function unknownEventSummary(result) {
  return sanitizeUnknownEventSummary(
    result.unknownEvents ?? result.runtimeReceipt?.unknownEvents,
    result.unknownEventCount ?? result.runtimeReceipt?.unknownEventCount,
    result.unknownEventOverflowCount ?? result.runtimeReceipt?.unknownEventOverflowCount,
  );
}

/**
 * Normalize one native Claude turn into the shared terminal result. The
 * supervisor consumes only the normalized fields; `nativeReceipt` remains
 * optional Driver-local diagnostics and is never generic lifecycle evidence.
 */
function normalizeTurnResult({ env, result, profileReceipt, processEvidence, compatibility }) {
  const rawOutput = String(result.finalMessage ?? "");
  const session = nativeSessionRef(env, result.sessionId ?? null);
  const unknownEvents = unknownEventSummary(result);
  const drifted = result.failureClass === "protocol_session_drift";
  const finalMessagePresent = rawOutput.length > 0;
  return {
    harnessId: CLAUDE_CODE_HARNESS_ID,
    driverVersion: CLAUDE_CODE_DRIVER_VERSION,
    contractVersion: HARNESS_DRIVER_CONTRACT_VERSION,
    status: result.status === "completed" ? "completed" : "failed",
    exitStatus: result.status === "completed" ? 0 : (result.exitCode || 1),
    nativeSession: session,
    // Claude proves an exact session only when the transcript identity survived
    // the turn. Drift is refused here rather than becoming a resume target.
    sessionExactness: session && !drifted ? "exact" : "unproven",
    failure: {
      class: result.status === "completed" ? null : (result.failureClass ?? null),
      reason: result.status === "completed" ? null : (result.failureReason ?? null),
      // Bounded native failure text. It renders the turn's message and is
      // deliberately not persisted in the durable receipt.
      detail: result.stderr ?? null,
      resumable: result.resumable === true,
      requiresAttention: Boolean(result.requiresAttention),
    },
    finalMessage: finalMessagePresent ? rawOutput : null,
    finalMessageAbsenceReason: finalMessagePresent
      ? null
      : (result.failureReason ?? result.failureClass ?? "no_outer_assistant_message"),
    process: processEvidence,
    receipts: {
      toolUses: result.toolUses ?? [],
      touchedFiles: result.touchedFiles ?? [],
      attempts: result.attempts ?? [],
      recoveryAttempts: result.recoveryAttempts ?? 0,
      steering: result.steering ?? null,
    },
    metrics: terminalMetricsFromEvidence({
      providerReported: result.providerReportedMetrics,
      toolCallCount: Array.isArray(result.attempts)
        ? result.attempts.reduce((count, attempt) =>
          count + (Array.isArray(attempt?.toolUses) ? attempt.toolUses.length : 0), 0)
        : (Array.isArray(result.toolUses) ? result.toolUses.length : 0),
      attemptCount: Array.isArray(result.attempts) ? result.attempts.length : 0,
      recoveryAttemptCount: result.recoveryAttempts ?? 0,
    }),
    warning: result.warning ?? null,
    lastActivityAt: result.lastByteAt ?? null,
    manualContinuationCommand: result.manualResumeCommand ?? null,
    runtime: {
      ...(result.runtimeReceipt ?? {}),
      ...unknownEvents,
      executionProfile: profileReceipt,
      hostClaudeVersion: compatibility.compatibility?.version ?? null,
      preparedClaudeFingerprint: compatibility.compatibility?.fingerprint ?? null,
      claudeCompatibility: compatibility.compatibility,
      compatibilityObservationRecorded: compatibility.recorded,
      compatibilityObservationReason: compatibility.reason ?? null,
    },
    // Bounded Claude-owned evidence. The supervisor persists it as the turn's
    // native receipt and never reads it as generic proof of ownership,
    // signalling, or continuation.
    nativeReceipt: {
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
      steering: result.steering ?? null,
      runtimeReceipt: {
        ...(result.runtimeReceipt ?? {}),
        ...unknownEvents,
        executionProfile: profileReceipt,
        claudeCompatibility: compatibility.compatibility,
        compatibilityObservationRecorded: compatibility.recorded,
        compatibilityObservationReason: compatibility.reason ?? null,
      },
      lastByteAt: result.lastByteAt ?? null,
      manualResumeCommand: result.manualResumeCommand ?? null,
      requiresAttention: Boolean(result.requiresAttention),
      toolUses: result.toolUses ?? [],
      touchedFiles: result.touchedFiles ?? [],
      ...unknownEvents,
    },
    driverReceipt: boundedDriverReceipt(CLAUDE_CODE_HARNESS_ID, CLAUDE_CODE_DRIVER_VERSION, {
      executionProfile: profileReceipt?.name ?? null,
      failureClass: result.failureClass ?? null,
      recoveryAttempts: result.recoveryAttempts ?? 0,
      attempts: Array.isArray(result.attempts) ? result.attempts.length : 0,
      unknownEvents: unknownEvents.unknownEvents,
      unknownEventCount: unknownEvents.unknownEventCount,
      unknownEventOverflowCount: unknownEvents.unknownEventOverflowCount,
    }),
  };
}

export function createClaudeCodeDriver(_options = {}) {
  return Object.freeze({
    harnessId: CLAUDE_CODE_HARNESS_ID,
    driverVersion: CLAUDE_CODE_DRIVER_VERSION,
    contractVersion: HARNESS_DRIVER_CONTRACT_VERSION,
    capabilities: CLAUDE_CODE_CAPABILITIES,

    /** Host executable, native configuration, and account readiness. */
    preflight({ cwd, env }) {
      const availability = getClaudeAvailability(cwd, { env });
      const compatibility = inspectClaudeCompatibility(cwd, { availability, env });
      const auth = availability.available
        ? getClaudeAuthStatus(cwd, { env })
        : { available: false, loggedIn: false, detail: availability.detail };
      return {
        ready: Boolean(availability.available && compatibility.staticCompatible && auth.loggedIn),
        availability,
        compatibility,
        auth,
        instanceKey: resolveClaudeInstanceKey(env),
      };
    },

    /** Explain an unready preflight in the Driver's own terms. */
    describeUnreadiness(receipt) {
      if (!receipt.availability?.available) {
        return "Claude Code CLI is unavailable. Install `claude` and ensure it is on PATH.";
      }
      if (!receipt.compatibility?.staticCompatible) {
        return formatClaudeCompatibilityError(receipt.compatibility);
      }
      if (!receipt.auth?.loggedIn) {
        return "Claude Code CLI is not authenticated. Run `claude auth login` in the same environment.";
      }
      return null;
    },

    /**
     * Validate a persisted readiness receipt without re-running host checks.
     * @param {any} receipt
     * @param {{cwd?: string, env?: NodeJS.ProcessEnv, sourceRoot?: string}} [scope]
     */
    validatePreparedPreflight(receipt, scope = {}) {
      const { cwd, env, sourceRoot } = scope;
      if (
        receipt?.ready !== true ||
        receipt?.availability?.available !== true ||
        receipt?.compatibility?.staticCompatible !== true ||
        !String(receipt?.compatibility?.fingerprint ?? "").trim() ||
        !String(receipt?.compatibility?.executable ?? "").trim() ||
        receipt?.auth?.loggedIn !== true ||
        receipt?.cwd !== cwd ||
        receipt?.claudeConfigDir !== (env?.CLAUDE_CONFIG_DIR ?? null) ||
        receipt?.sourceRoot !== sourceRoot
      ) {
        throw new Error("Internal start received an invalid readiness receipt.");
      }
      return receipt;
    },

    /**
     * Re-prove the prepared executable immediately before the native turn.
     * @param {any} receipt
     * @param {{cwd?: string, env?: NodeJS.ProcessEnv, sourceRoot?: string}} [scope]
     */
    revalidatePreparedPreflight(receipt, scope = {}) {
      const { cwd, env, sourceRoot } = scope;
      const prepared = this.validatePreparedPreflight(receipt, { cwd, env, sourceRoot });
      const availability = getClaudeAvailability(cwd, { env });
      const compatibility = assertPreparedClaudeCompatibility(
        cwd,
        prepared.compatibility,
        { availability, env },
      );
      return Object.freeze({ availability, compatibility });
    },

    resolveInstanceKey(env) {
      return resolveClaudeInstanceKey(env);
    },

    /** The Driver alone decides which models, efforts, and topologies exist. */
    validateRoute(route = {}) {
      return validateExecutionProfileOptions(route);
    },

    /** Durable supervisor-assigned input for an already-running turn. */
    assignInput({ cwd, jobId, text, kind, messageId }) {
      return enqueueSteeringMessage(cwd, jobId, text, { kind, messageId });
    },

    interruptTurn({ pid, pidIdentity }) {
      return interruptClaudeProcess(pid, pidIdentity);
    },

    cancelTurn({ pid, pidIdentity }) {
      return cancelClaudeProcess(pid, pidIdentity);
    },

    readAssistantHistory(agent, options) {
      return readBoundClaudeAgentMessages(agent, options);
    },

    /** One complete Claude turn, including its bounded in-turn recovery. */
    async startTurn({
      workspaceRoot,
      cwd,
      jobId,
      prompt,
      route,
      env,
      launchContext,
      sessionName,
      resumeSessionId,
      onProgress,
      onSpawn,
      // Kept internal to this Driver so parity fixtures can capture the exact
      // native envelope without launching Claude. No public or ambient input
      // reaches it.
      runTurnSession = runClaudeTaskSession,
    }) {
      const launchCompatibility = launchContext?.compatibility;
      if (!launchCompatibility?.executable) {
        throw new Error("Claude Code Driver requires a revalidated launch context.");
      }
      const profile = createExecutionProfile({ ...route, env });
      const processEvidence = { spawnAccepted: false, identityProven: false };
      try {
        const result = await runTurnSession({
          workspaceRoot,
          jobId,
          cwd,
          prompt,
          write: Boolean(route.write),
          claudeOptions: {
            ...profile.claudeOptions,
            claudeBin: launchCompatibility.executable,
            sessionName: sessionName ?? undefined,
            resumeSessionId: resumeSessionId ?? undefined,
          },
          harnessInstance: {
            harnessId: CLAUDE_CODE_HARNESS_ID,
            instanceKey: resolveClaudeInstanceKey(env),
          },
          onProgress,
          onSpawn: async (receipt) => {
            const accepted = onSpawn ? await onSpawn(receipt) : true;
            if (accepted === true) {
              processEvidence.spawnAccepted = true;
              processEvidence.identityProven = Boolean(receipt?.pidIdentity);
            }
            return accepted;
          },
        });
        const compatibility = result.status === "completed"
          ? recordSuccessfulClaudeTurn(
              cwd,
              launchCompatibility,
              result.runtimeReceipt?.claudeCodeVersion,
              { env },
            )
          : {
              recorded: false,
              compatibility: launchCompatibility,
              runtimeVersion: result.runtimeReceipt?.claudeCodeVersion ?? null,
            };
        const normalized = normalizeTurnResult({
          env,
          result,
          profileReceipt: profile.receipt,
          processEvidence,
          compatibility,
        });
        normalized.nativeReceipt.steering ??= getSteeringSnapshot(cwd, jobId);
        normalized.receipts.steering ??= normalized.nativeReceipt.steering;
        return normalized;
      } finally {
        profile.cleanup();
      }
    },
  });
}

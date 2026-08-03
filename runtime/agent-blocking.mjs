/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure projection from one terminal Agent turn fact to the closed, model-facing
 * `blocking` triple: `reason`, `scope`, and `retry`. Both the frozen completion
 * payload (`runtime/completion-inbox.mjs`) and the blocked-Agent activation
 * rejections (`runtime/agent-runtime.mjs`) derive their evidence from this one
 * table, so a Harness-scoped stop and an Agent-scoped stop are never described
 * two different ways.
 *
 * Every value here is a closed enum member. Nothing in this module ever
 * forwards a caller-supplied string into a returned triple: an unrecognized or
 * absent turn-failure class and supervisor fact both resolve to the closed
 * `unclassified` reason, never to the raw text that produced them.
 */

import { HARNESS_TURN_FAILURE_SCOPES } from "./harness-failure-classes.mjs";

export const AGENT_BLOCKING_REASONS = Object.freeze({
  auth_required: "harness",
  account_limit: "harness",
  harness_incompatible: "harness",
  transport_exhausted: "agent",
  session_lost: "agent",
  interrupted_unflushed: "agent",
  route_unsupported: "agent",
  worker_lost: "agent",
  unclassified: "agent",
});

export const AGENT_BLOCKING_REASON_NAMES = Object.freeze(
  Object.keys(AGENT_BLOCKING_REASONS).sort()
);

export const AGENT_BLOCKING_RETRIES = Object.freeze([
  "same_agent_followup",
  "new_agent",
  "operator_required",
]);

const SAME_AGENT_CONTINUATION_MODES = new Set(["exact_session", "safe_fresh"]);

/**
 * Admitted Driver turn-failure classes (`runtime/harness-failure-classes.mjs`)
 * map here by observed fact. `protocol_unknown` and `fatal` are the Driver's
 * own "ran, but could not classify more precisely" outcomes, and honestly
 * report `unclassified` rather than guessing a closer reason.
 */
const DRIVER_CLASS_REASONS = Object.freeze({
  auth_or_permission: "auth_required",
  usage_or_subscription_limit: "account_limit",
  context_or_request_invalid: "route_unsupported",
  transport_closed_resumable: "transport_exhausted",
  protocol_session_drift: "session_lost",
  session_owner_conflict: "session_lost",
  cancelled_or_interrupted: "interrupted_unflushed",
  protocol_unknown: "unclassified",
  fatal: "unclassified",
});

/**
 * Named supervisor-origin literals: facts observed with no turn result, so
 * never admitted into the Driver vocabulary. `worker_launch_failed`,
 * `worker_handoff_failed`, and `worker_reaped` are the three ways a job never
 * reaches a Driver turn at all (`runtime/job-store.mjs`,
 * `runtime/internal-runtime.mjs`); `session_binding_conflict` is set on
 * `job.failureClass` (`runtime/job-store.mjs`) or synthesized directly as
 * continuation evidence (`runtime/agent-store.mjs`);
 * `forced_interruption_unflushed` and `interrupted_without_exact_session` are
 * the two ways an interrupted turn can fail to prove a safe flush
 * (`runtime/internal-runtime.mjs`, `runtime/job-store.mjs`); `session_drift`
 * is job-store's own renaming of a drifted session inside continuation
 * evidence (`runtime/job-store.mjs`); `legacy_agent_model_unsupported` and
 * `legacy_agent_model_unproven` are version-1 legacy Agent model migration's
 * own closed continuation-evidence reasons (`runtime/agent-runtime.mjs`) —
 * a route the Agent's accepted model can no longer take, not a Harness or
 * worker-lifecycle fact.
 *
 * `harness_incompatible` closes the mapping for a structured Harness-wide
 * supervisor fact but is not currently produced by any live code path: a
 * pre-turn compatibility revalidation refusal
 * (`driver.revalidatePreparedPreflight` in `runtime/internal-runtime.mjs`)
 * fails while the job is still `preClaudeLaunch: true`, so it is excluded
 * from completion reconciliation (`isPreClaudeJob`,
 * `runtime/job-store.mjs:783`) and never reaches a model-facing wait. That
 * synchronous refusal instead surfaces today as an actionable, already
 * sanitized runtime error outside the completion pipeline. `harness_incompatible`
 * remains an admitted reason so a future supervisor fact that does carry this
 * structured value maps correctly, without inventing a second closed value.
 */
const SUPERVISOR_ORIGIN_REASONS = Object.freeze({
  harness_incompatible: "harness_incompatible",
  worker_launch_failed: "worker_lost",
  worker_handoff_failed: "worker_lost",
  worker_reaped: "worker_lost",
  session_binding_conflict: "session_lost",
  forced_interruption_unflushed: "interrupted_unflushed",
  interrupted_without_exact_session: "interrupted_unflushed",
  session_drift: "session_lost",
  legacy_agent_model_unsupported: "route_unsupported",
  legacy_agent_model_unproven: "route_unsupported",
});

// Every admitted Driver class must resolve to a reason whose declared scope
// matches the class's own declared scope. A stale or mistyped table entry
// fails at import time rather than silently misreporting Harness-scoped
// evidence as Agent-scoped or vice versa.
for (const [failureClass, declaredScope] of Object.entries(HARNESS_TURN_FAILURE_SCOPES)) {
  const reason = DRIVER_CLASS_REASONS[failureClass];
  if (!reason) {
    throw new Error(`Admitted turn-failure class ${failureClass} has no blocking-reason mapping.`);
  }
  if (AGENT_BLOCKING_REASONS[reason] !== declaredScope) {
    throw new Error(
      `Turn-failure class ${failureClass} declares ${declaredScope} scope but maps to ` +
      `reason ${reason} (${AGENT_BLOCKING_REASONS[reason]} scope).`
    );
  }
}

function isAdmittedTurnFailureClass(value) {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(HARNESS_TURN_FAILURE_SCOPES, value);
}

function turnReasonOf(value) {
  return isAdmittedTurnFailureClass(value) ? DRIVER_CLASS_REASONS[value] : null;
}

function supervisorReasonOf(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SUPERVISOR_ORIGIN_REASONS, value)
    ? SUPERVISOR_ORIGIN_REASONS[value]
    : null;
}

/**
 * Resolve one closed reason from up to two structured fields on the terminal
 * fact: `turnFailureClass` (`job.result.failureClass`, an admitted Driver
 * class when a turn actually ran) and `supervisorFailureClass`
 * (`job.failureClass`, a named supervisor-origin fact recorded with no turn
 * result). Both can be present at once. Precedence, highest first: a
 * Harness-scoped reason from either field; an admitted turn class;
 * supervisor-origin evidence; a closed `unclassified` fallback.
 *
 * A value in `turnFailureClass` that is not itself an admitted class — for
 * example a future supervisor fact that reuses the `job.result.failureClass`
 * field without ever being proven as a Driver fact — is reclassified here as
 * supervisor-origin evidence instead of being discarded.
 *
 * `unclassified` is reached only by a value that is neither an admitted turn
 * class nor a named supervisor literal (including absence of both): every
 * currently producible fact has a named home in one of the two tables above,
 * so this is a defensive default, not an expected outcome.
 */
function resolveReason(turnFailureClass, supervisorFailureClass) {
  const turnReason = turnReasonOf(turnFailureClass);
  const supervisorReason = supervisorReasonOf(supervisorFailureClass) ??
    (turnReason == null ? supervisorReasonOf(turnFailureClass) : null);

  if (turnReason && AGENT_BLOCKING_REASONS[turnReason] === "harness") return turnReason;
  if (supervisorReason && AGENT_BLOCKING_REASONS[supervisorReason] === "harness") return supervisorReason;
  if (turnReason) return turnReason;
  if (supervisorReason) return supervisorReason;
  return "unclassified";
}

function resolveNonNullBlocking(turnFailureClass, supervisorFailureClass, continuationMode) {
  const reason = resolveReason(turnFailureClass, supervisorFailureClass);
  const scope = AGENT_BLOCKING_REASONS[reason];
  const retry = scope === "harness"
    ? "operator_required"
    : SAME_AGENT_CONTINUATION_MODES.has(continuationMode)
      ? "same_agent_followup"
      : "new_agent";
  return { reason, scope, retry };
}

/**
 * Pure derivation of the model-facing `blocking` triple from one terminal
 * Agent turn fact, for the frozen completion payload. No timestamp, counter,
 * attempt total, elapsed interval, or filesystem read may ever enter this
 * function: repeated derivation of an unchanged fact must be byte-identical so
 * a settled wait stays write-free.
 *
 * @param {{
 *   terminalStatus: "completed"|"interrupted"|"failed"|string,
 *   turnFailureClass: string|null,
 *   supervisorFailureClass: string|null,
 *   continuationMode: "exact_session"|"safe_fresh"|"blocked",
 * }} fact
 * @returns {{ reason: string, scope: "agent"|"harness", retry: string } | null}
 */
export function deriveAgentBlocking({ terminalStatus, turnFailureClass, supervisorFailureClass, continuationMode }) {
  if (terminalStatus === "completed") return null;
  if (terminalStatus === "interrupted") {
    // Only an exact native session proves the transcript actually flushed —
    // that is the parent's own successful interrupt, not an obstruction.
    // `safe_fresh` proves no side effect occurred, not that this specific
    // interrupted turn's transcript is intact, so it cannot stand in for a
    // proven flush here; like `blocked`, it yields a fixed `new_agent` retry
    // rather than deriving retry from continuation mode.
    if (continuationMode === "exact_session") return null;
    return { reason: "interrupted_unflushed", scope: "agent", retry: "new_agent" };
  }
  return resolveNonNullBlocking(turnFailureClass ?? null, supervisorFailureClass ?? null, continuationMode);
}

/**
 * Derive the same closed triple for a live blocked-Agent activation rejection
 * (`send_message`/`followup_task` continuation guards in
 * `runtime/agent-runtime.mjs`). `continuationEvidenceReason` is the raw
 * `agent.continuation.evidence.reason` value — a single already-collapsed
 * field, never two separate structured slots — so it is offered to both the
 * turn-class and supervisor-literal checks; at most one can ever match a
 * given string, and neither check ever forwards an unrecognized value (raw
 * operator prose included) into the result.
 */
export function deriveBlockedContinuationRejection({ continuationEvidenceReason, continuationMode }) {
  const raw = continuationEvidenceReason ?? null;
  return resolveNonNullBlocking(raw, raw, continuationMode);
}

/**
 * Validate a stored or normalized `blocking` value: `null`, or an object
 * carrying exactly the closed `reason`, its declared `scope`, and a closed
 * `retry`. Used to fail closed on a corrupt or foreign completion-inbox
 * record, exactly as `validateResumability` does for `resumability`.
 */
export function assertAgentBlocking(value, label = "blocking evidence") {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be null or an object.`);
  }
  const keys = Object.keys(value);
  if (keys.length !== 3 || !["reason", "scope", "retry"].every((key) => keys.includes(key))) {
    throw new Error(`${label} must carry exactly reason, scope, and retry.`);
  }
  const { reason, scope, retry } = value;
  if (!Object.prototype.hasOwnProperty.call(AGENT_BLOCKING_REASONS, reason)) {
    throw new Error(`${label} has an unsupported reason: ${JSON.stringify(reason ?? null)}.`);
  }
  if (AGENT_BLOCKING_REASONS[reason] !== scope) {
    throw new Error(
      `${label} declares scope ${JSON.stringify(scope ?? null)} for reason ${reason}; ` +
      `expected ${AGENT_BLOCKING_REASONS[reason]}.`
    );
  }
  if (!AGENT_BLOCKING_RETRIES.includes(retry)) {
    throw new Error(`${label} has an unsupported retry: ${JSON.stringify(retry ?? null)}.`);
  }
  if (scope === "harness" && retry !== "operator_required") {
    throw new Error(`${label} must use operator_required retry for Harness-scoped reasons.`);
  }
  if (scope === "agent" && retry === "operator_required") {
    throw new Error(`${label} must not use operator_required retry for Agent-scoped reasons.`);
  }
  return { reason, scope, retry };
}

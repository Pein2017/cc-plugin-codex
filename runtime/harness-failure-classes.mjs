/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Closed vocabulary of Harness turn-failure classes.
 *
 * A turn-failure class is a fact a Driver observes from its own native turn:
 * exactly the classes reachable through `classifyClaudeFailure`
 * (`runtime/claude-headless-adapter.mjs`) plus the in-turn overrides the
 * supervisor's own session call applies (`runtime/job-supervisor.mjs`). It
 * never admits a supervisor-owned fact — pre-launch compatibility refusal,
 * worker launch or handoff failure, forced unflushed interruption, or
 * stale-job reaping — because no turn result exists when those occur; those
 * facts are recognized separately in `runtime/agent-blocking.mjs`.
 *
 * Every admitted class is checkout-owned and declares whether it blocks one
 * Agent or the whole Harness instance. A caller, ambient input, or persisted
 * record never supplies, widens, or overrides the vocabulary or a class's
 * declared scope; an unadmitted class is rejected at `validateHarnessTurnResult`
 * before it becomes durable continuation evidence.
 */

export const HARNESS_TURN_FAILURE_SCOPES = Object.freeze({
  auth_or_permission: "harness",
  compatibility_surface_drift: "harness",
  usage_or_subscription_limit: "harness",
  context_or_request_invalid: "agent",
  transport_closed_resumable: "agent",
  protocol_session_drift: "agent",
  session_owner_conflict: "agent",
  cancelled_or_interrupted: "agent",
  protocol_unknown: "agent",
  fatal: "agent",
});

export const HARNESS_TURN_FAILURE_CLASSES = Object.freeze(
  Object.keys(HARNESS_TURN_FAILURE_SCOPES).sort()
);

export function isAdmittedHarnessTurnFailureClass(value) {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(HARNESS_TURN_FAILURE_SCOPES, value);
}

/**
 * Fail closed on an unadmitted, empty, or free-text class. Called from
 * `validateHarnessTurnResult` after the existing non-empty-string check, so an
 * empty/missing class keeps its original "must classify its failure" message
 * and only a non-empty-but-foreign class reaches this rejection.
 */
export function assertHarnessTurnFailureClass(value, label = "Harness turn failure class") {
  if (!isAdmittedHarnessTurnFailureClass(value)) {
    throw new Error(
      `${label} is not an admitted turn-failure class: ${JSON.stringify(value ?? null)}. ` +
      `Use one of: ${HARNESS_TURN_FAILURE_CLASSES.join(", ")}.`
    );
  }
  return value;
}

export function scopeOfHarnessTurnFailureClass(value) {
  return HARNESS_TURN_FAILURE_SCOPES[assertHarnessTurnFailureClass(value)];
}

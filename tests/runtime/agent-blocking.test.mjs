import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_BLOCKING_REASON_NAMES,
  AGENT_BLOCKING_REASONS,
  assertAgentBlocking,
  deriveAgentBlocking,
  deriveBlockedContinuationRejection,
} from "../../runtime/agent-blocking.mjs";
import { HARNESS_TURN_FAILURE_SCOPES } from "../../runtime/harness-failure-classes.mjs";

function blocking(turnFailureClass, supervisorFailureClass, continuationMode = "blocked") {
  return deriveAgentBlocking({
    terminalStatus: "failed",
    turnFailureClass,
    supervisorFailureClass,
    continuationMode,
  });
}

describe("Agent blocking projection", () => {
  it("closes the public reason vocabulary at exactly the nine accepted values", () => {
    assert.deepEqual(AGENT_BLOCKING_REASON_NAMES, [
      "account_limit",
      "auth_required",
      "harness_incompatible",
      "interrupted_unflushed",
      "route_unsupported",
      "session_lost",
      "transport_exhausted",
      "unclassified",
      "worker_lost",
    ]);
    assert.deepEqual(new Set(Object.values(AGENT_BLOCKING_REASONS)), new Set(["agent", "harness"]));
    assert.equal(AGENT_BLOCKING_REASONS.auth_required, "harness");
    assert.equal(AGENT_BLOCKING_REASONS.account_limit, "harness");
    assert.equal(AGENT_BLOCKING_REASONS.harness_incompatible, "harness");
  });

  it("presence: completed and gracefully interrupted are null; failed and unflushed interrupted are not", () => {
    assert.equal(deriveAgentBlocking({
      terminalStatus: "completed",
      turnFailureClass: "auth_or_permission",
      supervisorFailureClass: null,
      continuationMode: "blocked",
    }), null, "completed is always null regardless of any accompanying failure evidence");

    assert.equal(deriveAgentBlocking({
      terminalStatus: "interrupted",
      turnFailureClass: "cancelled_or_interrupted",
      supervisorFailureClass: null,
      continuationMode: "exact_session",
    }), null, "a proven safe flush stays resumable, not blocked");

    assert.deepEqual(deriveAgentBlocking({
      terminalStatus: "interrupted",
      turnFailureClass: "cancelled_or_interrupted",
      supervisorFailureClass: null,
      continuationMode: "blocked",
    }), { reason: "interrupted_unflushed", scope: "agent", retry: "new_agent" });

    // Only an exact native session proves the transcript actually flushed.
    // `safe_fresh` proves no side effect occurred, not that this specific
    // interrupted transcript is intact, so it cannot stand in for a proven
    // flush and yields the same fixed new-Agent retry as `blocked`.
    assert.deepEqual(deriveAgentBlocking({
      terminalStatus: "interrupted",
      turnFailureClass: "cancelled_or_interrupted",
      supervisorFailureClass: null,
      continuationMode: "safe_fresh",
    }), { reason: "interrupted_unflushed", scope: "agent", retry: "new_agent" });

    assert.equal(blocking("fatal", null).scope, "agent");
  });

  it("maps every admitted Driver turn-failure class to a reason whose scope matches its own declared scope", () => {
    for (const [failureClass, declaredScope] of Object.entries(HARNESS_TURN_FAILURE_SCOPES)) {
      const result = blocking(failureClass, null);
      assert.ok(result, `${failureClass} must resolve to a non-null triple`);
      assert.equal(result.scope, declaredScope, `${failureClass} scope must match its Driver-declared scope`);
      assert.ok(
        AGENT_BLOCKING_REASON_NAMES.includes(result.reason),
        `${failureClass} must resolve to a closed reason`
      );
    }
  });

  it("harness-scoped precedence: account exhaustion decides even alongside transport-shaped text", () => {
    // The mapping never reads free text; it only ever sees the closed
    // `turnFailureClass` field, so "accompanying transport evidence" cannot
    // change the outcome by construction.
    assert.deepEqual(
      blocking("usage_or_subscription_limit", null),
      { reason: "account_limit", scope: "harness", retry: "operator_required" },
    );
  });

  it("supervisor-origin evidence decides only when no turn-failure class exists", () => {
    assert.deepEqual(
      blocking(null, "harness_incompatible"),
      { reason: "harness_incompatible", scope: "harness", retry: "operator_required" },
    );
    assert.deepEqual(
      deriveAgentBlocking({
        terminalStatus: "failed",
        turnFailureClass: null,
        supervisorFailureClass: "worker_handoff_failed",
        continuationMode: "safe_fresh",
      }),
      { reason: "worker_lost", scope: "agent", retry: "same_agent_followup" },
    );
    assert.deepEqual(
      blocking(null, "worker_launch_failed"),
      { reason: "worker_lost", scope: "agent", retry: "new_agent" },
    );
    assert.deepEqual(
      blocking(null, "worker_reaped"),
      { reason: "worker_lost", scope: "agent", retry: "new_agent" },
    );
    assert.deepEqual(
      blocking(null, "session_binding_conflict"),
      { reason: "session_lost", scope: "agent", retry: "new_agent" },
    );
    assert.deepEqual(
      blocking(null, "legacy_agent_model_unsupported"),
      { reason: "route_unsupported", scope: "agent", retry: "new_agent" },
    );
    assert.deepEqual(
      blocking(null, "legacy_agent_model_unproven"),
      { reason: "route_unsupported", scope: "agent", retry: "new_agent" },
    );
  });

  it("a failed job with no recognized structured fact is unclassified, never worker_lost by default", () => {
    assert.deepEqual(blocking(null, null), { reason: "unclassified", scope: "agent", retry: "new_agent" });
    assert.deepEqual(
      blocking(null, "some_future_driver_or_supervisor_fact"),
      { reason: "unclassified", scope: "agent", retry: "new_agent" },
    );
  });

  it("an unrecognized fact yields the closed unclassified reason, never free text", () => {
    assert.deepEqual(
      blocking("some_future_driver_or_supervisor_fact", null),
      { reason: "unclassified", scope: "agent", retry: "new_agent" },
    );
  });

  it("an Agent-scoped turn class coexists with harness_incompatible and Harness scope wins", () => {
    // job.result.failureClass carries an admitted, Agent-scoped Driver class
    // while job.failureClass separately carries the supervisor's Harness-scoped
    // compatibility tag: Harness-scoped evidence outranks the turn class.
    assert.deepEqual(
      blocking("context_or_request_invalid", "harness_incompatible"),
      { reason: "harness_incompatible", scope: "harness", retry: "operator_required" },
    );
  });

  it("an Agent-scoped turn class beats Agent-scoped supervisor (worker) evidence", () => {
    assert.deepEqual(
      blocking("protocol_session_drift", "worker_reaped"),
      { reason: "session_lost", scope: "agent", retry: "new_agent" },
    );
  });

  it("retry derives only from continuation mode, never from a second recoverability judgement", () => {
    assert.equal(
      blocking("transport_closed_resumable", null, "exact_session").retry,
      "same_agent_followup",
      "a failed turn that exhausted recovery while keeping its exact session is still non-null but resumable",
    );
    assert.equal(blocking("transport_closed_resumable", null, "blocked").retry, "new_agent");
    assert.equal(
      blocking("auth_or_permission", null, "exact_session").retry,
      "operator_required",
      "Harness scope always yields operator_required regardless of continuation mode",
    );
  });

  it("derivation is a pure, byte-identical function of its inputs", () => {
    const fact = { terminalStatus: "failed", turnFailureClass: "protocol_unknown", supervisorFailureClass: null, continuationMode: "blocked" };
    const first = JSON.stringify(deriveAgentBlocking(fact));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(JSON.stringify(deriveAgentBlocking({ ...fact })), first);
    }
  });

  it("proves mapping totality: every admitted class and named supervisor literal resolves without throwing", () => {
    const facts = [
      ...Object.keys(HARNESS_TURN_FAILURE_SCOPES),
      "harness_incompatible",
      "worker_launch_failed",
      "worker_handoff_failed",
      "worker_reaped",
      "session_binding_conflict",
      "forced_interruption_unflushed",
      "interrupted_without_exact_session",
      "session_drift",
      "legacy_agent_model_unsupported",
      "legacy_agent_model_unproven",
      null,
    ];
    for (const supervisorFailureClass of facts) {
      assert.doesNotThrow(() => blocking(null, supervisorFailureClass));
    }
  });

  it("redacts a blocked-Agent rejection by construction: raw operator prose never survives", () => {
    const rawPidSentence = "Control process 12345 died or changed identity without completing. Auto-reaped.";
    const rejected = deriveBlockedContinuationRejection({
      continuationEvidenceReason: rawPidSentence,
      continuationMode: "blocked",
    });
    // Unrecognized prose is neither an admitted turn class nor a named
    // supervisor literal, so it resolves to the closed `unclassified`
    // fallback rather than echoing the text or guessing `worker_lost`.
    assert.deepEqual(rejected, { reason: "unclassified", scope: "agent", retry: "new_agent" });
    assert.equal(JSON.stringify(rejected).includes("12345"), false);
    assert.equal(JSON.stringify(rejected).includes("Control process"), false);

    const manualResumeSentence = "Automatic recovery budget exhausted. Resume manually with: claude --resume abc-123-session";
    const exhausted = deriveBlockedContinuationRejection({
      continuationEvidenceReason: manualResumeSentence,
      continuationMode: "blocked",
    });
    assert.equal(JSON.stringify(exhausted).includes("claude --resume"), false);
    assert.equal(JSON.stringify(exhausted).includes("abc-123-session"), false);
  });

  it("recognizes the structured worker_reaped fact instead of relying on absence", () => {
    assert.deepEqual(
      deriveBlockedContinuationRejection({ continuationEvidenceReason: "worker_reaped", continuationMode: "blocked" }),
      { reason: "worker_lost", scope: "agent", retry: "new_agent" },
    );
  });

  it("recognizes job-store's own continuation-evidence renamings", () => {
    assert.deepEqual(
      deriveBlockedContinuationRejection({ continuationEvidenceReason: "session_drift", continuationMode: "blocked" }),
      { reason: "session_lost", scope: "agent", retry: "new_agent" },
    );
    assert.deepEqual(
      deriveBlockedContinuationRejection({
        continuationEvidenceReason: "interrupted_without_exact_session",
        continuationMode: "blocked",
      }),
      { reason: "interrupted_unflushed", scope: "agent", retry: "new_agent" },
    );
  });

  it("recognizes legacy Agent model migration reasons as structured continuation evidence", () => {
    assert.deepEqual(
      deriveBlockedContinuationRejection({
        continuationEvidenceReason: "legacy_agent_model_unsupported",
        continuationMode: "blocked",
      }),
      { reason: "route_unsupported", scope: "agent", retry: "new_agent" },
    );
    assert.deepEqual(
      deriveBlockedContinuationRejection({
        continuationEvidenceReason: "legacy_agent_model_unproven",
        continuationMode: "blocked",
      }),
      { reason: "route_unsupported", scope: "agent", retry: "new_agent" },
    );
  });

  it("validates a stored or normalized blocking value against the closed shape", () => {
    assert.equal(assertAgentBlocking(null), null);
    assert.deepEqual(
      assertAgentBlocking({ reason: "worker_lost", scope: "agent", retry: "new_agent" }),
      { reason: "worker_lost", scope: "agent", retry: "new_agent" },
    );
    assert.throws(() => assertAgentBlocking({ reason: "not_a_reason", scope: "agent", retry: "new_agent" }));
    assert.throws(() => assertAgentBlocking({ reason: "auth_required", scope: "agent", retry: "operator_required" }));
    assert.throws(() => assertAgentBlocking({ reason: "worker_lost", scope: "agent", retry: "not_a_retry" }));
    assert.throws(() => assertAgentBlocking("blocked"));
    assert.throws(() => assertAgentBlocking({ reason: "auth_required", scope: "harness", retry: "same_agent_followup" }));
    assert.throws(() => assertAgentBlocking({ reason: "worker_lost", scope: "agent", retry: "operator_required" }));
  });
});

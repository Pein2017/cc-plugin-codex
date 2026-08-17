/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Turn settlement: the one place that decides whether terminal evidence may
 * publish a completion.
 *
 * A turn carries four independent axes. The native turn may be terminal while
 * turn-owned execution is still running; a persistent server, shell, or
 * session may stay resident with nothing outstanding; a transcript may resume
 * exactly after its execution world was lost, or be unresumable while the
 * shell survives. Collapsing any of these into one `resumable`, `exited`, or
 * `alive` boolean is how a false completion gets published, so this module
 * keeps them separate and reads only the axes themselves.
 *
 * It consumes already-validated evidence and returns bounded structural facts.
 * It never mutates its input, synthesizes a terminal state, clears ownership,
 * releases a lease, reads a transcript, or turns a request acknowledgement
 * into settlement. Anything it cannot read as an exact closed value is
 * unpublishable, not repaired.
 */

import { types } from "node:util";

/** Native turn state: what the Harness says about the turn itself. */
export const NATIVE_TURN_STATES = Object.freeze(["active", "terminal", "unknown"]);

/**
 * Turn-owned execution settlement: the one vocabulary, exactly as decision 7
 * and the version-two normalized schema define it.
 * `runtime/harness-contract.mjs` imports this same set, so the schema and this
 * predicate cannot drift apart.
 *
 * There is deliberately no `not_applicable` settlement. `completion-delivery`
 * requires owned work "settled or not applicable", and a turn that owns no
 * execution world expresses that as `continuity=not_applicable` with
 * `settlement=settled`: having nothing to settle is settled work, not a fourth
 * settlement state that a Driver could use to mean "unknown but harmless".
 */
export const NORMALIZED_SETTLEMENT_VALUES = Object.freeze(["settled", "active", "unknown"]);

/** The only settlement evidence that may publish a completion. */
export const PUBLISHABLE_SETTLEMENT_VALUES = Object.freeze(["settled"]);

/** Execution-world continuity: residency, never outstanding work. */
export const EXECUTION_CONTINUITY_VALUES = Object.freeze([
  "preserved",
  "lost",
  "not_applicable",
  "unknown",
]);

/** Transcript continuation: never evidence about execution. */
export const CONTINUATION_MODES = Object.freeze(["exact_resume", "fresh_only", "none", "unknown"]);

/** Terminal statuses the version-two normalized result may declare. */
export const TURN_STATUS_VALUES = Object.freeze(["completed", "failed", "interrupted"]);

/** The closed structural facts a classification reports. */
export const TURN_SETTLEMENT_FACTS = Object.freeze([
  "publishable",
  "reason",
  "status",
  "nativeTurn",
  "settlement",
  "continuity",
  "continuationMode",
]);

/** The closed reasons a classification may give. */
export const TURN_SETTLEMENT_REASONS = Object.freeze([
  "publishable",
  "invalid_evidence",
  "contradictory_terminal_evidence",
  "native_turn_active",
  "native_turn_unknown",
  "execution_settlement_active",
  "execution_settlement_unknown",
]);

/** The axis fields whose presence means evidence is settlement-shaped. */
const SETTLEMENT_AXIS_FIELDS = Object.freeze(["nativeTurn", "executionWorld"]);

const INVALID = Object.freeze({
  publishable: false,
  reason: "invalid_evidence",
  status: null,
  nativeTurn: null,
  settlement: null,
  continuity: null,
  continuationMode: null,
});

/**
 * A settlement axis must be an own plain data property. An accessor or Proxy
 * can answer `terminal` here and something else to the next reader, so the
 * evidence is refused rather than read twice.
 */
function plainObject(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !types.isProxy(value)
  );
}

function dataValue(source, key) {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
  return descriptor.value;
}

function closedValue(source, key, admitted) {
  const value = dataValue(source, key);
  return admitted.includes(value) ? value : null;
}

/**
 * A closed stand-in for evidence that exists but cannot be read as plain data
 * -- a Proxy container, an accessor field, or an inherited one. A caller
 * returns this instead of the unreadable value so no hook is ever invoked, and
 * it classifies as `invalid_evidence` like any other unreadable claim.
 */
export const UNREADABLE_TURN_EVIDENCE = Object.freeze(Object.create(null));

/**
 * True when this evidence claims the version-two settlement axes at all.
 * Version-one process-shaped results carry neither axis, so a generic caller
 * can gate new evidence without branching on a Harness or contract version.
 *
 * Deliberately wider than `classifyTurnSettlement` accepts: a Proxy, an
 * inherited or class-carried axis, and an exotic container are all treated as
 * claims so they reach classification and are refused there. Narrowing
 * detection is the one direction that can fail open.
 *
 * The chain is walked one link at a time with `Object.getPrototypeOf`, never
 * with `in`. `in` performs `[[HasProperty]]`, which -- unlike an own-key
 * lookup -- keeps recursing into whatever `[[HasProperty]]` the next
 * prototype exposes; for a Proxy link that is its `has` trap, so a Proxy
 * anywhere in the chain, not just at `candidate` itself, can lie about
 * presence to `in`. Each link's Proxy-ness is decided before it is queried in
 * any way, so a Proxy anywhere in the chain is treated as a claim (`true`)
 * rather than asked what it contains, and `Object.getPrototypeOf` is only
 * called on a link already proven not to be a Proxy.
 */
export function carriesTurnSettlementAxes(candidate) {
  if (candidate == null || typeof candidate !== "object") return false;
  let link = candidate;
  while (link != null) {
    if (types.isProxy(link)) return true;
    if (SETTLEMENT_AXIS_FIELDS.some((field) => Object.hasOwn(link, field))) return true;
    link = Object.getPrototypeOf(link);
  }
  return false;
}

/**
 * Classify already-validated terminal evidence into bounded structural facts.
 * Pure: the input is never mutated, frozen, or partially consumed.
 *
 * @param {unknown} result
 * @returns {Readonly<{publishable: boolean, reason: string, status: string|null,
 *   nativeTurn: string|null, settlement: string|null, continuity: string|null,
 *   continuationMode: string|null}>}
 */
export function classifyTurnSettlement(result) {
  if (!plainObject(result)) return INVALID;
  const world = dataValue(result, "executionWorld");
  const continuation = dataValue(result, "continuation");
  if (!plainObject(world) || !plainObject(continuation)) return INVALID;

  const status = closedValue(result, "status", TURN_STATUS_VALUES);
  const nativeTurn = closedValue(result, "nativeTurn", NATIVE_TURN_STATES);
  const settlement = closedValue(world, "settlement", NORMALIZED_SETTLEMENT_VALUES);
  const continuity = closedValue(world, "continuity", EXECUTION_CONTINUITY_VALUES);
  const continuationMode = closedValue(continuation, "mode", CONTINUATION_MODES);
  if (
    status == null ||
    nativeTurn == null ||
    settlement == null ||
    continuity == null ||
    continuationMode == null
  ) {
    return INVALID;
  }

  const facts = { status, nativeTurn, settlement, continuity, continuationMode };
  // A completed claim that its own axes contradict is named as a contradiction
  // rather than reported as ordinary unsettled work: it is a false terminal
  // claim, not honest uncertainty.
  if (status === "completed" && (nativeTurn !== "terminal" || settlement === "active")) {
    return decided(false, "contradictory_terminal_evidence", facts);
  }
  if (nativeTurn === "active") return decided(false, "native_turn_active", facts);
  if (nativeTurn === "unknown") return decided(false, "native_turn_unknown", facts);
  if (settlement === "active") return decided(false, "execution_settlement_active", facts);
  // Anything that is not the publishable value is withheld as unproven, so a
  // settlement value added later cannot publish by falling through here.
  if (!PUBLISHABLE_SETTLEMENT_VALUES.includes(settlement)) {
    return decided(false, "execution_settlement_unknown", facts);
  }
  // Continuity and continuation are reported, never consulted: a preserved
  // server or a resumable transcript neither proves nor blocks settlement.
  return decided(true, "publishable", facts);
}

function decided(publishable, reason, facts) {
  return Object.freeze({
    publishable,
    reason,
    status: facts.status,
    nativeTurn: facts.nativeTurn,
    settlement: facts.settlement,
    continuity: facts.continuity,
    continuationMode: facts.continuationMode,
  });
}

/**
 * The one publication predicate: a terminal native turn whose turn-owned
 * execution settlement is `settled`. A turn that owns no execution world
 * still expresses that as `continuity=not_applicable` with
 * `settlement=settled` -- there is no separate "not applicable" settlement
 * value.
 *
 * @param {unknown} result
 * @returns {boolean}
 */
export function isPublishableTerminal(result) {
  return classifyTurnSettlement(result).publishable;
}

/**
 * Fail closed at a publication seam. The thrown message carries only the
 * closed reason code -- never a final message, transcript, locator, or receipt.
 *
 * @param {unknown} result
 * @param {string} label
 */
export function assertPublishableTerminal(result, label) {
  const classification = classifyTurnSettlement(result);
  if (!classification.publishable) {
    throw new Error(
      `${label} cannot publish a completion: terminal settlement is ${classification.reason}.`
    );
  }
  return classification;
}

// ---------------------------------------------------------------------------
// Version-three continuation projection.
//
// The durable Agent record and the terminal receipt both need one answer to
// "may this Agent continue its exact native transcript?", and they must not
// derive it twice. This is that single owner. It reads only the Driver's own
// `continuation` axis and the Agent's frozen route -- never execution
// continuity, never settlement, never a failure class.
// ---------------------------------------------------------------------------

/**
 * The continuation vocabulary a durable Agent record admits. `safe_fresh` is
 * deliberately absent from every value this module can return: `safe_fresh`
 * asserts that a fresh turn is safe, which is a side-effect fact, and decision
 * 7 keeps transcript continuation strictly independent of the execution world.
 * A version-three turn that cannot resume its transcript is therefore recorded
 * as `blocked` with its exact reason, never as proof that replaying the input
 * would be harmless.
 */
export const VERSION_THREE_CONTINUATION_MODES = Object.freeze(["exact_session", "blocked"]);

/** The closed reasons a version-three continuation projection may give. */
export const VERSION_THREE_CONTINUATION_REASONS = Object.freeze([
  "driver_proven_exact_resume",
  "driver_continuation_absent",
  "driver_continuation_not_exact_resume",
  "driver_continuation_reference_missing",
  "driver_continuation_reference_unreadable",
  "route_continuation_not_exact_resume",
  "route_identity_mismatch",
]);

function blockedContinuation(reason) {
  return Object.freeze({ mode: "blocked", resumable: false, reason, nativeSessionRef: null });
}

/**
 * Project one already-validated version-three normalized terminal result onto
 * the durable continuation vocabulary.
 *
 * `exact_session` requires all three of: the Driver declaring `exact_resume`,
 * a readable native session envelope, and that envelope belonging to this
 * exact route (Harness, Driver version, and logical instance). Anything else
 * is `blocked` with the reason that decided it. The returned envelope is the
 * Driver's own, unmodified -- no locator field is renamed, flattened, or
 * reinterpreted as a legacy session ID.
 *
 * @param {*} result one normalized terminal result
 * @param {*} route the Agent's frozen version-three route
 * @returns {Readonly<{mode: string, resumable: boolean, reason: string, nativeSessionRef: *}>}
 */
export function classifyVersionThreeContinuation(result, route) {
  if (!plainObject(result) || !plainObject(route)) return blockedContinuation("driver_continuation_absent");
  const continuation = dataValue(result, "continuation");
  if (!plainObject(continuation)) return blockedContinuation("driver_continuation_absent");
  const mode = closedValue(continuation, "mode", CONTINUATION_MODES);
  if (mode !== "exact_resume") return blockedContinuation("driver_continuation_not_exact_resume");
  if (dataValue(dataValue(route, "capabilities") ?? {}, "values")?.continuation !== "exact_resume") {
    return blockedContinuation("route_continuation_not_exact_resume");
  }
  const reference = dataValue(continuation, "nativeSessionRef");
  if (reference == null) return blockedContinuation("driver_continuation_reference_missing");
  if (!plainObject(reference)) return blockedContinuation("driver_continuation_reference_unreadable");
  const envelope = {};
  for (const field of ["version", "harnessId", "driverVersion", "instanceKey", "locatorVersion", "locator"]) {
    const value = dataValue(reference, field);
    if (value === undefined) return blockedContinuation("driver_continuation_reference_unreadable");
    envelope[field] = value;
  }
  if (
    envelope.harnessId !== dataValue(route, "harnessId") ||
    envelope.driverVersion !== dataValue(route, "driverVersion") ||
    envelope.instanceKey !== dataValue(route, "instanceKey")
  ) {
    return blockedContinuation("route_identity_mismatch");
  }
  return Object.freeze({
    mode: "exact_session",
    resumable: true,
    reason: "driver_proven_exact_resume",
    nativeSessionRef: envelope,
  });
}

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Internal version-three worker-loss reconciliation: Task 5.6.
 *
 * `runtime/v3-worker-loop.mjs` (Task 5.4) already proves the honest half of
 * worker loss: a lost worker records `unknown`, holds every lease, and
 * leaves the control stream open rather than synthesize a terminal fact.
 * This module owns the other half -- moving that `unknown` (or, when the
 * worker vanished before it ever ran its own unknown-exit path, a durable
 * `running` record with no live owner left at all) forward from later,
 * independent Driver evidence, exactly once.
 *
 * It is deliberately narrow and read-mostly:
 *
 *   - it never calls `Driver.startTurn()`, `deliverActiveInput()`, or
 *     `requestInterrupt()` -- it only calls the optional
 *     `Driver.observeTurn()` the accepted route's `turnObservation`
 *     capability admits;
 *   - it never invents, resumes, or reconstructs a live transport; the only
 *     Driver-owned state it touches is the exact durable `NativeTurnRef`
 *     `runtime/v3-job-store.mjs` already persisted;
 *   - it never infers `safe_fresh`, never treats a native-session reference
 *     as turn identity, and never branches on `harnessId`;
 *   - it settles a turn -- releasing leases, closing the control stream,
 *     writing the durable terminal record, projecting the Agent, and
 *     publishing completion -- only from coherent, publishable evidence that
 *     names the *exact* native turn this record already durably accepted;
 *   - every other observed shape (still active, still unknown, contradictory,
 *     a foreign turn, an unsupported/unobservable route, or a locator this
 *     Driver no longer understands) leaves every lease held and publishes
 *     nothing, exactly like the worker's own unknown exit.
 *
 * Four properties hold across every path below:
 *
 *   - the internal write generation is proven at entry, before any durable
 *     read, Driver observation, or mutation;
 *   - the durable record and the launch claim that proved its acceptance must
 *     name the same canonical route and the same exact native turn before a
 *     Driver is asked anything;
 *   - a Driver's observation is read as a closed, trap-free plain value
 *     (`validateTurnObservation()`), inside a bounded window, and a cancelled
 *     or elapsed observation is never settlement;
 *   - every durable read, write, and projection failure is one closed receipt
 *     carrying a closed code or `null` -- never an escaping error, and never
 *     a message that could name a lock file or a workspace path.
 *
 * `driver` is always the caller's, exactly like `runtime/v3-worker-loop.mjs`
 * and `runtime/v3-worker-launch.mjs`: this module never resolves one from a
 * registry, so a fresh process reconciling a lost turn uses only the static
 * in-tree Driver a real caller would already have, never a serialized live
 * handle.
 */

import {
  assertDriverRouteCoherence,
  validateDriverV2,
  validateNormalizedTerminalResult,
} from "./harness-contract.mjs";
import { createDriverScope } from "./harness-registry.mjs";
import { releaseLeasesOnSettlement } from "./instance-admission-lease.mjs";
import { readLaunchClaim } from "./launch-claim.mjs";
import { validateNativeReferenceEnvelope, sameNativeReference } from "./native-reference.mjs";
import { createAgentStore } from "./agent-store.mjs";
import { assertVersionThreeWriteAllowed, versionThreeRouteText } from "./durable-state-v3.mjs";
import { plainRecordSnapshot } from "./plain-record.mjs";
import { closeControlStreamForAttempt } from "./turn-control.mjs";
import { classifyTurnSettlement, classifyVersionThreeContinuation, NATIVE_TURN_STATES } from "./turn-settlement.mjs";
import {
  V3_TERMINAL_STATUSES,
  readVersionThreeJobRecord,
  recordVersionThreeTurnTerminal,
  reconcileVersionThreeTerminalJob,
} from "./v3-job-store.mjs";
import { buildLeaseReleaseTargets, buildVersionThreeTerminalJob } from "./v3-worker-loop.mjs";

/**
 * The bounded window one `Driver.observeTurn()` call gets when its caller
 * states no shorter deadline of its own, and the ceiling above every caller
 * deadline. A Driver that never answers must never be able to hold this
 * reconciler -- and the leases, control stream, and Agent it is deciding
 * about -- open forever.
 *
 * 30 s is this runtime's existing bound for "one durable operation may take
 * this long and no longer": `turn-control.mjs`'s `DEFAULT_CONTROL_DEADLINE_MS`,
 * `instance-admission-lease.mjs`/`job-store.mjs`'s `LOCK_ACQUIRE_TIMEOUT_MS`,
 * and `v3-worker-loop.mjs`'s `MAX_WAKE_WINDOW_MS` are all the same value.
 */
export const DEFAULT_OBSERVATION_DEADLINE_MS = 30_000;

const RECONCILIATION_INPUT_FIELDS = Object.freeze([
  "generation", "ownerRootId", "agentId", "jobId", "driver", "deadlineAt", "signal",
]);

/** Every field one `TurnObservation` may declare, and no other. */
const TURN_OBSERVATION_FIELDS = Object.freeze(["nativeTurn", "terminalResult"]);

/**
 * The closed failure vocabulary a receipt may repeat from a durable owner.
 *
 * A durable read, write, or projection failure is reported as its own closed
 * code or as `null` -- never as the underlying message, which can name a lock
 * file, a state directory, or an operator's workspace path. The set spans the
 * two durable owners this module reads (`v3-job-store.mjs` and
 * `launch-claim.mjs`) plus the platform errnos their locks and atomic writes
 * surface; anything else is honestly `null` rather than a fabricated code.
 */
const CLOSED_FAILURE_CODES = Object.freeze([
  "corrupt_record", "identity_drift", "invalid_creation", "invalid_transition",
  "multiple_launch_claims_present", "not_found", "not_publishable",
  "unsupported_state_version", "unsupported_version", "wrong_attempt",
  "conflicting_terminal", "projection_not_bound",
  "EACCES", "EBUSY", "EEXIST", "EINVAL", "EIO", "EISDIR", "ENOENT", "ENOSPC",
  "ENOTDIR", "EPERM", "ETIMEDOUT",
]);

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty text value.`);
  }
  return value;
}

function detailOf(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

/** One closed code for a durable failure, or `null`. Never free-form text. */
function closedFailureCode(error) {
  const code = typeof error?.code === "string" ? error.code : null;
  return code != null && CLOSED_FAILURE_CODES.includes(code) ? code : null;
}

/**
 * One closed, trap-free `TurnObservation` snapshot.
 *
 * `design.md` names `observeTurn?: (ref, scope) => Promise<TurnObservation>`
 * without giving that type its own field list, so this is its one owner:
 *
 *   - `nativeTurn` is the same closed `active | terminal | unknown` vocabulary
 *     every other durable owner in this runtime already shares;
 *   - `terminalResult` is required exactly when `nativeTurn === "terminal"`,
 *     and must be absent or `null` otherwise -- an "active" turn carrying a
 *     terminal payload is a contradiction, not a hint;
 *   - the payload itself is validated by the existing
 *     `validateNormalizedTerminalResult()`. There is deliberately no second
 *     terminal-result schema in this runtime.
 *
 * The value is read through `plainRecordSnapshot()`, so a Proxy is refused
 * before a single trap can run, an accessor/hidden/symbol-keyed/inherited/
 * prototype-polluting field is refused outright, and each admitted field is
 * read exactly once. What this validator saw is therefore exactly what the
 * settlement below acts on.
 */
export function validateTurnObservation(observation, label = "Turn observation") {
  const snapshot = plainRecordSnapshot(observation, label);
  for (const field of Object.keys(snapshot)) {
    if (!TURN_OBSERVATION_FIELDS.includes(field)) {
      throw new Error(`${label} declares an unknown field: ${field}.`);
    }
  }
  const nativeTurn = snapshot.nativeTurn;
  if (!NATIVE_TURN_STATES.includes(nativeTurn)) {
    throw new Error(
      `${label} must state one native turn state: ${NATIVE_TURN_STATES.join(", ")}.`
    );
  }
  const terminalResult = snapshot.terminalResult ?? null;
  if (nativeTurn === "terminal") {
    if (terminalResult == null) {
      throw new Error(`${label} of a terminal turn must carry its complete terminal result.`);
    }
  } else if (terminalResult != null) {
    throw new Error(`${label} may only carry a terminal result while nativeTurn is terminal.`);
  }
  return Object.freeze({ nativeTurn, terminalResult });
}

/** A caller deadline is bounded evidence: unparseable is refused, never widened. */
function snapshotObservationDeadline(value) {
  if (value == null) return null;
  const text = assertText(value, "Version-three worker-loss reconciliation deadlineAt");
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new Error("Version-three worker-loss reconciliation deadlineAt must be one parseable timestamp.");
  }
  return parsed;
}

function snapshotObservationSignal(value) {
  if (value == null) return null;
  if (
    typeof value !== "object" ||
    typeof value.aborted !== "boolean" ||
    typeof value.addEventListener !== "function" ||
    typeof value.removeEventListener !== "function"
  ) {
    throw new Error("Version-three worker-loss reconciliation signal must be one AbortSignal.");
  }
  return value;
}

/**
 * Run one `Driver.observeTurn()` inside a bounded window.
 *
 * Cancellation is never settlement: an aborted or elapsed observation returns
 * its own closed outcome and this module then leaves every lease held, the
 * control stream exactly as it was, and nothing published. The losing
 * observation promise is always given a rejection handler, so a Driver that
 * rejects after the window closed can never surface as an unhandled process
 * rejection, and the timer/listener this window owns are always released.
 */
async function observeWithinBoundedWindow({ driver, nativeTurnRef, buildScope, callerSignal, deadlineMs }) {
  if (callerSignal?.aborted) return { kind: "aborted" };
  const startedAt = Date.now();
  if (deadlineMs <= startedAt) return { kind: "deadline" };

  const controller = new AbortController();
  const scope = buildScope(controller.signal, new Date(deadlineMs).toISOString());
  let timer = null;
  let onAbort = null;
  const cancelled = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: "deadline" }), deadlineMs - startedAt);
    if (callerSignal) {
      onAbort = () => resolve({ kind: "aborted" });
      callerSignal.addEventListener("abort", onAbort, { once: true });
    }
  });
  try {
    const guarded = Promise.resolve(driver.observeTurn(nativeTurnRef, scope)).then(
      (value) => ({ kind: "observed", value }),
      (error) => ({ kind: "failed", error }),
    );
    const outcome = await Promise.race([guarded, cancelled]);
    // Tell the Driver its window is over; a Driver that ignores the signal
    // simply keeps working against a caller that has already stopped waiting.
    if (outcome.kind !== "observed") controller.abort();
    return outcome;
  } catch (error) {
    // `observeTurn()` threw synchronously rather than returning a promise.
    controller.abort();
    return { kind: "failed", error };
  } finally {
    clearTimeout(timer);
    if (onAbort) callerSignal.removeEventListener("abort", onAbort);
  }
}

/**
 * The one stable receipt shape every exit of this module returns.
 * @param {{reconciled?: boolean, reason: string, status?: string|null,
 *   alreadyTerminal?: boolean, observed?: string|null, leaseRelease?: *,
 *   agentProjected?: boolean, completionPublished?: boolean, detail?: string|null}} input
 */
function receipt({
  reconciled = false,
  reason,
  status = null,
  alreadyTerminal = false,
  observed = null,
  leaseRelease = null,
  agentProjected = false,
  completionPublished = false,
  detail = null,
}) {
  return Object.freeze({
    reconciled,
    reason,
    status,
    alreadyTerminal,
    observed,
    leaseRelease,
    agentProjected,
    completionPublished,
    detail,
  });
}

/**
 * Finish one settled record's durable projections, containing failure.
 *
 * A terminal record is already durable before this runs, so a projection or
 * publication that cannot be completed right now is a *retryable* fact, not a
 * lost completion: it is reported as one closed receipt and the record stays
 * exactly as it is, ready for the next reconciliation pass. Nothing here may
 * throw past this call.
 */
function projectSettledRecord(generation, record) {
  try {
    return { projection: reconcileVersionThreeTerminalJob({ generation, record }), code: null };
  } catch (error) {
    return { projection: null, code: closedFailureCode(error) };
  }
}

/**
 * Reconcile one lost version-three worker's turn from later Driver evidence.
 *
 * Idempotent and restart-safe: a record that is already terminal is only
 * (re-)projected via the existing `reconcileVersionThreeTerminalJob()` seam,
 * never re-observed, re-leased, or re-published. A record this call cannot
 * move forward is left exactly as it was -- every affected lease stays held,
 * the control stream stays exactly as open or closed as it already was, and
 * nothing is published -- and the closed `reason` says why.
 *
 * `deadlineAt`/`signal` are optional and bound only the Driver observation:
 * they are a caller's own cancellation, never a durable fact and never a
 * reason to settle, release, or publish anything.
 *
 * @param {{generation: *, ownerRootId: string, agentId: string, jobId: string,
 *   driver: *, deadlineAt?: string|null, signal?: *}} input
 */
export async function reconcileVersionThreeWorkerLoss(input) {
  // The input itself is snapshotted trap-free before any field is used, so a
  // caller cannot show this function one generation, identity, or Driver and
  // the durable owners below another.
  const snapshot = plainRecordSnapshot(input, "Version-three worker-loss reconciliation input");
  for (const key of Object.keys(snapshot)) {
    if (!RECONCILIATION_INPUT_FIELDS.includes(key)) {
      throw new Error(`Version-three worker-loss reconciliation input declares an unsupported field: ${key}.`);
    }
  }
  // Proven first, before any durable read, Driver observation, or mutation:
  // every write this function can reach belongs to the internal future
  // generation, so a public/absent/bogus generation must never reach a
  // Driver at all, let alone a durable owner.
  const generation = assertVersionThreeWriteAllowed(
    snapshot.generation, "Version-three worker-loss reconciliation"
  );
  const driver = snapshot.driver;
  const ownerRootId = assertText(snapshot.ownerRootId, "Version-three worker-loss reconciliation ownerRootId");
  const agentId = assertText(snapshot.agentId, "Version-three worker-loss reconciliation agentId");
  const jobId = assertText(snapshot.jobId, "Version-three worker-loss reconciliation jobId");
  const callerDeadlineMs = snapshotObservationDeadline(snapshot.deadlineAt);
  const callerSignal = snapshotObservationSignal(snapshot.signal);
  const identity = { ownerRootId, agentId, jobId };

  let record;
  try {
    record = readVersionThreeJobRecord(identity);
  } catch (error) {
    // A corrupt or identity-drifted durable record is a closed fact this call
    // reports, never an error escaping into a caller that has no receipt to
    // act on. Nothing is observed, released, or published.
    return receipt({ reason: "record_unreadable", detail: closedFailureCode(error) });
  }
  if (!record) return receipt({ reason: "record_not_found" });

  if (V3_TERMINAL_STATUSES.includes(record.status)) {
    const { projection, code } = projectSettledRecord(generation, record);
    if (!projection) {
      return receipt({
        reason: "projection_failed", status: record.status, alreadyTerminal: true, detail: code,
      });
    }
    return receipt({
      // `reconcileVersionThreeTerminalJob()`'s own `reconciled` means "this
      // call performed fresh projection work", so it is deliberately `false`
      // for its `already_reconciled` no-op. This module's `reconciled` means
      // "this record is now durably settled and projected", which
      // `agentProjected && completionPublished` states in every case.
      reconciled: projection.agentProjected && projection.completionPublished,
      reason: projection.reason,
      status: record.status,
      alreadyTerminal: true,
      agentProjected: projection.agentProjected,
      completionPublished: projection.completionPublished,
    });
  }
  if (record.status !== "running" && record.status !== "unknown") {
    return receipt({ reason: "not_reconcilable", status: record.status });
  }

  let launchClaim;
  try {
    launchClaim = readLaunchClaim(identity);
  } catch (error) {
    return receipt({ reason: "launch_claim_unreadable", status: record.status, detail: closedFailureCode(error) });
  }
  if (!launchClaim) return receipt({ reason: "launch_claim_not_found", status: record.status });
  if (launchClaim.attemptId !== record.attemptId) {
    return receipt({ reason: "attempt_mismatch", status: record.status });
  }
  if (launchClaim.acceptance !== "acceptance_proven") {
    return receipt({ reason: "acceptance_not_proven", status: record.status });
  }

  // The record and the launch claim that proved its acceptance are two
  // durable facts written by two different owners. Only where they agree
  // byte for byte -- the same canonical route, the same exact native turn --
  // does this call have proof of *which* turn it may ask a Driver about and
  // later settle. A record whose route or native turn was corrupted or
  // forged after acceptance is refused here, before anything is observed,
  // released, closed, or projected. Both comparisons are canonical, so a
  // locator restating the same values in another key order is still the same
  // turn (`native-reference.mjs` owns that identity).
  let routesAgree;
  try {
    routesAgree = versionThreeRouteText(launchClaim.route, "Launch claim route")
      === versionThreeRouteText(record.route, "Version-three job record route");
  } catch (error) {
    return receipt({ reason: "route_not_canonical", status: record.status, detail: closedFailureCode(error) });
  }
  if (!routesAgree) {
    return receipt({ reason: "launch_claim_route_mismatch", status: record.status });
  }
  if (!sameNativeReference(
    launchClaim.nativeTurnRef, record.nativeTurnRef, "Version-three worker-loss reconciliation launch claim"
  )) {
    return receipt({ reason: "launch_claim_native_turn_mismatch", status: record.status });
  }

  try {
    validateDriverV2(driver);
  } catch (error) {
    return receipt({ reason: "driver_invalid", status: record.status, detail: detailOf(error) });
  }
  if (driver.harnessId !== record.route.harnessId || driver.driverVersion !== record.route.driverVersion) {
    return receipt({ reason: "driver_route_mismatch", status: record.status });
  }
  try {
    assertDriverRouteCoherence(driver, record.route.capabilities);
  } catch (error) {
    return receipt({ reason: "driver_route_incoherent", status: record.status, detail: detailOf(error) });
  }

  if (record.route.capabilities?.values?.turnObservation !== "terminal_observable" || typeof driver.observeTurn !== "function") {
    return receipt({ reason: "turn_observation_unavailable", status: record.status });
  }

  // Re-validate the durable locator through the Driver's own exact-schema
  // validator before ever asking it about the turn: a Driver that no longer
  // understands an old locator version fails closed here, exactly like every
  // other seam that consumes a persisted `NativeTurnRef`.
  let nativeTurnRef;
  try {
    nativeTurnRef = validateNativeReferenceEnvelope(record.nativeTurnRef, { driver, kind: "turn", route: record.route });
  } catch (error) {
    return receipt({ reason: "native_turn_reference_unsupported", status: record.status, detail: detailOf(error) });
  }

  const buildScope = (signal, deadlineAt) => createDriverScope({
    driver,
    purpose: "turn",
    rootId: ownerRootId,
    agentId,
    turnId: jobId,
    attemptId: record.attemptId,
    route: record.route,
    taskInput: null,
    assignedInputs: [],
    workspaceRoot: record.workspaceRoot,
    deadlineAt,
    signal,
    env: {},
  });

  // The window is the caller's own deadline when it states a shorter one, and
  // the named default otherwise -- never longer than the default, so no
  // caller can turn one observation into an unbounded wait.
  const deadlineMs = Math.min(
    callerDeadlineMs ?? Number.POSITIVE_INFINITY,
    Date.now() + DEFAULT_OBSERVATION_DEADLINE_MS,
  );
  const outcome = await observeWithinBoundedWindow({
    driver, nativeTurnRef, buildScope, callerSignal, deadlineMs,
  });
  if (outcome.kind === "aborted") {
    return receipt({ reason: "observation_aborted", status: record.status });
  }
  if (outcome.kind === "deadline") {
    return receipt({ reason: "observation_deadline_exceeded", status: record.status });
  }
  if (outcome.kind === "failed") {
    return receipt({ reason: "observation_failed", status: record.status, detail: detailOf(outcome.error) });
  }

  let observation;
  try {
    observation = validateTurnObservation(outcome.value, `Harness ${driver.harnessId} turn observation`);
  } catch {
    return receipt({ reason: "invalid_observation", status: record.status });
  }
  if (observation.nativeTurn !== "terminal") {
    return receipt({
      reason: observation.nativeTurn === "active" ? "native_turn_active" : "native_turn_unknown",
      status: record.status,
      observed: observation.nativeTurn,
    });
  }

  let normalizedResult;
  try {
    normalizedResult = validateNormalizedTerminalResult(observation.terminalResult, { driver, route: record.route });
  } catch (error) {
    return receipt({ reason: "invalid_terminal_result", status: record.status, observed: "terminal", detail: detailOf(error) });
  }
  if (!sameNativeReference(normalizedResult.nativeTurnRef, record.nativeTurnRef, "Version-three worker-loss reconciliation terminal result")) {
    return receipt({ reason: "terminal_result_native_turn_mismatch", status: record.status, observed: "terminal" });
  }
  const classification = classifyTurnSettlement(normalizedResult);
  if (!classification.publishable) {
    return receipt({ reason: classification.reason, status: record.status, observed: "terminal" });
  }

  // Coherent, publishable, exact-turn-matching terminal evidence: settle
  // through the same fixed order the live worker uses -- quiesce, close
  // control, release leases, then the durable terminal record -- so a
  // failure at any step before that record exists leaves this record exactly
  // where it was rather than half-settled.
  const agentStore = createAgentStore({ cwd: record.workspaceRoot, ownerRootId, writeGeneration: generation });
  try {
    const quiesce = agentStore.quiesceVersionThreeTurn(agentId, jobId, { attemptId: record.attemptId });
    if (!quiesce.quiesced) {
      // A concurrent settler -- the live worker itself, or another
      // reconciliation attempt racing the same evidence -- may already have
      // won and fully finalized this Agent between this call's initial read
      // and this exact step, which is exactly what durably clears
      // `activeJobId`. That is this module's "exactly once" guarantee, not a
      // failure this call should report as one: converge to the winner's
      // durable fact instead.
      let raced = null;
      if (quiesce.reason === "not_active_owner") {
        try {
          raced = readVersionThreeJobRecord(identity);
        } catch (error) {
          return receipt({
            reason: "record_unreadable", status: record.status, observed: "terminal", detail: closedFailureCode(error),
          });
        }
      }
      if (raced && V3_TERMINAL_STATUSES.includes(raced.status)) {
        const { projection, code } = projectSettledRecord(generation, raced);
        if (!projection) {
          return receipt({
            reason: "projection_failed", status: raced.status, alreadyTerminal: true, observed: "terminal", detail: code,
          });
        }
        return receipt({
          reconciled: projection.agentProjected && projection.completionPublished,
          reason: projection.reason,
          status: raced.status,
          alreadyTerminal: true,
          observed: "terminal",
          agentProjected: projection.agentProjected,
          completionPublished: projection.completionPublished,
        });
      }
      return receipt({ reason: `quiesce_${quiesce.reason}`, status: record.status, observed: "terminal" });
    }
  } catch (error) {
    return receipt({ reason: "quiesce_failed", status: record.status, observed: "terminal", detail: detailOf(error) });
  }

  try {
    closeControlStreamForAttempt({
      ownerRootId, agentId, jobId,
      route: record.route,
      nativeTurnRef: record.nativeTurnRef,
      workerAttemptId: record.attemptId,
      normalizedTerminalResult: normalizedResult,
    });
  } catch (error) {
    return receipt({ reason: "control_stream_not_closed", status: record.status, observed: "terminal", detail: detailOf(error) });
  }

  // The durable launch claim's own `leaseBindings` stores each binding's
  // `keyFields`/`capacity` verbatim from the original acquisition evidence,
  // but only a `routeDigest`, never the route object itself -- proven
  // identical to this record's own `route` at claim-creation time
  // (`leaseBindingReceipt()`'s own coherence check), so substituting it back
  // in is exact, not an approximation.
  let release;
  try {
    release = releaseLeasesOnSettlement({
      normalizedTerminalResult: normalizedResult,
      releases: buildLeaseReleaseTargets(
        launchClaim.leaseBindings.map((binding) => ({ ...binding, route: record.route }))
      ),
    });
  } catch (error) {
    return receipt({ reason: "lease_release_failed", status: record.status, observed: "terminal", detail: detailOf(error) });
  }
  const leaseRelease = {
    outcome: release.outcome,
    releasedCount: release.releasedCount,
    alreadyReleasedCount: release.alreadyReleasedCount,
    retainedCount: release.retainedCount ?? 0,
    unknownCount: release.unknownCount ?? 0,
    failures: (release.failures ?? []).map((failure) => ({ ...failure })),
  };
  if (release.outcome !== "all") {
    return receipt({
      reason: `lease_release_${release.outcome}`, status: record.status, observed: "terminal", leaseRelease,
    });
  }

  const continuationProjection = classifyVersionThreeContinuation(normalizedResult, record.route);
  const terminalJob = buildVersionThreeTerminalJob(
    { jobId, agentId, ownerRootId, attemptId: record.attemptId, route: record.route },
    { nativeTurnRef: record.nativeTurnRef },
    normalizedResult,
    continuationProjection,
  );

  let settledRecord;
  try {
    settledRecord = recordVersionThreeTurnTerminal({
      generation, ownerRootId, agentId, jobId, attemptId: record.attemptId, terminalJob,
    });
  } catch (error) {
    if (error?.code === "conflicting_terminal") {
      // Another settler -- the live worker itself, or a concurrent
      // reconciliation attempt -- already won this exact record with its own
      // (necessarily different `completedAt`) terminal fact. That is this
      // module's own "exactly once" guarantee working as designed, not a
      // failure: converge to the durable fact that actually won rather than
      // report an error for a race this module is required to survive.
      try {
        settledRecord = readVersionThreeJobRecord(identity);
      } catch (readError) {
        return receipt({
          reason: "record_unreadable", status: record.status, observed: "terminal",
          detail: closedFailureCode(readError), leaseRelease,
        });
      }
    } else {
      return receipt({
        reason: "terminal_record_not_durable", status: record.status, observed: "terminal", detail: detailOf(error), leaseRelease,
      });
    }
  }

  const { projection, code } = projectSettledRecord(generation, settledRecord);
  if (!projection) {
    return receipt({
      reason: "projection_failed", status: settledRecord.status, observed: "terminal", leaseRelease, detail: code,
    });
  }
  return receipt({
    reconciled: projection.agentProjected && projection.completionPublished,
    reason: projection.reason,
    status: settledRecord.status,
    observed: "terminal",
    leaseRelease,
    agentProjected: projection.agentProjected,
    completionPublished: projection.completionPublished,
  });
}

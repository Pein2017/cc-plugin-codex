/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Durable turn control commands: the state machine `design.md` decision 6
 * requires before any live worker loop exists.
 *
 * A control command (currently only `interrupt`) has three independent closed
 * axes -- request acknowledgement (`none|accepted|rejected|unsupported`),
 * settlement (`pending|settled|unknown`), and native turn state
 * (`active|terminal|unknown`, the exact vocabulary `runtime/turn-settlement.mjs`
 * already owns). Accepting a request is evidence that a live Driver received
 * it; it is never itself terminal, and it never rewrites settlement or native
 * turn state -- including the `unsupported` disposition, which records only
 * the request axis and leaves the other two exactly as they were.
 *
 * This module is the narrow single owner of that record's durable schema and
 * atomic engine, following the exact owner-only directory-lock/atomic-write
 * conventions `runtime/instance-admission-lease.mjs` established. It has no
 * dependency on any Driver module: `enqueueControlCommand()` is the only
 * surface an isolated MCP-call-scoped caller may use, and it does no more than
 * durably append a command and let the append itself be the wake signal a
 * waiter observes via `runtime/durable-activity-wakeup.mjs`. Nothing here
 * calls a Driver, signals a process, releases a lease, publishes completion,
 * changes Agent continuity, or synthesizes terminal evidence -- every
 * settlement/native-turn transition only classifies evidence a caller already
 * has, using the exact same `classifyTurnSettlement()` predicate
 * `runtime/completion-inbox.mjs` gates publication with, so this module's
 * vocabulary can never drift from that one's.
 *
 * Only the future detached worker (Task 5.4) may call `claimControlCommand()`/
 * `recordRequestAcknowledgement()` for real, after it has actually invoked a
 * process-local `LiveHarnessTurn.requestInterrupt()`. This module exposes the
 * recording primitives that call will need; it does not perform that call.
 *
 * A claim is exclusive, not a liveness lease: once one worker attempt claims
 * a command, a *different* attempt ID cannot claim it while that claim
 * exists (proving a prior worker actually disappeared, and transferring its
 * claim, is a Task 5B durable worker-loss/handoff proof this module does not
 * have and must not invent). `recordRequestAcknowledgement()` and
 * `recordControlSettlement()` both require the exact claiming
 * `workerAttemptId` and refuse an unclaimed or cross-attempt call
 * identically, so two different `workerAttemptId` values can never both
 * invoke or record one command's outcome *provided* every caller uses a
 * `workerAttemptId` that genuinely and durably identifies one worker
 * attempt.
 *
 * This module's own exports are plain functions, not process-bound: nothing
 * here checks which OS process, MCP call, or CLI invocation is calling.
 * `enqueueControlCommand()`/`expireControlCommandDeadline()`/reads remaining
 * separate from `claimControlCommand()`/`recordRequestAcknowledgement()`/
 * `recordControlSettlement()` is a documented calling convention this module
 * enforces at the *data* level (the claim-exclusivity/exact-attempt checks
 * above), not a structural guarantee that an isolated MCP-call-scoped caller
 * cannot literally call the worker-only functions in-process. Task 5B's
 * wiring is what must (a) keep the isolated `interrupt_agent` path calling
 * only the isolated-caller surface and (b) mint `workerAttemptId` from the
 * durable launch-claim/attempt identity Task 5.3 introduces, not from an
 * ad hoc value a caller invents -- only then does the exact-attempt check
 * above amount to "the exact detached worker that owns this job's native
 * turn", rather than merely "the same string twice".
 */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { types } from "node:util";

import { validateVersionThreeRoute } from "./durable-state-v3.mjs";
import {
  assertNativeReferenceEnvelopeShape,
  assertNativeReferenceLocatorShape,
  canonicalNativeReferenceText,
} from "./native-reference.mjs";
import { resolvePluginStateRoot } from "./paths.mjs";
import { plainRecordSnapshot } from "./plain-record.mjs";
import {
  getProcessIdentity,
  isProcessAlive,
  validateProcessIdentity,
} from "./process-control.mjs";
import { classifyTurnSettlement, NATIVE_TURN_STATES } from "./turn-settlement.mjs";

export const CONTROL_SCHEMA_VERSION = 1;

/** The only command kind this generation admits. Closed so a later kind is an explicit addition, not silent widening. */
export const CONTROL_COMMAND_KINDS = Object.freeze(["interrupt"]);

/** Request acknowledgement: whether a live Driver received the request at all. Never terminal by itself. */
export const CONTROL_REQUEST_STATES = Object.freeze(["none", "accepted", "rejected", "unsupported"]);

/**
 * Command settlement: whether valid native terminal evidence has arrived for
 * *this* command. Deliberately a distinct three-value vocabulary from
 * `runtime/turn-settlement.mjs`'s execution-world `settled|active|unknown` --
 * `pending` here means "no request/settlement has settled yet", not "the
 * execution world is actively running"; collapsing the two would let a
 * request-only fact stand in for terminal evidence.
 */
export const CONTROL_SETTLEMENT_VALUES = Object.freeze(["pending", "settled", "unknown"]);

const MIN_CONTROL_DEADLINE_MS = 1_000;
const MAX_CONTROL_DEADLINE_MS = 300_000;
export const DEFAULT_CONTROL_DEADLINE_MS = 30_000;

const MAX_IDENTITY_TEXT_BYTES = 256;
const MAX_COMMAND_ID_BYTES = 256;
const MAX_REASON_BYTES = 512;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// C0/C1 controls plus the soft hyphen, zero-width, bidi-override, and
// byte-order-mark ranges -- identical to the bound `runtime/durable-state-v3.mjs`
// and `runtime/instance-admission-lease.mjs` already enforce for identity text.
// eslint-disable-next-line no-control-regex
const UNSTABLE_TEXT_PATTERN = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;

function nowIso() {
  return new Date().toISOString();
}

function taggedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertIdentityText(value, label, maxBytes = MAX_IDENTITY_TEXT_BYTES) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be non-empty text.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not carry leading or trailing whitespace.`);
  }
  if (UNSTABLE_TEXT_PATTERN.test(value)) {
    throw new Error(`${label} must not contain control or format characters.`);
  }
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new Error(`${label} exceeds its durable bound.`);
  }
  return value;
}

function assertCommandId(value) {
  if (typeof value !== "string" || !COMMAND_ID_PATTERN.test(value)) {
    throw new Error(`Control command ID must be bounded identity text: ${JSON.stringify(value ?? null)}.`);
  }
  if (Buffer.byteLength(value, "utf8") > MAX_COMMAND_ID_BYTES) {
    throw new Error("Control command ID exceeds its durable bound.");
  }
  return value;
}

function assertCommandKind(value) {
  if (!CONTROL_COMMAND_KINDS.includes(value)) {
    throw new Error(
      `Unsupported control command kind: ${JSON.stringify(value ?? null)}. Use one of: ${CONTROL_COMMAND_KINDS.join(", ")}.`
    );
  }
  return value;
}

function assertFromClosedSet(value, key, values, label) {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(
      `${label} has an unsupported ${key}: ${JSON.stringify(value ?? null)}. Use one of: ${values.join(", ")}.`
    );
  }
  return value;
}

function assertTimestampText(value, label) {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`${label} must be an exact ISO-8601 millisecond timestamp.`);
  }
  return value;
}

function assertOptionalTimestampText(value, label) {
  if (value === null) return null;
  return assertTimestampText(value, label);
}

function assertOptionalIdentityText(value, label) {
  if (value === null) return null;
  return assertIdentityText(value, label);
}

function assertOptionalReasonText(value, label) {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be text or null.`);
  if (UNSTABLE_TEXT_PATTERN.test(value)) {
    throw new Error(`${label} must not contain control or format characters.`);
  }
  if (Buffer.byteLength(value, "utf8") > MAX_REASON_BYTES) {
    throw new Error(`${label} exceeds its durable bound.`);
  }
  return value;
}

/** @param {Record<string, *>} candidate */
function assertBindingIdentity({ ownerRootId, agentId, jobId }) {
  return {
    ownerRootId: assertIdentityText(ownerRootId, "Control command owner root ID"),
    agentId: assertIdentityText(agentId, "Control command Agent ID"),
    jobId: assertIdentityText(jobId, "Control command job ID"),
  };
}

/**
 * Validate and canonicalize a native turn reference for control-command
 * binding: exact core-owned envelope shape (never a Driver-recognized
 * `locatorVersion`, matching the same honestly-narrow scope
 * `runtime/instance-admission-lease.mjs` documents) plus the full bounded,
 * exotic/secret-free locator shape -- this module persists locator content
 * fresh from caller input, unlike lease release which only re-checks
 * already-vetted evidence, so it applies the stronger of the two existing
 * checks rather than the weaker one.
 */
function canonicalizeNativeTurnRef(nativeTurnRef, label) {
  const snapshot = assertNativeReferenceEnvelopeShape(nativeTurnRef, label);
  const canonicalLocator = assertNativeReferenceLocatorShape(snapshot.locator, label);
  return Object.freeze({
    version: snapshot.version,
    harnessId: snapshot.harnessId,
    driverVersion: snapshot.driverVersion,
    instanceKey: snapshot.instanceKey,
    locatorVersion: snapshot.locatorVersion,
    locator: canonicalLocator,
  });
}

/**
 * The order-independent identity text of one native turn reference. Every
 * comparison in this module uses it, so a command's bound reference and a
 * caller's reference are compared as values.
 */
function nativeTurnRefIdentityText(nativeTurnRef, label = "Control command native turn reference") {
  return canonicalNativeReferenceText(nativeTurnRef, label);
}

/**
 * A control command's native turn reference must belong to the exact route it
 * is bound to -- the same "the key must be the truth the route already
 * states" rule `assertKeyFieldsMatchRoute()` enforces for a lease.
 */
function assertNativeTurnRefMatchesRoute(nativeTurnRef, route, label) {
  if (nativeTurnRef.harnessId !== route.harnessId || nativeTurnRef.instanceKey !== route.instanceKey) {
    throw new Error(
      `${label} native turn reference belongs to Harness ${JSON.stringify(nativeTurnRef.harnessId)}/instance ` +
      `${JSON.stringify(nativeTurnRef.instanceKey)}, which does not match its bound route.`
    );
  }
}

function assertDeadlineMs(value) {
  if (!Number.isFinite(value) || value < MIN_CONTROL_DEADLINE_MS || value > MAX_CONTROL_DEADLINE_MS) {
    throw new Error(
      `Control command deadline must be between ${MIN_CONTROL_DEADLINE_MS} and ${MAX_CONTROL_DEADLINE_MS} ms.`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// On-disk layout and owner-only atomic primitives. This mirrors, file for
// file, the mutex pattern `runtime/instance-admission-lease.mjs` already
// established (0700 directories, `wx`-then-`linkSync` lock publication,
// fsync, stale-lock recovery keyed to process identity): a distinct narrow
// module still reuses the exact convention rather than a divergent one.
// ---------------------------------------------------------------------------

function resolveControlRoot() {
  return path.join(resolvePluginStateRoot(), "control", `v${CONTROL_SCHEMA_VERSION}`);
}

function streamDigest({ ownerRootId, agentId, jobId }) {
  return createHash("sha256").update(`${ownerRootId}\0${agentId}\0${jobId}`).digest("hex");
}

/**
 * The durable directory backing one job's control command stream. Exported so
 * a future durable-wake waiter (the detached worker's own command loop, or an
 * isolated `interrupt_agent` caller checking for a wake hint) can add it to
 * `waitForDurableActivity()`'s `desiredPaths` without reaching into this
 * module's private layout. Every call -- read or write -- resolves the same
 * live, env-configured production state root; there is no override parameter,
 * unlike `instance-admission-lease.mjs`'s read-only inventory (which has a
 * genuine second caller, `operator-diagnostics.mjs`, needing an explicit
 * root). Nothing in this module has that second caller, so this function
 * never accepted a real override in the first place -- its prior optional
 * `stateRoot` parameter was dead code and has been removed.
 */
export function resolveControlStreamDirectory({ ownerRootId, agentId, jobId }) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  return path.join(resolveControlRoot(), streamDigest(identity));
}

function commandFileName(commandId) {
  return `${createHash("sha256").update(commandId).digest("hex")}.json`;
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try { fs.chmodSync(directory, 0o700); } catch { /* best effort */ }
  }
  return directory;
}

const LOCK_ACQUIRE_TIMEOUT_MS = 30_000;
const LOCK_IDENTITY_FAILURE_GRACE_MS = 1_000;
const LOCK_RETRY_MIN_DELAY_MS = 10;
const LOCK_RETRY_MAX_DELAY_MS = 50;

function sleepSync(ms) {
  const bounded = Math.max(0, Math.min(Number(ms) || 0, 1_000));
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, bounded);
}

function sameFileIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function recoverStaleDirectoryLock(lockFile) {
  if (!fs.existsSync(lockFile)) return false;
  let observedStat = null;
  try {
    observedStat = fs.statSync(lockFile);
    const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    const ageMs = Date.now() - Number(lockData.timestamp ?? observedStat.mtimeMs);
    const ownerPid = Number(lockData.pid);
    const ownerAlive = Number.isSafeInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid);
    const ownerMatch = lockData.identity != null && validateProcessIdentity(ownerPid, lockData.identity);
    const transientProbeGrace = ownerAlive && Number.isFinite(ageMs) && ageMs <= LOCK_IDENTITY_FAILURE_GRACE_MS;
    if (ownerMatch || transientProbeGrace) return false;
  } catch { /* fall through to reclaim */ }
  try {
    const currentStat = fs.statSync(lockFile);
    if (observedStat && !sameFileIdentity(observedStat, currentStat)) return false;
    fs.unlinkSync(lockFile);
    return true;
  } catch {
    return false;
  }
}

function acquireDirectoryLock(directory) {
  ensureDirectory(directory);
  const lockFile = path.join(directory, ".lock");
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  while (true) {
    recoverStaleDirectoryLock(lockFile);
    const token = randomBytes(16).toString("hex");
    const candidateFile = `${lockFile}.${process.pid}.${token}.candidate`;
    let fd = null;
    try {
      fd = fs.openSync(candidateFile, "wx", 0o600);
      let identity = null;
      try { identity = getProcessIdentity(process.pid); } catch { /* best effort */ }
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, identity, token, timestamp: Date.now() }), "utf8");
      fs.fsyncSync(fd);
      const stat = fs.fstatSync(fd);
      fs.linkSync(candidateFile, lockFile);
      fs.unlinkSync(candidateFile);
      fs.closeSync(fd);
      return { lockFile, token, stat };
    } catch (error) {
      if (fd != null) { try { fs.closeSync(fd); } catch { /* best effort */ } }
      try { fs.unlinkSync(candidateFile); } catch { /* best effort */ }
      if (error?.code === "EEXIST" && Date.now() < deadline) {
        sleepSync(LOCK_RETRY_MIN_DELAY_MS + Math.random() * (LOCK_RETRY_MAX_DELAY_MS - LOCK_RETRY_MIN_DELAY_MS));
        continue;
      }
      if (error?.code === "EEXIST") {
        throw Object.assign(new Error(`Timed out acquiring control command directory lock ${lockFile}.`), { code: "ETIMEDOUT" });
      }
      throw error;
    }
  }
}

function releaseDirectoryLock(lock) {
  if (!lock) return;
  try {
    const stat = fs.statSync(lock.lockFile);
    const data = JSON.parse(fs.readFileSync(lock.lockFile, "utf8"));
    if (sameFileIdentity(lock.stat, stat) && data?.token === lock.token) fs.unlinkSync(lock.lockFile);
  } catch { /* best effort */ }
}

function writeAtomicCommandFile(filePath, data, { createOnly = false } = {}) {
  const directory = path.dirname(filePath);
  const temporary = path.join(
    directory,
    `${path.basename(filePath)}.tmp.${process.pid}.${Date.now().toString(36)}.${randomBytes(4).toString("hex")}`
  );
  let fd = null;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (createOnly) {
      fs.linkSync(temporary, filePath);
      fs.unlinkSync(temporary);
    } else {
      fs.renameSync(temporary, filePath);
    }
    if (process.platform !== "win32") {
      try { fs.chmodSync(filePath, 0o600); } catch { /* best effort */ }
    }
  } catch (error) {
    if (fd != null) { try { fs.closeSync(fd); } catch { /* best effort */ } }
    try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Closed durable command-record validator. Every record this module writes is
// also read back through this exact validator (see `enqueueControlCommand()`),
// so persistence never diverges from what a later read accepts. A corrupt,
// partial, or identity-drifted record is refused before it can be claimed or
// acted on, and it is never deleted -- corruption fails closed, not silently
// repaired or replaced.
// ---------------------------------------------------------------------------

const CONTROL_COMMAND_FIELDS = Object.freeze([
  "version", "commandId", "kind", "sequence",
  "ownerRootId", "agentId", "jobId", "route", "nativeTurnRef",
  "requestedAt", "deadlineAt",
  "requestState", "settlement", "nativeTurnState",
  "lastEvidenceAt", "sanitizedReason",
  "claimedByAttemptId", "claimedAt", "acknowledgedAt",
  "createdAt", "updatedAt",
]);

function assertClosedFieldSet(snapshot, expectedFields, label) {
  for (const field of Object.keys(snapshot)) {
    if (!expectedFields.includes(field)) throw new Error(`${label} declares an unknown field: ${field}.`);
  }
  for (const field of expectedFields) {
    if (!(field in snapshot)) throw new Error(`${label} is missing required field: ${field}.`);
  }
}

function validateControlCommandRecord(parsed) {
  const label = "Control command record";
  const snapshot = plainRecordSnapshot(parsed, label);
  assertClosedFieldSet(snapshot, CONTROL_COMMAND_FIELDS, label);
  if (snapshot.version !== CONTROL_SCHEMA_VERSION) {
    throw taggedError(
      "unsupported_version",
      `${label} declares unsupported schema version ${JSON.stringify(snapshot.version ?? null)}.`
    );
  }
  const commandId = assertCommandId(snapshot.commandId);
  const kind = assertCommandKind(snapshot.kind);
  if (!Number.isInteger(snapshot.sequence) || snapshot.sequence < 1) {
    throw new Error(`${label} sequence must be a positive integer.`);
  }
  const identity = assertBindingIdentity(snapshot);
  const route = validateVersionThreeRoute(snapshot.route, `${label} route`);
  const nativeTurnRef = canonicalizeNativeTurnRef(snapshot.nativeTurnRef, `${label} native turn reference`);
  assertNativeTurnRefMatchesRoute(nativeTurnRef, route, label);
  const requestedAt = assertTimestampText(snapshot.requestedAt, `${label} requestedAt`);
  const deadlineAt = assertTimestampText(snapshot.deadlineAt, `${label} deadlineAt`);
  const requestState = assertFromClosedSet(snapshot.requestState, "requestState", CONTROL_REQUEST_STATES, label);
  const settlement = assertFromClosedSet(snapshot.settlement, "settlement", CONTROL_SETTLEMENT_VALUES, label);
  const nativeTurnState = assertFromClosedSet(snapshot.nativeTurnState, "nativeTurnState", NATIVE_TURN_STATES, label);
  const lastEvidenceAt = assertOptionalTimestampText(snapshot.lastEvidenceAt, `${label} lastEvidenceAt`);
  const sanitizedReason = assertOptionalReasonText(snapshot.sanitizedReason, `${label} sanitizedReason`);
  const claimedByAttemptId = assertOptionalIdentityText(snapshot.claimedByAttemptId, `${label} claimedByAttemptId`);
  const claimedAt = assertOptionalTimestampText(snapshot.claimedAt, `${label} claimedAt`);
  const acknowledgedAt = assertOptionalTimestampText(snapshot.acknowledgedAt, `${label} acknowledgedAt`);
  const createdAt = assertTimestampText(snapshot.createdAt, `${label} createdAt`);
  const updatedAt = assertTimestampText(snapshot.updatedAt, `${label} updatedAt`);
  return Object.freeze({
    version: CONTROL_SCHEMA_VERSION,
    commandId,
    kind,
    sequence: snapshot.sequence,
    ownerRootId: identity.ownerRootId,
    agentId: identity.agentId,
    jobId: identity.jobId,
    route,
    nativeTurnRef,
    requestedAt,
    deadlineAt,
    requestState,
    settlement,
    nativeTurnState,
    lastEvidenceAt,
    sanitizedReason,
    claimedByAttemptId,
    claimedAt,
    acknowledgedAt,
    createdAt,
    updatedAt,
  });
}

/**
 * Read and validate one durable command record. Beyond
 * `validateControlCommandRecord()` itself, this additionally proves the
 * record was not moved, copied, or hand-placed somewhere other than the exact
 * directory/filename its own identity derives. A parse, shape, or drift
 * failure throws with a closed `.code` rather than being silently skipped or
 * deleted.
 */
function readCommandFile(filePath, streamDir) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw taggedError("corrupt_or_unreadable", `Control command record ${filePath} is unreadable: ${error?.message ?? error}.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw taggedError("corrupt_json", `Control command record ${filePath} is corrupt: invalid JSON.`);
  }
  let record;
  try {
    record = validateControlCommandRecord(parsed);
  } catch (error) {
    throw taggedError(error.code ?? "invalid_shape", `Control command record ${filePath} is corrupt: ${error.message}`);
  }
  const expectedDir = resolveControlStreamDirectory(record);
  const expectedFile = path.join(expectedDir, commandFileName(record.commandId));
  if (streamDir !== expectedDir || filePath !== expectedFile) {
    throw taggedError(
      "identity_drift",
      `Control command record ${filePath} does not live at the directory/filename its own identity derives.`
    );
  }
  return record;
}

function readCommandFiles(streamDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(streamDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    // The stream closure marker lives in this directory but is not a command.
    if (entry.name === CLOSURE_FILE_NAME) continue;
    records.push(readCommandFile(path.join(streamDir, entry.name), streamDir));
  }
  return records;
}

function assertSameCommandIdentity(record, { kind, ownerRootId, agentId, jobId, routeText, nativeTurnRefText }) {
  if (
    record.kind !== kind ||
    record.ownerRootId !== ownerRootId ||
    record.agentId !== agentId ||
    record.jobId !== jobId ||
    JSON.stringify(record.route) !== routeText ||
    // Identity by validated value, never by key insertion order: a Driver may
    // rebuild the same locator from a different service response and emit its
    // fields in a different order without naming a different turn.
    nativeTurnRefIdentityText(record.nativeTurnRef) !== nativeTurnRefText
  ) {
    throw new Error(
      `Control command ${record.commandId} identity mismatch: this command may only be read, claimed, or ` +
      `settled by the exact kind, owner root, Agent, job, route, and native turn reference that created it.`
    );
  }
}

function compareBySequence(left, right) {
  return left.sequence - right.sequence;
}

// ---------------------------------------------------------------------------
// Isolated-caller surface: the only entry point an MCP-call-scoped caller
// (for example `interrupt_agent`) may use. It durably appends a command and
// returns; the directory write it performs is the entire wake mechanism a
// `waitForDurableActivity()` watcher on `resolveControlStreamDirectory()`
// observes. It never calls a Driver.
// ---------------------------------------------------------------------------

/**
 * The exact, closed set of fields `enqueueControlCommand()` accepts.
 * `nativeTurnState` is deliberately absent: an isolated caller has no live
 * connection to the Harness and cannot honestly claim the native turn is
 * `terminal` or `unknown` at enqueue time, so enqueue always persists
 * `nativeTurnState: "active"` and does not expose a parameter for it at all.
 * If a caller's input object still carries a `nativeTurnState` key (or any
 * other field outside this set) despite not being a documented parameter,
 * that is refused outright -- fail closed, not silently ignored -- so a
 * caller can never observe or rely on that field being read.
 */
const ENQUEUE_INPUT_FIELDS = Object.freeze([
  "commandId", "kind", "ownerRootId", "agentId", "jobId",
  "route", "nativeTurnRef", "deadlineMs", "sanitizedReason", "now",
]);

/**
 * Append one durable control command, or return the exact existing command
 * for a repeated identical request (idempotent retry). A repeated
 * `commandId` whose kind/route/native-turn-reference conflicts with the
 * stored command fails closed and never overwrites the stored record.
 * `nativeTurnState` always persists as `"active"`; see `ENQUEUE_INPUT_FIELDS`.
 *
 * @param {{commandId: string, kind: string, ownerRootId: string, agentId: string, jobId: string,
 *   route: *, nativeTurnRef: *, deadlineMs?: number,
 *   sanitizedReason?: (string|null), now?: () => number}} input
 */
export function enqueueControlCommand(input) {
  const snapshot = plainRecordSnapshot(input, "Control command enqueue input");
  for (const field of Object.keys(snapshot)) {
    if (!ENQUEUE_INPUT_FIELDS.includes(field)) {
      throw new Error(
        `Control command enqueue input declares an unsupported field: ${JSON.stringify(field)}. ` +
        `Use one of: ${ENQUEUE_INPUT_FIELDS.join(", ")}. In particular, nativeTurnState is never an ` +
        `enqueue input -- an isolated caller cannot synthesize the native turn's terminal/unknown state; ` +
        `every enqueued command always starts with nativeTurnState "active".`
      );
    }
  }
  const {
    commandId,
    kind,
    ownerRootId,
    agentId,
    jobId,
    route,
    nativeTurnRef,
    deadlineMs = DEFAULT_CONTROL_DEADLINE_MS,
    sanitizedReason = null,
    now = () => Date.now(),
  } = snapshot;
  const canonicalCommandId = assertCommandId(commandId);
  const canonicalKind = assertCommandKind(kind);
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const canonicalRoute = validateVersionThreeRoute(route, "Control command route");
  const canonicalNativeTurnRef = canonicalizeNativeTurnRef(nativeTurnRef, "Control command native turn reference");
  assertNativeTurnRefMatchesRoute(canonicalNativeTurnRef, canonicalRoute, "Control command");
  assertDeadlineMs(deadlineMs);
  const canonicalReason = assertOptionalReasonText(sanitizedReason, "Control command sanitizedReason");

  const streamDir = resolveControlStreamDirectory(identity);
  const lock = acquireDirectoryLock(streamDir);
  try {
    // The durable live-ownership barrier. Once the owning worker has closed
    // this stream on proven terminal evidence, no later command can be
    // appended: there is no live turn to deliver it to and, in this
    // generation, nothing that could ever settle it. An isolated caller gets
    // an explicit fail-closed error instead of a permanently active command.
    const closure = readClosureWhileLocked(streamDir);
    if (closure) {
      throw taggedError(
        "stream_closed",
        `Control command stream for job ${identity.jobId} was closed by worker attempt ` +
        `${JSON.stringify(closure.closedByAttemptId)} on terminal native-turn evidence; ` +
        `no further command can be enqueued for this turn.`
      );
    }
    const existingRecords = readCommandFiles(streamDir);
    const filePath = path.join(streamDir, commandFileName(canonicalCommandId));
    const existing = existingRecords.find((record) => record.commandId === canonicalCommandId);
    const routeText = JSON.stringify(canonicalRoute);
    const nativeTurnRefText = nativeTurnRefIdentityText(canonicalNativeTurnRef);
    if (existing) {
      assertSameCommandIdentity(existing, {
        kind: canonicalKind, ...identity, routeText, nativeTurnRefText,
      });
      return existing;
    }
    const nextSequence = existingRecords.reduce((max, record) => Math.max(max, record.sequence), 0) + 1;
    const requestedAtMs = now();
    const requestedAt = new Date(requestedAtMs).toISOString();
    const deadlineAt = new Date(requestedAtMs + deadlineMs).toISOString();
    const record = validateControlCommandRecord({
      version: CONTROL_SCHEMA_VERSION,
      commandId: canonicalCommandId,
      kind: canonicalKind,
      sequence: nextSequence,
      ownerRootId: identity.ownerRootId,
      agentId: identity.agentId,
      jobId: identity.jobId,
      route: canonicalRoute,
      nativeTurnRef: canonicalNativeTurnRef,
      requestedAt,
      deadlineAt,
      requestState: "none",
      settlement: "pending",
      // Never caller-suppliable -- see ENQUEUE_INPUT_FIELDS above.
      nativeTurnState: "active",
      lastEvidenceAt: null,
      sanitizedReason: canonicalReason,
      claimedByAttemptId: null,
      claimedAt: null,
      acknowledgedAt: null,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    });
    writeAtomicCommandFile(filePath, record, { createOnly: true });
    return record;
  } finally {
    releaseDirectoryLock(lock);
  }
}

// ---------------------------------------------------------------------------
// Read-only surface.
// ---------------------------------------------------------------------------

/** Read one command, or `null` if it does not exist. Read-only; no lock. */
export function readControlCommand({ ownerRootId, agentId, jobId, commandId }) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const canonicalCommandId = assertCommandId(commandId);
  const streamDir = resolveControlStreamDirectory(identity);
  const filePath = path.join(streamDir, commandFileName(canonicalCommandId));
  if (!fs.existsSync(filePath)) return null;
  return readCommandFile(filePath, streamDir);
}

/** List every command in one job's stream, ordered by sequence. Read-only; no lock. */
export function listControlCommands({ ownerRootId, agentId, jobId }) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const streamDir = resolveControlStreamDirectory(identity);
  return readCommandFiles(streamDir).sort(compareBySequence);
}

// ---------------------------------------------------------------------------
// Worker-only surface. Nothing below this line invokes a Driver, signals a
// process, or synthesizes terminal evidence; it only records evidence and
// decisions a real detached worker (Task 5.4) will already have on hand.
// ---------------------------------------------------------------------------

function loadTargetForMutation(identity, commandId, route, nativeTurnRef, label) {
  const canonicalCommandId = assertCommandId(commandId);
  const canonicalRoute = validateVersionThreeRoute(route, `${label} route`);
  const canonicalNativeTurnRef = canonicalizeNativeTurnRef(nativeTurnRef, `${label} native turn reference`);
  const streamDir = resolveControlStreamDirectory(identity);
  const filePath = path.join(streamDir, commandFileName(canonicalCommandId));
  if (!fs.existsSync(filePath)) {
    throw taggedError("not_found", `Control command ${canonicalCommandId} does not exist for this job.`);
  }
  const record = readCommandFile(filePath, streamDir);
  assertSameCommandIdentity(record, {
    kind: record.kind,
    ...identity,
    routeText: JSON.stringify(canonicalRoute),
    nativeTurnRefText: nativeTurnRefIdentityText(canonicalNativeTurnRef),
  });
  return { streamDir, filePath, record };
}

/**
 * Claim a command exclusively for one worker attempt. Idempotent for a
 * repeat of the *exact same* attempt ID (a safe retry). While a claim exists
 * for a *different* attempt ID, a second claim attempt fails closed --
 * durably, not just in-memory -- rather than silently replacing it: proving a
 * prior worker actually disappeared (and transferring its claim) is a
 * separate, stronger fact this module does not have and must not invent.
 * Only a Task 5B durable worker-loss/handoff proof may ever move a claim from
 * one attempt to another; nothing here does that. Once a command is
 * acknowledged, claiming it again is refused: there is nothing left to act
 * on. Claiming only records ownership -- it never touches `requestState`,
 * `settlement`, or `nativeTurnState`, so a claim never implies the request
 * was accepted.
 *
 * Commands in one job's stream must be claimed in strict ascending sequence
 * order; a lower-sequence command that is still unacknowledged blocks
 * claiming a later one, so an in-order queue cannot be skipped past. Sibling
 * records that share one sequence number (a corruption/tamper shape no
 * ordinary write can produce) fail the whole claim closed rather than
 * guessing an order.
 */
export function claimControlCommand({ ownerRootId, agentId, jobId, commandId, route, nativeTurnRef, workerAttemptId }) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const canonicalAttemptId = assertIdentityText(workerAttemptId, "Control command worker attempt ID");
  const streamDir = resolveControlStreamDirectory(identity);
  const lock = acquireDirectoryLock(streamDir);
  try {
    const closure = readClosureWhileLocked(streamDir);
    if (closure) {
      throw taggedError(
        "stream_closed",
        `Control command stream for job ${identity.jobId} is closed; a claim can no longer be taken.`
      );
    }
    const { filePath, record } = loadTargetForMutation(identity, commandId, route, nativeTurnRef, "Control command claim");
    if (record.requestState !== "none") {
      throw new Error(`Control command ${record.commandId} is already acknowledged (${record.requestState}); nothing to claim.`);
    }
    if (record.claimedByAttemptId === canonicalAttemptId) return record;
    if (record.claimedByAttemptId != null) {
      throw taggedError(
        "claimed_by_other_attempt",
        `Control command ${record.commandId} is already claimed by worker attempt ` +
        `${JSON.stringify(record.claimedByAttemptId)}; a different attempt cannot claim it while that claim exists. ` +
        `Only a proven durable worker-loss/handoff transfer may move a claim, and this generation does not implement one.`
      );
    }
    const siblings = readCommandFiles(streamDir);
    const bySequence = new Map();
    for (const sibling of siblings) {
      if (bySequence.has(sibling.sequence)) {
        throw taggedError(
          "sequence_conflict",
          `Control command stream for job ${identity.jobId} has more than one record at sequence ${sibling.sequence}.`
        );
      }
      bySequence.set(sibling.sequence, sibling);
    }
    for (const sibling of siblings) {
      if (sibling.sequence < record.sequence && sibling.requestState === "none") {
        throw taggedError(
          "out_of_order_claim",
          `Control command ${record.commandId} (sequence ${record.sequence}) cannot be claimed before ` +
          `unacknowledged command ${sibling.commandId} (sequence ${sibling.sequence}) in the same job stream.`
        );
      }
    }
    const updatedAt = nowIso();
    const updated = validateControlCommandRecord({
      ...record,
      claimedByAttemptId: canonicalAttemptId,
      claimedAt: updatedAt,
      updatedAt,
    });
    writeAtomicCommandFile(filePath, updated);
    return updated;
  } finally {
    releaseDirectoryLock(lock);
  }
}

/**
 * Require that `record` is currently claimed by exactly `workerAttemptId`,
 * with the same closed error shape whether the command was never claimed at
 * all or is claimed by a different attempt -- so an isolated caller (which
 * never holds a claim) and a superseded worker attempt (which no longer
 * should) are refused identically. This is the one gate that keeps ack and
 * settlement recording from ever being invoked by two different attempts for
 * one command.
 */
function assertClaimedByExactAttempt(record, workerAttemptId, label) {
  const canonicalAttemptId = assertIdentityText(workerAttemptId, `${label} worker attempt ID`);
  if (record.claimedByAttemptId == null) {
    throw taggedError(
      "not_claimed",
      `${label} requires control command ${record.commandId} to be claimed first; it has not been claimed by any worker attempt.`
    );
  }
  if (record.claimedByAttemptId !== canonicalAttemptId) {
    throw taggedError(
      "claimed_by_other_attempt",
      `${label} refuses a cross-attempt call: control command ${record.commandId} is claimed by worker attempt ` +
      `${JSON.stringify(record.claimedByAttemptId)}, not ${JSON.stringify(canonicalAttemptId)}.`
    );
  }
  return canonicalAttemptId;
}

/**
 * Record the request axis only: `accepted`, `rejected`, or `unsupported`.
 * This never touches `settlement` or `nativeTurnState`, for any of the three
 * values -- an accepted request is request evidence only, a rejected request
 * remains nonterminal, and `unsupported` leaves native state/settlement
 * exactly as they were. Idempotent for a replay of the exact same value from
 * the exact claiming attempt; refuses closed on a conflicting second value,
 * so a command's request outcome is recorded exactly once. Requires the
 * caller to already hold this command's claim under its exact
 * `workerAttemptId` -- an isolated (unclaimed) or cross-attempt call is
 * refused before anything is read as an acknowledgement, so two different
 * worker attempts can never both record an outcome for one command.
 */
export function recordRequestAcknowledgement({
  ownerRootId, agentId, jobId, commandId, route, nativeTurnRef, workerAttemptId, requestState, sanitizedReason = null,
}) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const canonicalRequestState = assertFromClosedSet(
    requestState, "requestState", ["accepted", "rejected", "unsupported"], "Control command acknowledgement"
  );
  const canonicalReason = assertOptionalReasonText(sanitizedReason, "Control command sanitizedReason");
  const streamDir = resolveControlStreamDirectory(identity);
  const lock = acquireDirectoryLock(streamDir);
  try {
    const { filePath, record } = loadTargetForMutation(identity, commandId, route, nativeTurnRef, "Control command acknowledgement");
    assertClaimedByExactAttempt(record, workerAttemptId, "Control command acknowledgement");
    if (record.requestState === canonicalRequestState) return record;
    if (record.requestState !== "none") {
      throw new Error(
        `Control command ${record.commandId} already recorded requestState ${record.requestState}; ` +
        `cannot record a conflicting ${canonicalRequestState}.`
      );
    }
    const updatedAt = nowIso();
    const updated = validateControlCommandRecord({
      ...record,
      requestState: canonicalRequestState,
      sanitizedReason: canonicalReason ?? record.sanitizedReason,
      acknowledgedAt: updatedAt,
      updatedAt,
    });
    writeAtomicCommandFile(filePath, updated);
    return updated;
  } finally {
    releaseDirectoryLock(lock);
  }
}

/**
 * Read one own, plain data property without ever invoking a getter/Proxy
 * trap -- the exact discipline `instance-admission-lease.mjs`'s
 * `assertSettlementEvidenceShape()` already uses to pull `nativeTurnRef` off
 * settlement evidence. Reused here rather than re-implemented so both this
 * module's and the lease module's settlement-evidence readers stay identical.
 */
function ownDataValue(source, field) {
  if (source == null || typeof source !== "object" || types.isProxy(source)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(source, field);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor.value;
}

/**
 * Prove that `normalizedTerminalResult` is evidence for *this exact* command
 * -- not merely evidence that happens to classify as publishable for some
 * other turn. `classifyTurnSettlement()` alone never looks at `nativeTurnRef`
 * at all (by design, so its axis-only vocabulary cannot drift from the
 * durable schema); this closes that gap for the one caller, settlement
 * recording, where a structurally valid but foreign or absent turn reference
 * must never be allowed to settle -- or update the native-turn-state axis
 * of -- a command it does not belong to.
 *
 * Uses the accepted Task 1/2 envelope and locator validators through
 * `canonicalizeNativeTurnRef()` to canonicalize the evidence's complete
 * `nativeTurnRef`, never a weak ad hoc property read or a raw nested locator,
 * then requires two
 * independent things to both hold against the stored command's own bound
 * route/`nativeTurnRef`:
 *
 * 1. the canonicalized reference's own `harnessId`/`instanceKey`/
 *    `driverVersion` fields exactly equal the command's route -- refusing a
 *    reference for a foreign Harness, instance, or Driver version outright;
 * 2. the full canonicalized reference is value-identical to the command's own
 *    stored `nativeTurnRef`, compared through
 *    `canonicalNativeReferenceText()`'s deterministic key-sorted text -- so a
 *    partial or same-Harness-but-different-turn reference is refused even
 *    though it would pass check 1, while a reference whose locator keys were
 *    merely emitted in a different order still names the same turn and is
 *    accepted. Key insertion order is not a value; array order still is.
 *
 * A missing, non-object, or structurally unrecognized `nativeTurnRef` on the
 * evidence fails the same way as a mismatched one: there is no binding
 * evidence to trust, so nothing here may be applied to the command.
 */
function assertSettlementEvidenceMatchesCommand(normalizedTerminalResult, record) {
  const label = `Control command ${record.commandId} settlement observation`;
  const evidenceNativeTurnRef = ownDataValue(normalizedTerminalResult, "nativeTurnRef");
  if (evidenceNativeTurnRef == null) {
    throw new Error(`${label} does not carry a native turn reference; settlement evidence must be exactly bound.`);
  }
  let canonicalEvidenceRef;
  try {
    canonicalEvidenceRef = canonicalizeNativeTurnRef(evidenceNativeTurnRef, label);
  } catch (error) {
    throw new Error(`${label} carries an unrecognized native turn reference: ${error.message}`);
  }
  if (
    canonicalEvidenceRef.harnessId !== record.route.harnessId ||
    canonicalEvidenceRef.instanceKey !== record.route.instanceKey ||
    canonicalEvidenceRef.driverVersion !== record.route.driverVersion
  ) {
    throw new Error(`${label} belongs to a foreign Harness, logical instance, or Driver version.`);
  }
  if (nativeTurnRefIdentityText(canonicalEvidenceRef) !== nativeTurnRefIdentityText(record.nativeTurnRef)) {
    throw new Error(`${label} does not exactly match this command's bound native turn reference.`);
  }
}

/**
 * Classify already-available terminal evidence with the exact
 * `classifyTurnSettlement()` predicate `runtime/completion-inbox.mjs` gates
 * publication with, and record the result onto `settlement`/`nativeTurnState`.
 * `settled` is monotonic here: once a command records `settled`, a later call
 * -- even with contradictory evidence -- is a safe no-op rather than a
 * regression, matching the same "release exactly once" discipline
 * `releaseLeasesOnSettlement()` uses. Evidence this module cannot classify at
 * all (not settlement-shaped) is refused rather than silently ignored, so a
 * caller cannot mistake a no-op for a recorded observation. Evidence that
 * *is* settlement-shaped but does not exactly bind to this command (a
 * missing, foreign, or merely same-Harness-but-different-turn reference --
 * see `assertSettlementEvidenceMatchesCommand()`) is refused the same way,
 * before either axis is touched.
 *
 * Requires the exact claiming `workerAttemptId`, identically to
 * `recordRequestAcknowledgement()`: this generation has no separate
 * reconciler-authorized settlement path for an *unclaimed* command (the
 * `durable-runtime-state` "later observation proves terminal settlement"
 * scenario, for a worker that disappeared before ever claiming its command)
 * -- that proof is explicitly deferred to Task 5B, not silently assumed here.
 *
 * `settlement` moves along one monotonic lattice, `pending -> {pending,
 * unknown, settled}`, `unknown -> {unknown, settled}`, `settled -> {settled}`
 * (the last already handled by the early return above): once a command's
 * settlement has degraded to `unknown` -- most commonly via
 * `expireControlCommandDeadline()` -- a later observation that merely shows
 * the native turn active again must not present that as "back to pending".
 * A deadline means the command's own settlement is no longer known; seeing
 * the turn still running afterward tells us about the turn, not that the
 * command's settlement question became answerable again. Only exact
 * publishable terminal evidence can move `unknown` forward, to `settled`.
 * `nativeTurnState` is not part of this lattice: it is updated from every
 * authoritative observation independently, whether or not `settlement`
 * itself advances.
 */
export function recordControlSettlement({
  ownerRootId, agentId, jobId, commandId, route, nativeTurnRef, workerAttemptId, normalizedTerminalResult,
}) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const streamDir = resolveControlStreamDirectory(identity);
  const lock = acquireDirectoryLock(streamDir);
  try {
    const { filePath, record } = loadTargetForMutation(identity, commandId, route, nativeTurnRef, "Control command settlement");
    assertClaimedByExactAttempt(record, workerAttemptId, "Control command settlement");
    if (record.settlement === "settled") return record;
    const classification = classifyTurnSettlement(normalizedTerminalResult);
    if (classification.nativeTurn == null) {
      throw new Error(`Control command ${record.commandId} settlement observation is not settlement-shaped evidence.`);
    }
    assertSettlementEvidenceMatchesCommand(normalizedTerminalResult, record);
    let settlement;
    if (classification.publishable) {
      settlement = "settled";
    } else if (record.settlement === "unknown") {
      // Sticky: only publishable terminal evidence (handled above) may move
      // an already-unknown settlement forward. A merely-active observation
      // never un-expires a command back to pending.
      settlement = "unknown";
    } else {
      // record.settlement === "pending". `native_turn_active`/
      // `execution_settlement_active` are honest "still running" facts --
      // pending, not unknown. Every other non-publishable reason (unknown
      // axes or an outright contradictory terminal claim) means this
      // evidence cannot be trusted to say what is happening.
      settlement = ["native_turn_active", "execution_settlement_active"].includes(classification.reason)
        ? "pending"
        : "unknown";
    }
    const updatedAt = nowIso();
    const updated = validateControlCommandRecord({
      ...record,
      settlement,
      nativeTurnState: classification.nativeTurn,
      lastEvidenceAt: updatedAt,
      updatedAt,
    });
    writeAtomicCommandFile(filePath, updated);
    return updated;
  } finally {
    releaseDirectoryLock(lock);
  }
}

// ---------------------------------------------------------------------------
// Durable stream closure.
//
// A worker that has proven its native turn terminal is about to stop being the
// live owner of this job. Between that moment and the last durable write of
// the turn, an isolated `interrupt_agent` caller can still append a command --
// and nothing would ever claim, request, or settle it, so it would sit in the
// durable record claiming `nativeTurnState: "active"` for a turn that is
// provably terminal. That is a false durable statement, and in this generation
// (no Driver observation, no cross-attempt claim transfer) it is permanent.
//
// Closing the stream is the durable barrier that makes it impossible: under
// the one stream lock, every command bound to this exact turn is settled from
// the same terminal evidence that will publish the completion, and a closure
// marker is written. `enqueueControlCommand()` and `claimControlCommand()`
// both refuse a closed stream from that point on, so a late caller gets an
// explicit fail-closed error instead of a command nobody will ever act on.
//
// A never-requested command settles as `requestState: "none"` with
// `settlement: "settled"` and `nativeTurnState: "terminal"`. That is the exact
// honest statement -- the interrupt was never delivered to the Harness, and
// the turn ended on its own -- and it never invents an acceptance, a
// rejection, or a synthesized interruption.
// ---------------------------------------------------------------------------

const CLOSURE_FILE_NAME = "stream-closed.json";

const CONTROL_CLOSURE_FIELDS = Object.freeze([
  "version", "ownerRootId", "agentId", "jobId", "route", "nativeTurnRef",
  "closedByAttemptId", "closedAt", "nativeTurnState", "settlement",
]);

function closureFilePath(streamDir) {
  return path.join(streamDir, CLOSURE_FILE_NAME);
}

function validateControlClosureRecord(parsed) {
  const label = "Control stream closure record";
  const snapshot = plainRecordSnapshot(parsed, label);
  for (const field of Object.keys(snapshot)) {
    if (!CONTROL_CLOSURE_FIELDS.includes(field)) {
      throw new Error(`${label} declares an unknown field: ${field}.`);
    }
  }
  for (const field of CONTROL_CLOSURE_FIELDS) {
    if (!(field in snapshot)) throw new Error(`${label} is missing required field: ${field}.`);
  }
  if (snapshot.version !== CONTROL_SCHEMA_VERSION) {
    throw taggedError("unsupported_version", `${label} declares unsupported schema version.`);
  }
  const identity = assertBindingIdentity(snapshot);
  const route = validateVersionThreeRoute(snapshot.route, `${label} route`);
  const nativeTurnRef = canonicalizeNativeTurnRef(snapshot.nativeTurnRef, `${label} native turn reference`);
  if (!NATIVE_TURN_STATES.includes(snapshot.nativeTurnState)) {
    throw new Error(`${label} declares an unsupported native turn state.`);
  }
  if (!CONTROL_SETTLEMENT_VALUES.includes(snapshot.settlement)) {
    throw new Error(`${label} declares an unsupported settlement value.`);
  }
  return Object.freeze({
    version: CONTROL_SCHEMA_VERSION,
    ...identity,
    route,
    nativeTurnRef,
    closedByAttemptId: assertIdentityText(snapshot.closedByAttemptId, `${label} closedByAttemptId`),
    closedAt: assertTimestampText(snapshot.closedAt, `${label} closedAt`),
    nativeTurnState: snapshot.nativeTurnState,
    settlement: snapshot.settlement,
  });
}

function readClosureWhileLocked(streamDir) {
  const filePath = closureFilePath(streamDir);
  if (!fs.existsSync(filePath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw taggedError("corrupt_closure", `Control stream closure record is unreadable: ${error.message}`);
  }
  return validateControlClosureRecord(parsed);
}

/**
 * Read one job's stream closure, or `null` while the stream is still open.
 * Read-only; no lock.
 */
export function readControlStreamClosure({ ownerRootId, agentId, jobId }) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  return readClosureWhileLocked(resolveControlStreamDirectory(identity));
}

/**
 * Settle every command bound to this exact turn and durably close the stream.
 *
 * Requires publishable terminal evidence that names this exact native turn:
 * the barrier exists precisely because the turn is provably over, and closing
 * on anything weaker would strand commands whose turn might still be running.
 * Idempotent for a repeat by the same attempt with the same reference; a
 * different attempt is refused rather than allowed to close a stream it does
 * not own.
 *
 * A command bound to a foreign native turn, or claimed by another attempt, is
 * left exactly as its own owner wrote it and reported in `skipped`.
 */
export function closeControlStreamForAttempt({
  ownerRootId, agentId, jobId, route, nativeTurnRef, workerAttemptId, normalizedTerminalResult,
}) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const canonicalAttemptId = assertIdentityText(workerAttemptId, "Control stream closure worker attempt ID");
  const canonicalRoute = validateVersionThreeRoute(route, "Control stream closure route");
  const canonicalNativeTurnRef = canonicalizeNativeTurnRef(nativeTurnRef, "Control stream closure native turn reference");
  assertNativeTurnRefMatchesRoute(canonicalNativeTurnRef, canonicalRoute, "Control stream closure");

  const classification = classifyTurnSettlement(normalizedTerminalResult);
  if (!classification.publishable) {
    throw taggedError(
      "not_publishable",
      `Control stream closure requires publishable terminal evidence; this evidence is ${classification.reason}.`
    );
  }
  const evidenceRef = ownDataValue(normalizedTerminalResult, "nativeTurnRef");
  if (
    evidenceRef == null ||
    nativeTurnRefIdentityText(canonicalizeNativeTurnRef(evidenceRef, "Control stream closure evidence"))
      !== nativeTurnRefIdentityText(canonicalNativeTurnRef)
  ) {
    throw taggedError(
      "foreign_evidence",
      "Control stream closure evidence does not name the native turn this closure binds."
    );
  }

  const streamDir = resolveControlStreamDirectory(identity);
  const lock = acquireDirectoryLock(streamDir);
  try {
    const existing = readClosureWhileLocked(streamDir);
    if (existing) {
      if (
        existing.closedByAttemptId !== canonicalAttemptId ||
        nativeTurnRefIdentityText(existing.nativeTurnRef) !== nativeTurnRefIdentityText(canonicalNativeTurnRef)
      ) {
        throw taggedError(
          "closed_by_other_attempt",
          `Control stream for job ${identity.jobId} is already closed by worker attempt ` +
          `${JSON.stringify(existing.closedByAttemptId)}.`
        );
      }
    }

    const routeText = JSON.stringify(canonicalRoute);
    const nativeTurnRefText = nativeTurnRefIdentityText(canonicalNativeTurnRef);
    const settledCommandIds = [];
    const alreadySettledCommandIds = [];
    /** @type {Array<{commandId: string, reason: string}>} */
    const skipped = [];
    for (const record of readCommandFiles(streamDir).sort(compareBySequence)) {
      try {
        assertSameCommandIdentity(record, {
          kind: record.kind, ...identity, routeText, nativeTurnRefText,
        });
      } catch {
        skipped.push({ commandId: record.commandId, reason: "foreign_native_turn" });
        continue;
      }
      if (record.settlement === "settled") {
        alreadySettledCommandIds.push(record.commandId);
        continue;
      }
      if (record.claimedByAttemptId != null && record.claimedByAttemptId !== canonicalAttemptId) {
        skipped.push({ commandId: record.commandId, reason: "claimed_by_other_attempt" });
        continue;
      }
      const updatedAt = nowIso();
      const updated = validateControlCommandRecord({
        ...record,
        // Claiming here records ownership only; it never implies the request
        // was made, so `requestState` is untouched.
        claimedByAttemptId: canonicalAttemptId,
        claimedAt: record.claimedAt ?? updatedAt,
        settlement: "settled",
        nativeTurnState: classification.nativeTurn,
        lastEvidenceAt: updatedAt,
        updatedAt,
      });
      writeAtomicCommandFile(path.join(streamDir, commandFileName(record.commandId)), updated);
      settledCommandIds.push(record.commandId);
    }

    if (!existing) {
      writeAtomicCommandFile(closureFilePath(streamDir), validateControlClosureRecord({
        version: CONTROL_SCHEMA_VERSION,
        ...identity,
        route: canonicalRoute,
        nativeTurnRef: canonicalNativeTurnRef,
        closedByAttemptId: canonicalAttemptId,
        closedAt: nowIso(),
        nativeTurnState: classification.nativeTurn,
        settlement: "settled",
      }));
    }
    return Object.freeze({
      closed: true,
      reopened: false,
      settledCommandIds: Object.freeze(settledCommandIds),
      alreadySettledCommandIds: Object.freeze(alreadySettledCommandIds),
      skipped: Object.freeze(skipped),
    });
  } finally {
    releaseDirectoryLock(lock);
  }
}

/**
 * Deadline expiry moves an unobserved pending command only to
 * `settlement=unknown` -- never to `rejected`, `settled`, a terminal native
 * turn state, or any invented "cancelled" disposition. `requestState` and
 * `nativeTurnState` are left exactly as they were: a deadline is an absence
 * of evidence, not evidence itself. A no-op (returns the record unchanged,
 * `expired: false`) when settlement is already decided or the deadline has
 * not yet passed.
 */
export function expireControlCommandDeadline({ ownerRootId, agentId, jobId, commandId, route, nativeTurnRef, now = () => Date.now() }) {
  const identity = assertBindingIdentity({ ownerRootId, agentId, jobId });
  const streamDir = resolveControlStreamDirectory(identity);
  const lock = acquireDirectoryLock(streamDir);
  try {
    const { filePath, record } = loadTargetForMutation(identity, commandId, route, nativeTurnRef, "Control command deadline");
    if (record.settlement !== "pending") return { ...record, expired: false };
    if (now() < Date.parse(record.deadlineAt)) return { ...record, expired: false };
    const updatedAt = nowIso();
    const updated = validateControlCommandRecord({
      ...record,
      settlement: "unknown",
      updatedAt,
    });
    writeAtomicCommandFile(filePath, updated);
    return { ...updated, expired: true };
  } finally {
    releaseDirectoryLock(lock);
  }
}

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * The internal Harness Driver contract.
 *
 * The boundary is one complete turn. A Driver owns its executable, native
 * configuration, route validation, transport, protocol parsing, in-turn
 * recovery, native session evidence, compatibility, and failure classification.
 * The shared supervisor owns Agent identity, mailbox, jobs, leases, completion
 * delivery, wait budgets, retention, and reconciliation, and never requires
 * token-level or tool-schema parity between Harnesses.
 */

import { createHash } from "node:crypto";

import { validateHarnessCapabilities } from "./harness-capabilities.mjs";
import { assertHarnessTurnFailureClass } from "./harness-failure-classes.mjs";
import { normalizeTerminalMetrics } from "./terminal-metrics.mjs";

export const HARNESS_DRIVER_CONTRACT_VERSION = 1;

/**
 * Every valid version-1 durable record predates Harness identity and is
 * interpreted as this Harness. The constant lives here, not in the Driver, so
 * durable state can be read without loading a Driver implementation.
 */
export const V1_HARNESS_ID = "claude-code";

/** Coarse turn-level operations every admitted Driver must implement. */
export const HARNESS_DRIVER_OPERATIONS = Object.freeze([
  "preflight",
  "describeUnreadiness",
  "validatePreparedPreflight",
  "revalidatePreparedPreflight",
  "validateRoute",
  "resolveInstanceKey",
  "startTurn",
  "assignInput",
  "interruptTurn",
  "cancelTurn",
]);

/** Operations a Driver provides only when its capability snapshot admits them. */
export const HARNESS_DRIVER_OPTIONAL_OPERATIONS = Object.freeze([
  "readAssistantHistory",
]);

const HARNESS_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const NATIVE_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const TURN_STATUSES = new Set(["completed", "failed", "interrupted", "unknown"]);
const MAX_DRIVER_RECEIPT_BYTES = 16 * 1024;

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`${label} must be non-empty text.`);
  }
  return value.trim();
}

export function assertHarnessId(value) {
  const harnessId = assertText(value, "Harness ID");
  if (!HARNESS_ID_PATTERN.test(harnessId)) {
    throw new Error(`Invalid Harness ID: ${harnessId}.`);
  }
  return harnessId;
}

/**
 * The neutral durable reference to one native Harness session. `instanceKey`
 * is the Driver-derived minimum stable native configuration identity required
 * to keep two Harness instances from claiming the same logical session.
 */
export function canonicalNativeSessionRef(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    throw new Error("Native session reference must be an object.");
  }
  const harnessId = assertHarnessId(reference.harnessId);
  const instanceKey = assertText(reference.instanceKey, "Harness instance key");
  const nativeSessionId = assertText(reference.nativeSessionId, "native session ID");
  if (!NATIVE_SESSION_ID_PATTERN.test(nativeSessionId)) {
    throw new Error(`Invalid native session ID for ${harnessId}: ${nativeSessionId}.`);
  }
  return Object.freeze({ harnessId, instanceKey, nativeSessionId });
}

/**
 * Canonical ownership key for durable session bindings and active leases.
 *
 * The `claude-code` branch reproduces the pre-Harness `(config dir, session)`
 * digest byte for byte. That compatibility is a correctness boundary, not
 * convenience: a runtime that predates version-2 state derives the same key, so
 * it still observes an active lease instead of stealing the live session. Any
 * later Harness is namespaced by its ID and therefore cannot collide even when
 * it reports the same native session ID text.
 */
export function harnessSessionKey(reference) {
  const { harnessId, instanceKey, nativeSessionId } = canonicalNativeSessionRef(reference);
  const material = harnessId === V1_HARNESS_ID
    ? `${instanceKey}\0${nativeSessionId}`
    : `${harnessId}\0${instanceKey}\0${nativeSessionId}`;
  return createHash("sha256").update(material).digest("hex");
}

export function sameNativeSessionRef(left, right) {
  if (!left || !right) return false;
  return left.harnessId === right.harnessId &&
    left.instanceKey === right.instanceKey &&
    left.nativeSessionId === right.nativeSessionId;
}

/**
 * Driver receipts stay opaque to the supervisor. They are bounded and
 * versioned, and are never the sole evidence for signalling, ownership, or
 * continuation decisions.
 */
export function boundedDriverReceipt(harnessId, driverVersion, receipt) {
  const payload = {
    harnessId: assertHarnessId(harnessId),
    driverVersion: assertText(driverVersion, "Driver version"),
    receipt: receipt ?? null,
  };
  const encoded = JSON.stringify(payload);
  if (encoded.length > MAX_DRIVER_RECEIPT_BYTES) {
    return {
      harnessId: payload.harnessId,
      driverVersion: payload.driverVersion,
      receipt: null,
      omitted: "driver_receipt_exceeded_bound",
    };
  }
  return payload;
}

/**
 * Validate the one normalized terminal result a Driver returns for a complete
 * turn. Native protocol detail may accompany the result for Driver-local
 * diagnostics, but the shared supervisor never reads it.
 */
export function validateHarnessTurnResult(result, driver) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Harness turn result must be an object.");
  }
  if (result.harnessId !== driver.harnessId) {
    throw new Error(
      `Harness turn result declares ${result.harnessId}; expected ${driver.harnessId}.`
    );
  }
  if (result.driverVersion !== driver.driverVersion) {
    throw new Error("Harness turn result declares a foreign Driver version.");
  }
  if (result.contractVersion !== HARNESS_DRIVER_CONTRACT_VERSION) {
    throw new Error(
      `Harness turn result implements contract ${result.contractVersion}; ` +
      `this runtime requires ${HARNESS_DRIVER_CONTRACT_VERSION}.`
    );
  }
  if (!TURN_STATUSES.has(result.status)) {
    throw new Error(`Unsupported Harness turn status: ${result.status}.`);
  }
  if (!Number.isInteger(result.exitStatus)) {
    throw new Error("Harness turn result must carry an integer exit status.");
  }
  if (
    (result.status === "completed" && result.exitStatus !== 0) ||
    (result.status !== "completed" && result.exitStatus === 0)
  ) {
    throw new Error("Harness turn status and exit status are inconsistent.");
  }
  if (result.nativeSession != null) {
    const nativeSession = canonicalNativeSessionRef(result.nativeSession);
    if (nativeSession.harnessId !== driver.harnessId) {
      throw new Error(
        `Harness turn native session belongs to Harness ${nativeSession.harnessId}; ` +
        `expected ${driver.harnessId}.`
      );
    }
  }
  // Continuation and interruption evidence is exactly this triple: the exact
  // native session target, whether transport replay is safe, and the failure
  // class. Opaque Driver receipts never stand alone as that proof.
  if (!["exact", "unproven"].includes(result.sessionExactness)) {
    throw new Error("Harness turn result must classify native session exactness.");
  }
  if (result.sessionExactness === "exact" && result.nativeSession == null) {
    throw new Error("Exact native session evidence requires a native session reference.");
  }
  const failure = result.failure;
  if (!failure || typeof failure !== "object" || Array.isArray(failure)) {
    throw new Error("Harness turn result must carry a failure classification object.");
  }
  if (result.status === "completed" && failure.class != null) {
    throw new Error("A completed Harness turn must not classify a failure.");
  }
  if (result.status !== "completed") {
    if (typeof failure.class !== "string" || !failure.class.trim()) {
      throw new Error("A non-completed Harness turn must classify its failure.");
    }
    // The empty/missing case above keeps its own message; a non-empty but
    // unadmitted or free-text class is rejected here, before it becomes
    // durable continuation evidence or a model-facing receipt.
    assertHarnessTurnFailureClass(failure.class, `Harness turn result for ${driver.harnessId}`);
  }
  if (typeof failure.resumable !== "boolean") {
    throw new Error("Harness failure classification must state transport resumability.");
  }
  if (result.finalMessage == null && !result.finalMessageAbsenceReason) {
    throw new Error(
      "Harness turn result must carry a final outer-assistant message or an explicit absence reason."
    );
  }
  if (result.finalMessage != null && typeof result.finalMessage !== "string") {
    throw new Error("Harness turn final message must be text when present.");
  }
  if (
    result.finalMessageAbsenceReason != null &&
    (typeof result.finalMessageAbsenceReason !== "string" || !result.finalMessageAbsenceReason.trim())
  ) {
    throw new Error("Harness turn final-message absence reason must be non-empty text.");
  }
  if (!result.process || typeof result.process !== "object") {
    throw new Error("Harness turn result must carry process acceptance evidence.");
  }
  if (
    typeof result.process.spawnAccepted !== "boolean" ||
    typeof result.process.identityProven !== "boolean"
  ) {
    throw new Error("Harness turn process evidence must classify spawn acceptance and identity.");
  }
  if (!result.receipts || typeof result.receipts !== "object") {
    throw new Error("Harness turn result must carry bounded activity receipts.");
  }
  const normalizedMetrics = result.metrics == null ? null : normalizeTerminalMetrics(result.metrics);
  if (result.metrics != null && normalizedMetrics == null) {
    throw new Error("Harness turn metrics must use the closed version-one schema.");
  }
  if (result.runtime != null && (typeof result.runtime !== "object" || Array.isArray(result.runtime))) {
    throw new Error("Harness turn runtime evidence must be an object when present.");
  }
  if (result.driverReceipt != null) {
    if (typeof result.driverReceipt !== "object" || Array.isArray(result.driverReceipt)) {
      throw new Error("Harness turn Driver receipt must be an object when present.");
    }
    if (
      result.driverReceipt.harnessId !== driver.harnessId ||
      result.driverReceipt.driverVersion !== driver.driverVersion
    ) {
      throw new Error("Harness turn Driver receipt belongs to a foreign Driver contract.");
    }
    if (JSON.stringify(result.driverReceipt).length > MAX_DRIVER_RECEIPT_BYTES) {
      throw new Error("Harness turn Driver receipt exceeds its durable bound.");
    }
  }
  return result.metrics == null ? result : { ...result, metrics: normalizedMetrics };
}

/**
 * Validate a Driver module resolved from the static registry. This runs at
 * composition time so an incomplete or mislabelled Driver fails before any
 * durable Agent, lease, or native process exists.
 */
export function validateHarnessDriver(driver) {
  if (!driver || typeof driver !== "object") {
    throw new Error("A Harness Driver must be an object.");
  }
  assertHarnessId(driver.harnessId);
  assertText(driver.driverVersion, "Driver version");
  if (driver.contractVersion !== HARNESS_DRIVER_CONTRACT_VERSION) {
    throw new Error(
      `Harness Driver ${driver.harnessId} implements contract ${driver.contractVersion}; ` +
      `this runtime requires ${HARNESS_DRIVER_CONTRACT_VERSION}.`
    );
  }
  const capabilities = validateHarnessCapabilities(
    driver.capabilities,
    `Harness Driver ${driver.harnessId} capability snapshot`
  );
  for (const operation of HARNESS_DRIVER_OPERATIONS) {
    if (typeof driver[operation] !== "function") {
      throw new Error(`Harness Driver ${driver.harnessId} does not implement ${operation}.`);
    }
  }
  if (
    capabilities.history === "assistant_messages" &&
    typeof driver.readAssistantHistory !== "function"
  ) {
    throw new Error(
      `Harness Driver ${driver.harnessId} claims assistant history without implementing it.`
    );
  }
  return driver;
}

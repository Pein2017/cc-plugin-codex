/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Closed capability vocabulary for Harness Drivers.
 *
 * A capability states what the Harness can be observed to do for one Agent
 * turn. It never advertises model quality, and it is never supplied, widened,
 * or overridden by a caller: every snapshot originates in checkout-owned Driver
 * source and is persisted with the turn it launched.
 */

export const HARNESS_CAPABILITY_VALUES = Object.freeze({
  activeInput: Object.freeze(["acknowledged_active_stream", "initial_only"]),
  continuation: Object.freeze(["exact_resume", "fresh_only"]),
  history: Object.freeze(["assistant_messages", "unavailable"]),
  interrupt: Object.freeze(["graceful_flush_proven", "best_effort_signal", "unsupported"]),
  automaticRecovery: Object.freeze(["exact_session_transport", "none"]),
  authorityEnforcement: Object.freeze(["process_sandbox", "prompt_only"]),
  leafEnforcement: Object.freeze(["effective_tool_denial", "prompt_only"]),
  nativeOrchestration: Object.freeze(["opaque_bounded", "disabled"]),
});

export const HARNESS_CAPABILITY_NAMES = Object.freeze(
  Object.keys(HARNESS_CAPABILITY_VALUES).sort()
);

/**
 * Validate a Driver-published capability snapshot against the closed
 * vocabulary. An unknown capability name, an unknown value, or a missing
 * capability fails here rather than at the native process boundary.
 */
export function validateHarnessCapabilities(snapshot, label = "Harness capability snapshot") {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error(`${label} must be an object.`);
  }
  /** @type {Record<string, string>} */
  const normalized = {};
  for (const name of HARNESS_CAPABILITY_NAMES) {
    const value = snapshot[name];
    if (!HARNESS_CAPABILITY_VALUES[name].includes(value)) {
      throw new Error(
        `${label} has an unsupported ${name} value: ${JSON.stringify(value ?? null)}. ` +
        `Use one of: ${HARNESS_CAPABILITY_VALUES[name].join(", ")}.`
      );
    }
    normalized[name] = value;
  }
  for (const name of Object.keys(snapshot)) {
    if (!HARNESS_CAPABILITY_NAMES.includes(name)) {
      throw new Error(`${label} declares an unknown capability: ${name}.`);
    }
  }
  return Object.freeze(normalized);
}

/**
 * Fail closed before a lifecycle operation the persisted snapshot does not
 * admit. `admitted` is the closed set of values under which the operation is
 * proven; anything else refuses without mutating Agent continuity.
 */
export function assertHarnessCapability(snapshot, name, admitted, detail) {
  if (!HARNESS_CAPABILITY_NAMES.includes(name)) {
    throw new Error(`Unknown Harness capability: ${name}.`);
  }
  const value = validateHarnessCapabilities(snapshot)[name];
  if (!admitted.includes(value)) {
    throw new Error(`${detail} (${name}=${value}).`);
  }
  return value;
}

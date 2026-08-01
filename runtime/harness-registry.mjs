/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Static, checkout-owned Harness Driver registry.
 *
 * Drivers are resolved only from in-tree source. No model-facing input and no
 * ambient variable may select a Driver module, executable, configuration store,
 * capability snapshot, or implementation path. Admitting another Harness
 * requires a separate OpenSpec change with in-tree code, contract evidence, and
 * an explicit public-generation decision.
 */

import { createClaudeCodeDriver } from "./claude-code-driver.mjs";
import { V1_HARNESS_ID, assertHarnessId, validateHarnessDriver } from "./harness-contract.mjs";

export const DEFAULT_HARNESS_ID = V1_HARNESS_ID;

/** Every Harness this generation admits. */
export const ADMITTED_HARNESS_IDS = Object.freeze([DEFAULT_HARNESS_ID]);

const DRIVER_FACTORIES = Object.freeze({
  [DEFAULT_HARNESS_ID]: createClaudeCodeDriver,
});

/**
 * Selectors that would let a caller or ambient environment choose the Driver
 * implementation itself. Host executable and native configuration remain
 * resolvable by each Driver's own checkout-owned environment owner; only
 * implementation selection is refused here.
 */
const REJECTED_INPUT_SELECTORS = Object.freeze([
  "harness",
  "harness_id",
  "harness_driver",
  "harness_module",
  "harness_executable",
  "harness_capabilities",
  "driver",
  "driver_module",
  "driver_path",
  "capability_override",
  "claude_bin",
  "claude_config_dir",
  "env_file",
  "settings_path",
]);

const REJECTED_ENV_SELECTORS = Object.freeze([
  "CC_HARNESS_ID",
  "CC_HARNESS_DRIVER",
  "CC_HARNESS_DRIVER_MODULE",
  "CC_HARNESS_DRIVER_PATH",
  "CC_HARNESS_CAPABILITIES",
  "CC_HARNESS_REGISTRY",
]);

export function assertNoHarnessImplementationSelector(input, operation) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  for (const key of REJECTED_INPUT_SELECTORS) {
    if (input[key] != null) {
      throw new Error(
        `${operation} does not accept ${key}: the Harness Driver, executable, and native configuration are resolved by the checkout.`
      );
    }
  }
}

export function assertNoAmbientHarnessSelector(env) {
  for (const key of REJECTED_ENV_SELECTORS) {
    if (String(env?.[key] ?? "").trim()) {
      throw new Error(
        `${key} cannot select a Harness Driver implementation; the static in-tree registry is authoritative.`
      );
    }
  }
}

export function isAdmittedHarnessId(value) {
  return ADMITTED_HARNESS_IDS.includes(String(value ?? "").trim());
}

/**
 * Resolve one admitted Driver. An unknown Harness fails here, before route
 * validation, durable Agent creation, or any native process launch.
 */
export function resolveHarnessDriver(harnessId, options = {}) {
  const requested = assertHarnessId(harnessId ?? DEFAULT_HARNESS_ID);
  const factory = DRIVER_FACTORIES[requested];
  if (!factory) {
    throw new Error(
      `Unknown Harness ${requested}. This runtime admits only: ${ADMITTED_HARNESS_IDS.join(", ")}.`
    );
  }
  assertNoAmbientHarnessSelector(options.env ?? {});
  const driver = validateHarnessDriver(factory(options));
  if (driver.harnessId !== requested) {
    throw new Error(`Harness Driver registry entry ${requested} resolved to ${driver.harnessId}.`);
  }
  return driver;
}

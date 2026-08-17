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

import {
  CLAUDE_CODE_HARNESS_ID,
  createClaudeCodeDriver,
  createClaudeCodeDriverV2,
} from "./claude-code-driver.mjs";
import {
  ROUTE_AUTHORITY_VALUES,
  ROUTE_REQUEST_FIELDS,
  ROUTE_TOPOLOGY_VALUES,
  admittedDriverDescription,
  assertHarnessId,
  validateCanonicalRoute,
  validateDriverV2,
  validateHarnessDriver,
  validateInstanceInspection,
} from "./harness-contract.mjs";

/**
 * Every Harness this generation admits.
 *
 * The table is keyed by each Driver's own published identity. This registry
 * holds no default, preferred, or fallback Harness: a caller that has not
 * stated one has not stated a route, and route resolution fails closed rather
 * than choosing for it.
 */
export const ADMITTED_HARNESS_IDS = Object.freeze([CLAUDE_CODE_HARNESS_ID]);

const DRIVER_FACTORIES = Object.freeze({
  [CLAUDE_CODE_HARNESS_ID]: createClaudeCodeDriver,
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
  "harness_endpoint",
  "harness_instance",
  "driver",
  "driver_module",
  "driver_path",
  "driver_endpoint",
  "capability_override",
  "claude_bin",
  "claude_config_dir",
  "env_file",
  "settings_path",
  // A service-backed Harness makes endpoint, instance, and credential inputs
  // the same class of selector as a module path: fixed operator configuration
  // resolved by the Driver, never a model-facing or caller-facing choice.
  "endpoint",
  "base_url",
  "api_base",
  "service_url",
  "instance",
  "instance_key",
  "api_key",
  "auth_token",
  "access_token",
  "credentials",
]);

const REJECTED_ENV_SELECTORS = Object.freeze([
  "CC_HARNESS_ID",
  "CC_HARNESS_DRIVER",
  "CC_HARNESS_DRIVER_MODULE",
  "CC_HARNESS_DRIVER_PATH",
  "CC_HARNESS_CAPABILITIES",
  "CC_HARNESS_REGISTRY",
  "CC_HARNESS_ENDPOINT",
  "CC_HARNESS_INSTANCE",
  "CC_DRIVER_ENDPOINT",
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

/**
 * Every Harness resolution states its Harness. There is no default, inherited,
 * or remembered choice: an unstated Harness is refused here, before route
 * validation, durable Agent creation, or any native launch.
 */
export function assertStatedHarnessId(harnessId, operation) {
  if (typeof harnessId !== "string" || !harnessId.trim()) {
    throw new Error(
      `${operation} requires an explicit Harness: this runtime resolves no default Harness Driver.`
    );
  }
  return harnessId.trim();
}

export function isAdmittedHarnessId(value) {
  return ADMITTED_HARNESS_IDS.includes(String(value ?? "").trim());
}

/**
 * Resolve one admitted Driver. An unknown Harness fails here, before route
 * validation, durable Agent creation, or any native process launch.
 */
export function resolveHarnessDriver(harnessId, options = {}) {
  const requested = assertHarnessId(assertStatedHarnessId(harnessId, "Harness Driver resolution"));
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

/**
 * Static version-two Driver table.
 *
 * It holds exactly the Drivers this checkout implements on Contract v2. A
 * Driver becomes resolvable only by being added to this literal in
 * checkout-owned source, so a fixture, environment value, persisted record, or
 * model-facing input can never make one appear at runtime.
 *
 * Admission is not activation: the current public generation still prepares
 * and runs turns through the version-one Claude Driver above, and no public
 * lifecycle path resolves a version-two Driver in this generation.
 */
const DRIVER_V2_FACTORIES = Object.freeze({
  [CLAUDE_CODE_HARNESS_ID]: createClaudeCodeDriverV2,
});

export const ADMITTED_DRIVER_V2_HARNESS_IDS = Object.freeze(Object.keys(DRIVER_V2_FACTORIES));

/** Validate one version-two Driver for admission, wherever it came from. */
export function admitDriverV2(driver) {
  return validateDriverV2(driver);
}

/** Resolve one admitted version-two Driver from the static table. */
export function resolveDriverV2(harnessId, options = {}) {
  const requested = assertHarnessId(assertStatedHarnessId(harnessId, "Driver Contract v2 resolution"));
  const factory = DRIVER_V2_FACTORIES[requested];
  if (!factory) {
    throw new Error(
      `Unknown Harness ${requested}. This runtime admits only these Driver Contract v2 Harnesses: ` +
      `${ADMITTED_DRIVER_V2_HARNESS_IDS.join(", ") || "(none yet)"}.`
    );
  }
  assertNoAmbientHarnessSelector(options.env ?? {});
  const driver = admitDriverV2(factory(options));
  if (driver.harnessId !== requested) {
    throw new Error(`Harness Driver registry entry ${requested} resolved to ${driver.harnessId}.`);
  }
  return driver;
}

/** Everything a Driver sees while it owns one turn. */
export const DRIVER_SCOPE_FIELDS = Object.freeze([
  "agentId",
  "assignedInputs",
  "attemptId",
  "capabilities",
  "deadlineAt",
  "env",
  "harnessId",
  "purpose",
  "route",
  "rootId",
  "signal",
  "taskInput",
  "turnId",
  "turnOptions",
  "workspaceRoot",
]);

/** Everything a Driver sees while it inspects its static logical instances. */
export const DRIVER_INSPECTION_SCOPE_FIELDS = Object.freeze([
  "deadlineAt",
  "env",
  "harnessId",
  "purpose",
  "rootId",
  "signal",
  "workspaceRoot",
]);

const TURN_ONLY_SCOPE_FIELDS = Object.freeze(
  DRIVER_SCOPE_FIELDS.filter((field) => !DRIVER_INSPECTION_SCOPE_FIELDS.includes(field))
);

const MAX_INSPECTED_INSTANCES = 32;

/**
 * A least-authority view. Anything outside the exact admitted key set throws
 * instead of returning `undefined`, so a Driver that reaches for the registry,
 * durable store, MCP surface, another Driver, or an undeclared environment
 * value fails loudly at the boundary rather than degrading silently.
 */
/**
 * Keys the JavaScript runtime itself probes: promise assimilation reads `then`,
 * `JSON.stringify` reads `toJSON`, and string coercion or inspection reads the
 * ordinary `Object.prototype` members. Answering these from the frozen target
 * grants no authority — they see only the admitted own keys — while throwing on
 * them would make an ordinary `await`, log line, or serialization fail.
 */
const PROTOCOL_PROBE_KEYS = Object.freeze([
  "then",
  "toJSON",
  "toString",
  "toLocaleString",
  "valueOf",
  "inspect",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
]);

function leastAuthorityView(fields, describeForbidden, immutabilityMessage) {
  const target = Object.freeze({ ...fields });
  return new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === "symbol") return Reflect.get(object, property, receiver);
      if (Object.hasOwn(object, property)) return object[property];
      if (PROTOCOL_PROBE_KEYS.includes(property)) return Reflect.get(object, property, receiver);
      throw new Error(describeForbidden(property));
    },
    has(object, property) {
      return typeof property === "symbol" ? Reflect.has(object, property) : Object.hasOwn(object, property);
    },
    set() {
      throw new Error(immutabilityMessage);
    },
    defineProperty() {
      throw new Error(immutabilityMessage);
    },
    deleteProperty() {
      throw new Error(immutabilityMessage);
    },
  });
}

function driverEnvironmentView(driver, env) {
  const declared = admittedDriverDescription(driver).environmentKeys ?? [];
  /** @type {Record<string, string|null>} */
  const admitted = {};
  for (const key of declared) {
    const value = env?.[key];
    admitted[key] = typeof value === "string" && value.length > 0 ? value : null;
  }
  return leastAuthorityView(
    admitted,
    (property) =>
      `Harness Driver ${driver.harnessId} scope does not expose environment value ${String(property)}: ` +
      `only its declared fixed keys (${declared.join(", ") || "none"}) are visible.`,
    `Harness Driver ${driver.harnessId} environment view is immutable.`
  );
}

/**
 * Build the only object a Driver receives from the supervisor. It carries
 * identity, the immutable accepted route, bounded input, deadlines/signals, and
 * the Driver's declared fixed environment view — and no capability to mutate,
 * discover, or reach anything else.
 */
export function createDriverScope(input) {
  const driver = input?.driver;
  if (!driver || typeof driver !== "object") {
    throw new Error("A DriverScope requires the Driver it is built for.");
  }
  const purpose = input.purpose ?? "turn";
  if (!["turn", "inspect"].includes(purpose)) {
    throw new Error(`Unsupported DriverScope purpose: ${JSON.stringify(purpose)}.`);
  }
  const shared = {
    harnessId: driver.harnessId,
    purpose,
    rootId: input.rootId ?? null,
    workspaceRoot: input.workspaceRoot ?? null,
    deadlineAt: input.deadlineAt ?? null,
    signal: input.signal ?? null,
    env: driverEnvironmentView(driver, input.env ?? {}),
  };
  const fields = purpose === "inspect"
    ? shared
    : {
        ...shared,
        agentId: input.agentId ?? null,
        turnId: input.turnId ?? null,
        attemptId: input.attemptId ?? null,
        route: input.route == null ? null : Object.freeze({ ...input.route }),
        capabilities: input.route?.capabilities ?? null,
        taskInput: input.taskInput ?? null,
        turnOptions: input.turnOptions ?? null,
        assignedInputs: Object.freeze([...(input.assignedInputs ?? [])]),
      };
  return leastAuthorityView(
    fields,
    (property) =>
      purpose === "inspect" && TURN_ONLY_SCOPE_FIELDS.includes(String(property))
        ? `DriverScope ${String(property)} is not available during instance inspection: ` +
          `inspection is static and never sees the turn it may later serve.`
        : `DriverScope does not expose ${String(property)} to Harness Driver ${driver.harnessId}: ` +
          `stores, the registry, MCP operations, other Drivers, credentials, and arbitrary environment ` +
          `stay outside the Driver boundary.`,
    "DriverScope is immutable."
  );
}

/**
 * Inspect a Driver's statically configured logical instances. Inspection may
 * read a fixed executable, endpoint, or service status; it may not install, log
 * in, start, stop, or repair anything, which is why it receives an inspection
 * scope with no turn, task, or lifecycle authority.
 */
export async function inspectDriverInstances(driver, scope) {
  if (scope?.purpose !== "inspect") {
    throw new Error(
      `Harness Driver ${driver.harnessId} instance inspection requires an instance-inspection scope.`
    );
  }
  if (scope.harnessId !== driver.harnessId) {
    throw new Error(
      `Harness Driver ${driver.harnessId} instance inspection scope belongs to Harness ${scope.harnessId}.`
    );
  }
  const inspected = await driver.inspectInstances(scope);
  if (!Array.isArray(inspected)) {
    throw new Error(`Harness Driver ${driver.harnessId} instance inspection must return an array.`);
  }
  if (inspected.length > MAX_INSPECTED_INSTANCES) {
    throw new Error(
      `Harness Driver ${driver.harnessId} reported more than ${MAX_INSPECTED_INSTANCES} logical instances.`
    );
  }
  const seen = new Set();
  const instances = inspected.map((instance) => {
    const validated = validateInstanceInspection(instance, driver);
    if (seen.has(validated.instanceKey)) {
      throw new Error(
        `Harness Driver ${driver.harnessId} reported instance key ${validated.instanceKey} twice.`
      );
    }
    seen.add(validated.instanceKey);
    return validated;
  });
  return Object.freeze(instances);
}

/**
 * Accept one explicit canonical route against the admitted instances. This is
 * the whole route decision: there is no ranking, fallback, ordering preference,
 * or remembered previous choice, and every required field must be stated.
 */
export function acceptDriverRoute(driver, request, inspections) {
  assertNoHarnessImplementationSelector(request, "route validation");
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error(`Harness ${driver.harnessId} route request must be an object.`);
  }
  for (const key of Object.keys(request)) {
    if (!ROUTE_REQUEST_FIELDS.includes(key)) {
      throw new Error(
        `Harness ${driver.harnessId} route request declares an unknown field: ${key}. ` +
        `A caller states only ${ROUTE_REQUEST_FIELDS.join(", ")}; capabilities, policy, and ranking are ` +
        `not caller inputs.`
      );
    }
  }
  if (request.harnessId !== driver.harnessId) {
    throw new Error(
      `Harness ${driver.harnessId} route request must state an explicit harnessId for this Driver.`
    );
  }
  for (const field of ["model", "topology", "authority"]) {
    const value = request[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(
        `Harness ${driver.harnessId} route request must state an explicit ${field}: ` +
        `the runtime never defaults a route field.`
      );
    }
  }
  if (!ROUTE_TOPOLOGY_VALUES.includes(request.topology)) {
    throw new Error(
      `Harness ${driver.harnessId} route request declares an unsupported topology: ` +
      `${JSON.stringify(request.topology)}. Use one of: ${ROUTE_TOPOLOGY_VALUES.join(", ")}.`
    );
  }
  if (!ROUTE_AUTHORITY_VALUES.includes(request.authority)) {
    throw new Error(
      `Harness ${driver.harnessId} route request declares an unsupported authority: ` +
      `${JSON.stringify(request.authority)}. Use one of: ${ROUTE_AUTHORITY_VALUES.join(", ")}.`
    );
  }
  const eligible = (inspections ?? []).filter((instance) => instance.readiness === "ready");
  if (eligible.length === 0) {
    const detail = (inspections ?? [])
      .map((instance) => `${instance.instanceKey}=${instance.detailCode}`)
      .join(", ");
    throw new Error(
      `Harness ${driver.harnessId} has no ready logical instance (${detail || "no configured instance"}).`
    );
  }
  if (eligible.length > 1) {
    throw new Error(
      `Harness ${driver.harnessId} route validation is ambiguous: ` +
      `${eligible.length} ready logical instances (${eligible.map((instance) => instance.instanceKey).join(", ")}). ` +
      `This generation exposes no instance selector, so route validation fails closed.`
    );
  }
  const inspection = eligible[0];
  const route = validateCanonicalRoute(driver.validateRoute(request, inspection), {
    driver,
    inspection,
    request,
  });
  return Object.freeze({ route, inspection });
}

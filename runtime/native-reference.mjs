/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * The core-owned native session/turn reference envelope.
 *
 * `design.md` decision 5 gives both envelopes one exact six-field schema:
 * `{ version, harnessId, driverVersion, instanceKey, locatorVersion, locator }`.
 * Nothing here decides whether an envelope identifies a reusable session or an
 * exact accepted turn; that is always an explicit `kind` argument supplied by
 * the caller (never a self-reported envelope field), because a Driver's own
 * exact-schema locator validator is the only thing allowed to accept one shape
 * and refuse the other. A session locator can therefore never satisfy a turn
 * locator's Driver-owned shape, and vice versa.
 *
 * Everything here treats `reference`/`locator` as fully untrusted input that
 * may be a Proxy, may define accessor properties that execute code on read,
 * may be a subclassed/prototype-swapped container, or may carry a `__proto__`
 * field aimed at corrupting whatever this module builds. No ordinary property
 * access (`value.x`), array method (`.map`), or generic-object copy
 * (`Object.assign`, `{...value}`) is ever used on untrusted input: every read
 * goes through `util.types.isProxy()` plus `Object.getOwnPropertyDescriptors()`
 * so a getter, a Proxy trap, or a rewritten `Array.prototype` method can never
 * execute as a side effect of validation.
 *
 * This module has no dependency on `harness-contract.mjs` on purpose: it is
 * the lower-level, Driver-agnostic owner of envelope/locator structure, and
 * `harness-contract.mjs` composes it. A circular import between the two would
 * make that layering unverifiable.
 */

import { types } from "node:util";

const HARNESS_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const INSTANCE_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const MAX_DRIVER_VERSION_CHARS = 128;

export const NATIVE_REFERENCE_ENVELOPE_VERSION = 1;

/** The only two kinds a native reference envelope may be validated as. */
export const NATIVE_REFERENCE_KINDS = Object.freeze(["session", "turn"]);

/** The exact, closed field set of a native reference envelope. */
export const NATIVE_REFERENCE_ENVELOPE_FIELDS = Object.freeze([
  "version",
  "harnessId",
  "driverVersion",
  "instanceKey",
  "locatorVersion",
  "locator",
]);

/**
 * Explicit byte/depth/key/scalar bounds for a Driver locator. A locator
 * identifies one native session or turn; it is not a place for arbitrary
 * JSON, so these bounds stay small relative to the existing bounded receipt
 * and route-fact ceilings elsewhere in the Driver contract.
 */
export const MAX_NATIVE_LOCATOR_BYTES = 2 * 1024;
export const MAX_NATIVE_LOCATOR_DEPTH = 4;
export const MAX_NATIVE_LOCATOR_KEYS = 12;
export const MAX_NATIVE_LOCATOR_SCALAR_CHARS = 256;

/**
 * Field names that would rewrite object structure rather than store a value
 * if ever assigned through an ordinary `[[Set]]`-based copy (`obj[key] = v`
 * on an object whose prototype chain includes `Object.prototype`). This
 * module never uses such a copy for untrusted keys, but these three names are
 * additionally refused outright: a locator never has a legitimate reason to
 * carry a field named this way, so failing closed on the name itself is
 * strictly safer than relying only on the safe-construction discipline below.
 */
const STRUCTURAL_POLLUTION_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Locator key vocabulary that can never enter durable state, grouped by the
 * excluded category from `design.md` decision 13 and the durable-runtime-state
 * spec: secret/credential material, fixed configuration, prompt text, model
 * output, live endpoints, and environment values. Matching is done on a
 * lower-cased, punctuation-stripped key so `api_key`, `apiKey`, and `API-KEY`
 * are refused alike, while unrelated identifiers such as `sessionId` or
 * `turnId` are left untouched.
 */
const FORBIDDEN_LOCATOR_KEY_WORDS = Object.freeze({
  secret: Object.freeze([
    "secret", "password", "passwd", "pwd", "passphrase", "credential", "credentials", "token",
    "apikey", "privatekey", "jwt", "bearer", "authorization", "auth", "cookie", "header", "headers",
    "refreshtoken", "accesstoken",
  ]),
  config: Object.freeze(["config", "configuration", "settings", "setting"]),
  prompt: Object.freeze(["prompt", "instruction", "instructions", "systemprompt"]),
  output: Object.freeze([
    "output", "response", "answer", "transcript", "content", "body", "finalmessage",
  ]),
  endpoint: Object.freeze([
    "endpoint", "url", "uri", "host", "hostname", "address", "baseurl",
  ]),
  environment: Object.freeze(["env", "environment", "envvar"]),
});

/**
 * Absolute-URL-shaped scalar *values* (not just keys) are refused
 * structurally: `specs/durable-runtime-state/spec.md` excludes "arbitrary
 * endpoints" from a locator regardless of which field carries one. This is
 * defense in depth, not a secret scanner -- the Driver's own exact locator
 * schema remains the primary proof that a value is the identity it claims to
 * be; scanning value shapes here cannot prove the absence of every secret.
 */
const URL_SHAPE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function normalizeLocatorKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The forbidden category a locator key belongs to, or `null` when it is admitted. */
export function forbiddenNativeLocatorKeyCategory(key) {
  const normalized = normalizeLocatorKey(key);
  for (const [category, words] of Object.entries(FORBIDDEN_LOCATOR_KEY_WORDS)) {
    if (words.some((word) => normalized.includes(word))) return category;
  }
  return null;
}

/**
 * `true` only for a non-Proxy object whose prototype is exactly
 * `Object.prototype` or `null`. `util.types.isProxy()` is checked first and
 * unconditionally, before `Array.isArray()` or `Object.getPrototypeOf()`, so
 * this never performs a reflective operation on a value that might be a
 * Proxy wrapping something else entirely.
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  if (types.isProxy(value)) return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertLocatorScalar(value, label) {
  if (value === null) return;
  const type = typeof value;
  if (type === "string") {
    if (value.includes("\0")) throw new Error(`${label} must not contain a NUL byte.`);
    if (value.length > MAX_NATIVE_LOCATOR_SCALAR_CHARS) {
      throw new Error(`${label} exceeds ${MAX_NATIVE_LOCATOR_SCALAR_CHARS} characters.`);
    }
    if (URL_SHAPE_PATTERN.test(value)) {
      throw new Error(
        `${label} looks like a URL/URI (${JSON.stringify(value.slice(0, 32))}...); a locator excludes ` +
        `arbitrary endpoints. Fixed operator configuration owns endpoints, not a durable native reference.`
      );
    }
    return;
  }
  if (type === "boolean") return;
  if (type === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
    return;
  }
  throw new Error(`${label} must be bounded text, a finite number, a boolean, or null; got ${type}.`);
}

/**
 * Reject an own property that is not a plain (non-accessor) data property,
 * without ever invoking a getter/setter: this reads only the descriptor
 * object itself (`"value" in descriptor`, `descriptor.get`, `descriptor.set`),
 * never the underlying property.
 */
function assertNonAccessorDescriptor(descriptor, label) {
  if (!("value" in descriptor) || typeof descriptor.get === "function" || typeof descriptor.set === "function") {
    throw new Error(`${label} must be a plain data property, not a getter/setter accessor.`);
  }
}

/**
 * The stricter form used for ordinary fields/elements: plain data *and*
 * enumerable. Not used for an array's own `length`, which is a non-accessor
 * data property that is non-enumerable on every ordinary Array by spec.
 */
function assertPlainDataDescriptor(descriptor, label) {
  assertNonAccessorDescriptor(descriptor, label);
  if (!descriptor.enumerable) {
    throw new Error(`${label} must be an enumerable own property.`);
  }
}

/**
 * Validate one locator array using descriptors only. `value.map`, `value[i]`,
 * and every other attacker-reachable method/accessor on the array are never
 * invoked: the own descriptor table is read once via
 * `Object.getOwnPropertyDescriptors()`, and every element is read through
 * `descriptor.value`. Only an ordinary `Array.prototype` array with no holes,
 * no extra/symbol keys, and no accessor elements is admitted; the canonical
 * clone is rebuilt index by index from the validated descriptors.
 */
function walkLocatorArray(value, { label, depth, visited }) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must be an ordinary Array; subclassed or prototype-swapped arrays are not admitted.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not carry symbol-keyed fields.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor) {
    throw new Error(`${label} must have an ordinary length.`);
  }
  assertNonAccessorDescriptor(lengthDescriptor, `${label} length`);
  const length = lengthDescriptor.value;
  if (!Number.isInteger(length) || length < 0) {
    throw new Error(`${label} must have an ordinary non-negative integer length.`);
  }
  if (length > MAX_NATIVE_LOCATOR_KEYS) {
    throw new Error(`${label} array exceeds ${MAX_NATIVE_LOCATOR_KEYS} items.`);
  }
  // Every own key must be exactly "length" or a canonical dense index string
  // in range; this is a pure string-shape check against the key itself, so an
  // extra key such as an accessor-backed "then" is refused by its name alone,
  // without ever inspecting -- let alone invoking -- its descriptor.
  const seenIndices = new Set();
  for (const key of keys) {
    if (key === "length") continue;
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) {
      throw new Error(`${label} declares a non-index field: ${JSON.stringify(key)}.`);
    }
    seenIndices.add(Number(key));
  }
  for (let index = 0; index < length; index += 1) {
    if (!seenIndices.has(index)) {
      throw new Error(`${label} contains a hole at index ${index}; sparse arrays are not admitted.`);
    }
  }
  const clone = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    assertPlainDataDescriptor(descriptor, `${label}[${index}]`);
    clone.push(walkLocatorValue(descriptor.value, { label: `${label}[${index}]`, depth: depth + 1, visited }));
  }
  return Object.freeze(clone);
}

/**
 * Validate one locator object using descriptors only, and rebuild it field by
 * field with `Object.defineProperty()` on a fresh ordinary object. Unlike
 * `clone[key] = value`, `Object.defineProperty()` always creates an own data
 * property regardless of key name -- including `__proto__` -- so it can never
 * be tricked into rewriting `clone`'s prototype instead of storing a field.
 * `__proto__`/`prototype`/`constructor` are additionally refused by name.
 */
function walkLocatorObject(value, { label, depth, visited }) {
  if (!isPlainObject(value)) {
    throw new Error(
      `${label} must be a plain data object; live handles, class instances, and built-in ` +
      `containers (Map/Set/Date/Buffer/RegExp/Error/socket/stream) are not admitted.`
    );
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not carry symbol-keyed fields.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_NATIVE_LOCATOR_KEYS) {
    throw new Error(`${label} exceeds ${MAX_NATIVE_LOCATOR_KEYS} fields at one level.`);
  }
  const clone = {};
  for (const key of keys) {
    if (STRUCTURAL_POLLUTION_KEYS.has(key)) {
      throw new Error(
        `${label} field ${JSON.stringify(key)} would rewrite object structure and is not admitted.`
      );
    }
    const descriptor = descriptors[key];
    assertPlainDataDescriptor(descriptor, `${label} field ${JSON.stringify(key)}`);
    const forbidden = forbiddenNativeLocatorKeyCategory(key);
    if (forbidden) {
      throw new Error(
        `${label} field ${JSON.stringify(key)} is a forbidden ${forbidden}-shaped key. Locators exclude ` +
        `secret/config/prompt/output/endpoint/environment-shaped fields; that fixed material belongs to ` +
        `Driver configuration, not a durable native reference.`
      );
    }
    const validatedValue = walkLocatorValue(descriptor.value, {
      label: `${label}.${key}`, depth: depth + 1, visited,
    });
    Object.defineProperty(clone, key, {
      value: validatedValue, enumerable: true, writable: false, configurable: false,
    });
  }
  return Object.freeze(clone);
}

/**
 * Walk one locator value. `util.types.isProxy()` is checked before any other
 * reflective operation (`Array.isArray`, `Object.getPrototypeOf`,
 * `Object.getOwnPropertyDescriptors`), so a Proxy is refused before any of
 * its traps can run. A real `Promise` is refused by the plain-object
 * prototype check (its prototype is `Promise.prototype`, never
 * `Object.prototype`); a plain object with a function-valued `then` field is
 * refused by the generic function check in `walkLocatorObject` -- neither
 * path ever reads `value.then` directly, so a `then` getter never executes.
 */
function walkLocatorValue(value, { label, depth, visited }) {
  if (depth > MAX_NATIVE_LOCATOR_DEPTH) {
    throw new Error(`${label} exceeds its maximum nesting depth of ${MAX_NATIVE_LOCATOR_DEPTH}.`);
  }
  const type = typeof value;
  if (type === "function") {
    throw new Error(`${label} must not carry a function or callback.`);
  }
  if (type === "symbol" || type === "bigint" || type === "undefined") {
    throw new Error(`${label} must not carry a ${type} value.`);
  }
  if (value === null || type !== "object") {
    assertLocatorScalar(value, label);
    return value;
  }
  if (types.isProxy(value)) {
    throw new Error(`${label} must not be a Proxy.`);
  }
  if (visited.has(value)) {
    throw new Error(`${label} contains a cycle.`);
  }
  visited.add(value);
  try {
    return Array.isArray(value)
      ? walkLocatorArray(value, { label, depth, visited })
      : walkLocatorObject(value, { label, depth, visited });
  } finally {
    visited.delete(value);
  }
}

/**
 * Validate one Driver locator's shape, independent of any Driver. Returns a
 * deep-frozen canonical clone -- built entirely from validated descriptor
 * values via `Object.defineProperty()`, never from a naive property copy --
 * safe to persist and to hand to a Driver's own exact-schema locator
 * validator.
 */
export function assertNativeReferenceLocatorShape(locator, label) {
  if (types.isProxy(locator)) {
    throw new Error(`${label} locator must not be a Proxy.`);
  }
  if (!isPlainObject(locator)) {
    throw new Error(`${label} locator must be a bounded plain object.`);
  }
  const canonical = walkLocatorValue(locator, { label: `${label} locator`, depth: 1, visited: new Set() });
  const bytes = Buffer.byteLength(JSON.stringify(canonical), "utf8");
  if (bytes > MAX_NATIVE_LOCATOR_BYTES) {
    throw new Error(`${label} locator exceeds ${MAX_NATIVE_LOCATOR_BYTES} bytes.`);
  }
  return canonical;
}

/**
 * Validate the six-field envelope shape, independent of any Driver or route.
 * A Proxy is refused before any reflective operation. Every field is read
 * exactly once, from a single `Object.getOwnPropertyDescriptors()` snapshot,
 * directly into the returned snapshot object -- `reference` itself is never
 * read again by this function or by any caller, so a getter cannot answer
 * differently the second time and a Proxy trap cannot execute at all.
 * @param {*} reference
 * @param {string} label
 * @returns {{version?: number, harnessId?: string, driverVersion?: string, instanceKey?: string, locatorVersion?: number, locator?: *}}
 */
export function assertNativeReferenceEnvelopeShape(reference, label) {
  if (types.isProxy(reference)) {
    throw new Error(`${label} must not be a Proxy.`);
  }
  if (!isPlainObject(reference)) {
    throw new Error(`${label} must be a plain object.`);
  }
  if (Object.getOwnPropertySymbols(reference).length > 0) {
    throw new Error(`${label} must not carry symbol-keyed fields.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(reference);
  const keys = Object.keys(descriptors);
  for (const key of keys) {
    if (!NATIVE_REFERENCE_ENVELOPE_FIELDS.includes(key)) {
      throw new Error(`${label} declares an unknown field: ${key}.`);
    }
  }
  /** @type {{version?: number, harnessId?: string, driverVersion?: string, instanceKey?: string, locatorVersion?: number, locator?: *}} */
  const snapshot = {};
  for (const field of NATIVE_REFERENCE_ENVELOPE_FIELDS) {
    const descriptor = descriptors[field];
    if (!descriptor) {
      throw new Error(`${label} is missing required field: ${field}.`);
    }
    assertPlainDataDescriptor(descriptor, `${label} field ${field}`);
    snapshot[field] = descriptor.value;
  }
  if (snapshot.version !== NATIVE_REFERENCE_ENVELOPE_VERSION) {
    throw new Error(
      `${label} declares unsupported envelope version ${JSON.stringify(snapshot.version ?? null)}; ` +
      `this runtime requires version ${NATIVE_REFERENCE_ENVELOPE_VERSION}.`
    );
  }
  if (typeof snapshot.harnessId !== "string" || !HARNESS_ID_PATTERN.test(snapshot.harnessId)) {
    throw new Error(`${label} has an invalid Harness ID: ${JSON.stringify(snapshot.harnessId ?? null)}.`);
  }
  if (
    typeof snapshot.driverVersion !== "string" ||
    !snapshot.driverVersion.trim() ||
    snapshot.driverVersion.length > MAX_DRIVER_VERSION_CHARS
  ) {
    throw new Error(`${label} has an invalid Driver version.`);
  }
  if (typeof snapshot.instanceKey !== "string" || !INSTANCE_KEY_PATTERN.test(snapshot.instanceKey)) {
    throw new Error(
      `${label} has an invalid logical instance key: ${JSON.stringify(snapshot.instanceKey ?? null)}.`
    );
  }
  if (!Number.isInteger(snapshot.locatorVersion) || snapshot.locatorVersion < 1) {
    throw new Error(
      `${label} has an invalid locator version: ${JSON.stringify(snapshot.locatorVersion ?? null)}.`
    );
  }
  return Object.freeze(snapshot);
}

/**
 * Validate one native reference envelope end to end: exact envelope shape,
 * route/Driver identity, bounded locator content, and finally the owning
 * Driver's own exact-schema locator validator for the explicit `kind`.
 *
 * Every field is read from `reference` exactly once, inside
 * `assertNativeReferenceEnvelopeShape()`'s snapshot; every subsequent check
 * and the final `boundedReference` are built purely from that snapshot and
 * from `assertNativeReferenceLocatorShape()`'s canonical locator clone --
 * `reference`/`reference.locator` are never read a second time, so a getter
 * cannot return a different value between the shape check and the value
 * actually persisted.
 *
 * A Driver's locator validator may only confirm or refuse: it must return
 * `boundedReference` itself, by identity (`===`). Any other return --
 * `null`, a deep-equal clone, an altered copy, or a Proxy wrapping the exact
 * object -- is refused without ever reading a property off it, so a
 * malicious return value's getters/traps/`toJSON` can never execute.
 * @param {*} reference
 * @param {{driver?: *, kind?: string, route?: *}} [options]
 */
export function validateNativeReferenceEnvelope(reference, { driver, kind, route } = {}) {
  if (!NATIVE_REFERENCE_KINDS.includes(kind)) {
    throw new Error(
      `Native reference validation requires an explicit kind of ${NATIVE_REFERENCE_KINDS.join(" or ")}.`
    );
  }
  if (!driver || typeof driver !== "object") {
    throw new Error("Native reference validation requires the owning Harness Driver.");
  }
  const label = `Harness ${driver.harnessId} native ${kind} reference`;
  const snapshot = assertNativeReferenceEnvelopeShape(reference, label);
  if (snapshot.harnessId !== driver.harnessId) {
    throw new Error(
      `${label} belongs to Harness ${JSON.stringify(snapshot.harnessId)}; expected ${driver.harnessId}.`
    );
  }
  if (snapshot.driverVersion !== driver.driverVersion) {
    throw new Error(`${label} declares a foreign Driver version.`);
  }
  if (route != null && snapshot.instanceKey !== route.instanceKey) {
    throw new Error(
      `${label} belongs to logical instance ${JSON.stringify(snapshot.instanceKey)}; ` +
      `expected ${route.instanceKey}.`
    );
  }
  const canonicalLocator = assertNativeReferenceLocatorShape(snapshot.locator, label);
  const boundedReference = Object.freeze({
    version: NATIVE_REFERENCE_ENVELOPE_VERSION,
    harnessId: snapshot.harnessId,
    driverVersion: snapshot.driverVersion,
    instanceKey: snapshot.instanceKey,
    locatorVersion: snapshot.locatorVersion,
    locator: canonicalLocator,
  });
  const validator = kind === "session" ? driver.validateNativeSessionRef : driver.validateNativeTurnRef;
  if (typeof validator !== "function") {
    throw new Error(`Harness Driver ${driver.harnessId} does not implement a native ${kind} reference validator.`);
  }
  const validated = validator.call(driver, boundedReference);
  if (validated !== boundedReference) {
    throw new Error(
      `${label} Driver validator must return the exact bounded reference object it was given, by identity; ` +
      `a Driver may only confirm or refuse a native reference -- it may never clone, alter, widen, drop a ` +
      `field from, or wrap it, even in a value that would otherwise be content-identical.`
    );
  }
  return boundedReference;
}

// ---------------------------------------------------------------------------
// Canonical identity text.
//
// Two envelopes name the same native session/turn when their *validated
// values* are equal. Key insertion order is not a value: a Driver that builds
// its locator from one service response at start and another at settlement can
// emit `{sessionId, turnId}` once and `{turnId, sessionId}` the next time
// while naming the exact same turn. Comparing raw `JSON.stringify` text would
// read that as a foreign turn and strand the settlement -- so every identity
// comparison in this runtime goes through the deterministic, key-sorted text
// below instead.
//
// Sorting is deliberately applied to object keys only. Array order *is* a
// value: two locators that list the same elements in different order do not
// name the same thing, and silently sorting them would widen identity.
// ---------------------------------------------------------------------------

/**
 * Deterministic text for one already-canonical value: object keys sorted,
 * array order preserved, scalars emitted as JSON. The input has already been
 * through `assertNativeReferenceLocatorShape()`/`assertNativeReferenceEnvelopeShape()`,
 * so it is plain, bounded, cycle-free data by construction.
 */
function canonicalValueText(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalValueText).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValueText(value[key])}`).join(",")}}`;
}

/**
 * The canonical identity text of one native reference envelope: full envelope
 * and locator validation first, then order-independent serialization. Callers
 * compare these texts instead of comparing envelopes structurally, so identity
 * cannot drift between two comparison sites.
 *
 * @param {*} reference one native session or turn reference envelope
 * @param {string} label
 * @returns {string}
 */
export function canonicalNativeReferenceText(reference, label) {
  const snapshot = assertNativeReferenceEnvelopeShape(reference, label);
  const locator = assertNativeReferenceLocatorShape(snapshot.locator, label);
  return canonicalValueText({
    version: snapshot.version,
    harnessId: snapshot.harnessId,
    driverVersion: snapshot.driverVersion,
    instanceKey: snapshot.instanceKey,
    locatorVersion: snapshot.locatorVersion,
    locator,
  });
}

/**
 * Whether two envelopes name the exact same native session/turn by validated
 * value. An absent or structurally unrecognized envelope on either side is
 * never "the same as" anything -- including another absent one: identity must
 * be proven, and this predicate is used at seams where the fallback is holding
 * leases rather than publishing.
 *
 * @param {*} left
 * @param {*} right
 * @param {string} label
 * @returns {boolean}
 */
export function sameNativeReference(left, right, label) {
  if (left == null || right == null) return false;
  try {
    return canonicalNativeReferenceText(left, label) === canonicalNativeReferenceText(right, label);
  } catch {
    return false;
  }
}

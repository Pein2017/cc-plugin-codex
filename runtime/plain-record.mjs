/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trap-free plain-data snapshots.
 *
 * Contract and durable validators must be able to say that what they validated
 * is exactly what a later reader will see. An exotic object breaks that: a
 * Proxy trap, an accessor, or an inherited property can answer one way to a
 * validator and another way to persistence, a Driver, or a projection.
 *
 * This module owns that one decision. A record is admitted only if it is an
 * ordinary object with own, enumerable, non-polluting data properties, and
 * every value is read exactly once into a snapshot the caller then works from.
 */

import { types } from "node:util";

/** Keys that would let decoded data reach an object prototype chain. */
export const POLLUTING_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

/**
 * Snapshot one ordinary object's own data properties, exactly once each.
 *
 * A Proxy is refused before any trap can run, so no exotic object ever observes
 * validation at all.
 *
 * @returns {Record<string, *>} a null-prototype snapshot of the own data values
 */
export function plainRecordSnapshot(candidate, label) {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`${label} must be an object.`);
  }
  if (types.isProxy(candidate)) {
    throw new Error(`${label} must be a plain object, not a Proxy.`);
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object with no inherited prototype state.`);
  }
  if (Object.getOwnPropertySymbols(candidate).length > 0) {
    throw new Error(`${label} must not carry symbol-keyed state.`);
  }
  /** @type {Record<string, *>} */
  const snapshot = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(candidate))) {
    if (typeof descriptor.get === "function" || typeof descriptor.set === "function") {
      throw new Error(`${label} field ${key} must be a plain value, not an accessor.`);
    }
    if (!descriptor.enumerable) {
      throw new Error(`${label} field ${key} must be an enumerable own property.`);
    }
    if (POLLUTING_KEYS.includes(key)) {
      throw new Error(`${label} must not declare the prototype-polluting field ${key}.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

/**
 * Rebuild one bounded plain-data tree from single-read snapshots. The result
 * shares no structure, prototype, or exotic behavior with its source, so a
 * validator downstream of this cannot be shown a different object than the one
 * that will be stored or published.
 */
export function plainDataTree(value, label, maxDepth = 3, depth = 0) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new Error(`${label} must contain only plain data.`);
    }
    return value;
  }
  if (depth >= maxDepth) {
    throw new Error(`${label} is nested deeper than a durable record admits.`);
  }
  const snapshot = plainRecordSnapshot(value, label);
  /** @type {Record<string, *>} */
  const rebuilt = {};
  for (const key of Object.keys(snapshot)) {
    rebuilt[key] = plainDataTree(snapshot[key], `${label} field ${key}`, maxDepth, depth + 1);
  }
  return rebuilt;
}

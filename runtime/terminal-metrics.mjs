/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Closed, Harness-neutral terminal metrics.  This module deliberately accepts
 * no native event objects: Drivers select their own evidence before entering
 * this boundary.
 */

export const TERMINAL_METRICS_VERSION = 1;

const PROVIDER_FIELDS = Object.freeze([
  "duration_ms",
  "duration_api_ms",
  "turn_count",
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "reported_cost_usd",
]);
const PLUGIN_FIELDS = Object.freeze([
  "tool_call_count",
  "attempt_count",
  "recovery_attempt_count",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function admittedInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function admittedCost(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function closedKeys(value, fields) {
  return isPlainObject(value) && Object.keys(value).every((key) => fields.includes(key));
}

/** Select the only metrics admitted from a Claude terminal `result` event. */
export function normalizeClaudeTerminalProviderMetrics(event) {
  if (!isPlainObject(event)) return null;
  const usage = isPlainObject(event.usage) ? event.usage : {};
  const source = {
    duration_ms: event.duration_ms,
    duration_api_ms: event.duration_api_ms,
    turn_count: event.num_turns,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    reported_cost_usd: event.total_cost_usd,
  };
  const normalized = {};
  let admitted = false;
  for (const field of PROVIDER_FIELDS) {
    const value = field === "reported_cost_usd"
      ? admittedCost(source[field])
      : admittedInteger(source[field]);
    normalized[field] = value;
    admitted ||= value != null;
  }
  return admitted ? normalized : null;
}

/** Validate an already-selected provider object without accepting extra keys. */
export function normalizeProviderReportedMetrics(value) {
  if (value == null) return null;
  if (!closedKeys(value, PROVIDER_FIELDS)) return null;
  const normalized = {};
  let admitted = false;
  for (const field of PROVIDER_FIELDS) {
    const candidate = field === "reported_cost_usd"
      ? admittedCost(value[field])
      : admittedInteger(value[field]);
    // A non-null malformed value makes this source untrustworthy; do not
    // quietly turn a malformed native payload into a partial public receipt.
    if (value[field] != null && candidate == null) return null;
    normalized[field] = candidate;
    admitted ||= candidate != null;
  }
  return admitted ? normalized : null;
}

export function normalizePluginObservedMetrics(value) {
  if (value == null || !closedKeys(value, PLUGIN_FIELDS)) return null;
  const normalized = {};
  for (const field of PLUGIN_FIELDS) {
    const admitted = admittedInteger(value[field]);
    if (admitted == null) return null;
    normalized[field] = admitted;
  }
  return normalized;
}

/**
 * Return the closed version-one durable shape, or null when neither source
 * carries admissible evidence.  Unknown and payload-bearing fields never
 * survive this boundary.
 */
export function normalizeTerminalMetrics(value) {
  if (value == null) return null;
  if (!isPlainObject(value) || !closedKeys(value, ["version", "provider_reported", "plugin_observed"])) {
    return null;
  }
  if (value.version !== TERMINAL_METRICS_VERSION) return null;
  const providerReported = normalizeProviderReportedMetrics(value.provider_reported);
  const pluginObserved = normalizePluginObservedMetrics(value.plugin_observed);
  if (value.provider_reported != null && providerReported == null) return null;
  if (value.plugin_observed != null && pluginObserved == null) return null;
  if (providerReported == null && pluginObserved == null) return null;
  return {
    version: TERMINAL_METRICS_VERSION,
    provider_reported: providerReported,
    plugin_observed: pluginObserved,
  };
}

/**
 * @param {{
 *   providerReported?: unknown,
 *   toolCallCount?: unknown,
 *   attemptCount?: unknown,
 *   recoveryAttemptCount?: unknown,
 * }} evidence
 */
export function terminalMetricsFromEvidence({ providerReported = null, toolCallCount, attemptCount, recoveryAttemptCount } = {}) {
  const provider = normalizeProviderReportedMetrics(providerReported);
  const plugin = normalizePluginObservedMetrics({
    tool_call_count: toolCallCount,
    attempt_count: attemptCount,
    recovery_attempt_count: recoveryAttemptCount,
  });
  return normalizeTerminalMetrics({
    version: TERMINAL_METRICS_VERSION,
    provider_reported: provider,
    plugin_observed: plugin,
  });
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StreamParser } from "../../runtime/claude-headless-adapter.mjs";
import {
  normalizeClaudeTerminalProviderMetrics,
  normalizeTerminalMetrics,
  terminalMetricsFromEvidence,
} from "../../runtime/terminal-metrics.mjs";

describe("terminal metrics", () => {
  it("selects only admitted terminal result numbers and keeps partial error evidence", () => {
    const parser = new StreamParser();
    parser.feed(`${JSON.stringify({
      type: "result",
      subtype: "error",
      is_error: true,
      duration_ms: 12,
      duration_api_ms: "13",
      num_turns: 2,
      total_cost_usd: 0.004,
      usage: {
        input_tokens: 31,
        output_tokens: "bad",
        cache_creation_input_tokens: 3,
        cache_read_input_tokens: [9],
        nested: { private: "never project" },
      },
      result: "never retained by the metrics parser test",
      session_id: "never-project-session",
    })}\n`);
    assert.deepEqual(parser.state.providerReportedMetrics, {
      duration_ms: 12,
      duration_api_ms: null,
      turn_count: 2,
      input_tokens: 31,
      output_tokens: null,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: null,
      reported_cost_usd: 0.004,
    });
  });

  it("rejects malformed, unsafe, unknown, and payload-bearing normalized input", () => {
    assert.equal(normalizeClaudeTerminalProviderMetrics({ duration_ms: -1 }), null);
    assert.equal(normalizeClaudeTerminalProviderMetrics({ duration_ms: Number.MAX_SAFE_INTEGER + 1 }), null);
    assert.equal(normalizeClaudeTerminalProviderMetrics({ total_cost_usd: Infinity }), null);
    assert.equal(normalizeTerminalMetrics({
      version: 1,
      provider_reported: { duration_ms: 1, unknown: 2 },
      plugin_observed: null,
    }), null);
    assert.equal(normalizeTerminalMetrics({
      version: 1,
      provider_reported: null,
      plugin_observed: { tool_call_count: 1, attempt_count: [1], recovery_attempt_count: 0 },
    }), null);
  });

  it("returns closed nullable provider fields with retained Plugin counters", () => {
    assert.deepEqual(terminalMetricsFromEvidence({
      providerReported: null,
      toolCallCount: 2,
      attemptCount: 3,
      recoveryAttemptCount: 2,
    }), {
      version: 1,
      provider_reported: null,
      plugin_observed: {
        tool_call_count: 2,
        attempt_count: 3,
        recovery_attempt_count: 2,
      },
    });
  });
});

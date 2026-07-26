import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StreamParser,
  buildArgs,
  classifyClaudeFailure,
  encodeStreamUserMessage,
} from "../../runtime/claude-headless-adapter.mjs";

describe("Claude headless adapter", () => {
  it("builds the native bidirectional stream-json transport", () => {
    const args = buildArgs("ignored", {
      outputFormat: "stream-json",
      inputFormat: "stream-json",
      replayUserMessages: true,
      includeHookEvents: true,
    });
    assert.deepEqual(args, [
      "-p", "--output-format", "stream-json", "--verbose",
      "--include-partial-messages", "--input-format", "stream-json",
      "--replay-user-messages", "--include-hook-events",
    ]);
  });

  it("encodes user and steering messages with the same schema", () => {
    const event = JSON.parse(encodeStreamUserMessage("focus here"));
    assert.equal(event.type, "user");
    assert.equal(event.message.role, "user");
    assert.equal(event.message.content[0].text, "focus here");
  });

  it("passes through the explicit unrestricted Claude flag", () => {
    const args = buildArgs("ignored", {
      outputFormat: "stream-json",
      dangerouslySkipPermissions: true,
    });
    assert.equal(args.includes("--dangerously-skip-permissions"), true);
  });

  it("pins the supported canonical models and names only fresh sessions", () => {
    const initial = buildArgs("ignored", {
      model: "opus",
      effort: "xhigh",
      sessionName: "audit_agent",
    });
    assert.equal(initial[initial.indexOf("--model") + 1], "claude-opus-5");
    assert.equal(initial[initial.indexOf("--name") + 1], "audit_agent");

    const sonnet = buildArgs("ignored", { model: "claude-sonnet-5" });
    assert.equal(sonnet[sonnet.indexOf("--model") + 1], "claude-sonnet-5");
    const haiku = buildArgs("ignored", { model: "haiku", effort: "low" });
    assert.equal(haiku[haiku.indexOf("--model") + 1], "claude-haiku-4-5");
    assert.equal(haiku[haiku.indexOf("--effort") + 1], "low");
    assert.throws(() => buildArgs("ignored", { model: "fable" }), /Unsupported Claude model/);
    assert.throws(() => buildArgs("ignored", { model: "claude-opus-4-7" }), /Unsupported Claude model/);
    assert.throws(() => buildArgs("ignored", { model: "haiku-4-5" }), /Unsupported Claude model/);
    assert.throws(() => buildArgs("ignored", { model: "claude-haiku-4-5-20251001" }), /Unsupported Claude model/);

    const resumed = buildArgs("ignored", {
      model: "opus",
      sessionName: "audit_agent",
      resumeSessionId: "session-1",
    });
    assert.equal(resumed.includes("--name"), false);
    assert.equal(resumed[resumed.indexOf("--resume") + 1], "session-1");
  });

  it("retains session, partial output, and terminal completion", () => {
    const parser = new StreamParser();
    parser.feed(`${JSON.stringify({ type: "system", subtype: "init", session_id: "s-1" })}\n`);
    parser.feed(`${JSON.stringify({
      type: "stream_event",
      session_id: "s-1",
      event: { delta: { type: "text_delta", text: "partial" } },
    })}\n`);
    parser.feed(`${JSON.stringify({ type: "result", subtype: "success", session_id: "s-1", result: "partial" })}\n`);
    assert.equal(parser.state.sessionId, "s-1");
    assert.equal(parser.state.finalMessage, "partial");
    assert.equal(parser.state.receivedTerminalEvent, true);
  });

  it("classifies the observed mid-response close as resumable only with a session", () => {
    const withSession = classifyClaudeFailure({
      status: "failed",
      sessionId: "s-1",
      stderr: "API Error: Connection closed mid-response. The response above may be incomplete.",
    });
    assert.equal(withSession.kind, "transport_closed_resumable");
    assert.equal(withSession.resumable, true);
    const withoutSession = classifyClaudeFailure({
      status: "failed",
      sessionId: null,
      stderr: "Connection closed mid-response",
    });
    assert.equal(withoutSession.kind, "protocol_unknown");
  });

  it("classifies explicit account limits from terminal errors without confusing budgets or generic 429", () => {
    for (const message of [
      "You've hit your limit · resets 8pm",
      "Weekly usage limit exceeded for this subscription",
      "Quota exhausted: no remaining credits",
    ]) {
      const limited = classifyClaudeFailure({
        status: "failed",
        sessionId: "s-limit",
        exitCode: 1,
        terminalEvents: [{
          type: "result",
          subtype: "error_max_turns",
          is_error: true,
          errors: [message],
        }],
      });
      assert.equal(limited.kind, "usage_or_subscription_limit", message);
      assert.equal(limited.resumable, false, message);
    }

    const budget = classifyClaudeFailure({
      status: "failed",
      sessionId: "s-budget",
      terminalEvents: [{
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        result: "Reached maximum budget ($0.02)",
      }],
    });
    assert.equal(budget.kind, "fatal");
    assert.equal(budget.resumable, false);

    const transient = classifyClaudeFailure({
      status: "failed",
      sessionId: "s-429",
      stderr: "HTTP 429 rate limit exceeded; retry later",
    });
    assert.equal(transient.kind, "transport_closed_resumable");
    assert.equal(transient.resumable, true);

    for (const message of [
      "HTTP 429: rate limit exceeded for your current usage tier; retry later",
      "HTTP 429: request limit for API usage; retry after 30 seconds",
      "HTTP 429: You've hit your rate limit; retry after 30 seconds",
      "HTTP 429: You have reached your request limit; retry later",
      "HTTP 429: You've exceeded your rate limit",
    ]) {
      const rateLimited = classifyClaudeFailure({
        status: "failed",
        sessionId: "s-rate-tier",
        stderr: message,
      });
      assert.equal(rateLimited.kind, "transport_closed_resumable", message);
      assert.equal(rateLimited.resumable, true, message);
    }

    for (const message of [
      "Your current period allowance has been exhausted; resets tomorrow",
      "Current billing-period limit reached; resets tomorrow",
    ]) {
      const periodLimited = classifyClaudeFailure({
        status: "failed",
        sessionId: "s-period",
        terminalEvents: [{ type: "result", is_error: true, result: message }],
      });
      assert.equal(periodLimited.kind, "usage_or_subscription_limit", message);
      assert.equal(periodLimited.resumable, false, message);
    }

    const explicitBudget = classifyClaudeFailure({
      status: "failed",
      sessionId: "s-explicit-budget",
      terminalEvents: [{
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        result: "error_max_budget_usd: Usage limit reached after maximum budget ($0.02)",
      }],
    });
    assert.equal(explicitBudget.kind, "fatal");
    assert.equal(explicitBudget.resumable, false);
  });
});

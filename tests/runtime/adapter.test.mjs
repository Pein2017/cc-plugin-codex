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

  it("pins the only two supported models and names only fresh sessions", () => {
    const initial = buildArgs("ignored", {
      model: "opus",
      effort: "xhigh",
      sessionName: "audit_agent",
    });
    assert.equal(initial[initial.indexOf("--model") + 1], "claude-opus-5");
    assert.equal(initial[initial.indexOf("--name") + 1], "audit_agent");

    const sonnet = buildArgs("ignored", { model: "claude-sonnet-5" });
    assert.equal(sonnet[sonnet.indexOf("--model") + 1], "claude-sonnet-5");
    assert.throws(() => buildArgs("ignored", { model: "fable" }), /Unsupported Claude model/);
    assert.throws(() => buildArgs("ignored", { model: "claude-opus-4-7" }), /Unsupported Claude model/);

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
});

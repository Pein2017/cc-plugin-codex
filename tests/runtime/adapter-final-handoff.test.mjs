import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StreamParser,
  classifyClaudeFailure,
  validateTurnCompletion,
} from "../../runtime/claude-headless-adapter.mjs";

function feedEvent(parser, event) {
  parser.feed(`${JSON.stringify(event)}\n`);
}

function streamEvent(event) {
  return { type: "stream_event", session_id: "session-final", event };
}

describe("Claude final handoff boundaries", () => {
  it("selects only the latest complete outer-assistant message", () => {
    const parser = new StreamParser();
    feedEvent(parser, {
      type: "system",
      subtype: "init",
      session_id: "session-final",
    });
    feedEvent(parser, streamEvent({
      type: "message_start",
      message: { role: "assistant" },
    }));
    feedEvent(parser, streamEvent({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "I'll inspect the repository first." },
    }));
    feedEvent(parser, streamEvent({ type: "message_stop" }));
    feedEvent(parser, streamEvent({
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        name: "Read",
        input: { file_path: "/tmp/example.mjs" },
      },
    }));
    feedEvent(parser, streamEvent({
      type: "message_start",
      message: { role: "assistant" },
    }));
    feedEvent(parser, streamEvent({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "Final evidence memo." },
    }));
    feedEvent(parser, streamEvent({ type: "message_stop" }));
    feedEvent(parser, {
      type: "result",
      subtype: "success",
      session_id: "session-final",
      result: "I'll inspect the repository first.\nFinal evidence memo.",
    });

    assert.equal(parser.state.finalMessage, "Final evidence memo.");
    assert.equal(parser.state.assistantOutputObserved, true);
  });

  it("does not mistake terminal authentication prose for useful assistant output", () => {
    const parser = new StreamParser();
    feedEvent(parser, {
      type: "result",
      subtype: "error",
      is_error: true,
      session_id: "session-auth-failure",
      result: "OAuth access token has expired. Re-authenticate to continue.",
    });
    assert.equal(parser.state.assistantOutputObserved, false);
  });

  it("persists bounded tool metadata without arbitrary input values", () => {
    const parser = new StreamParser();
    feedEvent(parser, streamEvent({
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        name: "Write",
        input: {
          file_path: "/tmp/generated.txt",
          content: "sensitive".repeat(300_000),
        },
      },
    }));

    assert.deepEqual(parser.state.toolUses, [{
      tool: "Write",
      inputKeys: ["content", "file_path"],
    }]);
    assert.equal(JSON.stringify(parser.state.toolUses).includes("sensitive"), false);
    assert.ok(Buffer.byteLength(JSON.stringify(parser.state.toolUses)) < 1_024);
    assert.deepEqual(parser.state.touchedFiles, ["/tmp/generated.txt"]);
  });

  it("persists only bounded unknown type/subtype counts, never event payloads", () => {
    const parser = new StreamParser();
    const secret = [
      "hook-body-secret",
      "prompt-secret",
      "tool-input-secret",
      "http://proxy-user:proxy-password@example.invalid",
      "credential-secret",
      "native-session-secret",
    ].join(" ");
    feedEvent(parser, {
      type: "future_task",
      subtype: "started",
      session_id: "native-session-secret",
      hook: secret,
      prompt: secret,
      tool_input: { value: secret.repeat(20_000) },
      credentials: { token: secret },
      proxy: secret,
      session: { transcript: secret },
    });
    feedEvent(parser, {
      type: "future_task",
      subtype: "started",
      payload: secret.repeat(20_000),
    });
    feedEvent(parser, {
      type: "system",
      subtype: "future_hook",
      hook_body: secret.repeat(20_000),
    });

    const serialized = JSON.stringify(parser.state.unknownEvents);
    assert.deepEqual(parser.state.unknownEvents, [
      { type: "future_task", subtype: "started", count: 2 },
      { type: "system", subtype: "future_hook", count: 1 },
    ]);
    assert.equal(parser.state.unknownEventCount, 3);
    assert.equal(parser.state.unknownEventOverflowCount, 0);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes("proxy-user"), false);
    assert.ok(Buffer.byteLength(serialized, "utf8") < 4 * 1024);
  });

  it("keeps unknown metadata out of terminal classification", () => {
    const parser = new StreamParser();
    feedEvent(parser, {
      type: "native_background_task",
      subtype: "candidate",
      arbitrary: "must be discarded",
    });
    feedEvent(parser, {
      type: "result",
      subtype: "success",
      session_id: "session-final",
      result: "clean completion",
    });

    assert.deepEqual(validateTurnCompletion(parser.state, 0), { status: "completed" });
  });

  it("bounds unknown protocol identities and records overflow without payload retention", () => {
    const parser = new StreamParser();
    for (let index = 0; index < 80; index += 1) {
      feedEvent(parser, {
        type: `future_protocol_${index}_${"x".repeat(40)}`,
        subtype: `phase_${index}`,
        payload: `secret-${index}`.repeat(10_000),
      });
    }

    const serialized = JSON.stringify(parser.state.unknownEvents);
    assert.equal(parser.state.unknownEventCount, 80);
    assert.ok(parser.state.unknownEvents.length <= 50);
    assert.ok(parser.state.unknownEventOverflowCount > 0);
    assert.ok(Buffer.byteLength(serialized, "utf8") <= 4 * 1024);
    assert.equal(serialized.includes("secret-"), false);
  });

  it("keeps a completed tool-only outer-assistant handoff empty", () => {
    const parser = new StreamParser();
    feedEvent(parser, streamEvent({
      type: "message_start",
      message: { role: "assistant" },
    }));
    feedEvent(parser, streamEvent({
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        name: "Read",
        input: { file_path: "/tmp/example.mjs" },
      },
    }));
    feedEvent(parser, streamEvent({ type: "message_stop" }));
    feedEvent(parser, {
      type: "result",
      subtype: "success",
      session_id: "session-final",
      result: "Earlier narration that must not be resurrected.",
    });

    assert.equal(parser.state.finalMessage, "");
  });

  it("does not derive Harness failure from assistant prose", () => {
    const classified = classifyClaudeFailure({
      status: "failed",
      sessionId: "session-final",
      exitCode: 1,
      finalMessage: [
        "The audit discusses a weekly quota exhausted by another service.",
        "It also quotes a child command that printed Permission denied.",
      ].join("\n"),
    });

    assert.equal(classified.kind, "fatal");
    assert.equal(classified.resumable, false);
  });

  it("does not derive account exhaustion from a successful assistant session-limit discussion", () => {
    const classified = classifyClaudeFailure({
      status: "completed",
      finalMessage: "You've hit your session limit when this test account is exhausted.",
      terminalEvents: [{
        type: "result",
        subtype: "success",
        is_error: false,
        result: "You've hit your session limit when this test account is exhausted.",
      }],
    });

    assert.equal(classified.kind, null);
    assert.equal(classified.resumable, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StreamParser,
  classifyClaudeFailure,
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
});

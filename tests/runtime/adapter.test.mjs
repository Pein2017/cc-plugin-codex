import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  StreamParser,
  buildArgs,
  classifyClaudeFailure,
  encodeStreamUserMessage,
  runClaudeTurn,
} from "../../runtime/claude-headless-adapter.mjs";

const temporaryRoots = [];

afterEach(() => {
  while (temporaryRoots.length) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

function fakeClaude(root) {
  const bin = path.join(root, "fake-claude");
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require("node:fs");
const inputFile = process.env.CC_TEST_INPUT_FILE;
const acceptedFile = process.env.CC_TEST_ACCEPTED_FILE;
const observedFile = process.env.CC_TEST_OBSERVED_FILE;
const terminatedFile = process.env.CC_TEST_TERMINATED_FILE;
let finished = false;
process.stdin.on("data", (chunk) => {
  fs.appendFileSync(inputFile, chunk);
  if (finished) return;
  finished = true;
  fs.writeFileSync(observedFile, JSON.stringify({ accepted: fs.existsSync(acceptedFile) }));
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "fake-session" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: "fake-session", result: "ok" }) + "\\n", () => process.exit(0));
});
process.on("SIGTERM", () => {
  fs.writeFileSync(terminatedFile, "terminated");
  process.exit(0);
});
setInterval(() => {}, 1_000);
`, "utf8");
  fs.chmodSync(bin, 0o755);
  return bin;
}

function turnFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-adapter-launch-"));
  temporaryRoots.push(root);
  return {
    root,
    bin: fakeClaude(root),
    inputFile: path.join(root, "stdin.log"),
    acceptedFile: path.join(root, "accepted"),
    observedFile: path.join(root, "observed.json"),
    terminatedFile: path.join(root, "terminated"),
  };
}

function fixtureEnv(fixture) {
  return {
    ...process.env,
    CC_TEST_INPUT_FILE: fixture.inputFile,
    CC_TEST_ACCEPTED_FILE: fixture.acceptedFile,
    CC_TEST_OBSERVED_FILE: fixture.observedFile,
    CC_TEST_TERMINATED_FILE: fixture.terminatedFile,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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
    const permissionRespecting = buildArgs("ignored", {
      outputFormat: "stream-json",
    });
    assert.equal(permissionRespecting.includes("--dangerously-skip-permissions"), false);
  });

  it("pins canonical model aliases, every explicit effort, and names only fresh sessions", () => {
    const initial = buildArgs("ignored", {
      model: "opus",
      effort: "xhigh",
      sessionName: "audit_agent",
    });
    assert.equal(initial[initial.indexOf("--model") + 1], "claude-opus-5");
    assert.equal(initial[initial.indexOf("--name") + 1], "audit_agent");

    for (const [requested, canonical] of [
      ["haiku", "claude-haiku-4-5"],
      ["claude-haiku-4-5", "claude-haiku-4-5"],
      ["sonnet", "claude-sonnet-5"],
      ["claude-sonnet-5", "claude-sonnet-5"],
      ["opus", "claude-opus-5"],
      ["claude-opus-5", "claude-opus-5"],
      ["fable", "claude-fable-5"],
      ["claude-fable-5", "claude-fable-5"],
    ]) {
      const args = buildArgs("ignored", { model: requested });
      assert.equal(args[args.indexOf("--model") + 1], canonical);
    }
    for (const [model, canonical] of [
      ["haiku", "claude-haiku-4-5"],
      ["sonnet", "claude-sonnet-5"],
      ["opus", "claude-opus-5"],
      ["fable", "claude-fable-5"],
    ]) {
      for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
        const args = buildArgs("ignored", { model, effort });
        assert.equal(args[args.indexOf("--model") + 1], canonical);
        assert.equal(args[args.indexOf("--effort") + 1], effort);
      }
    }
    assert.throws(() => buildArgs("ignored", { model: "claude-opus-4-7" }), /Unsupported Claude model/);
    assert.throws(() => buildArgs("ignored", { model: "haiku-4-5" }), /Unsupported Claude model/);
    assert.throws(() => buildArgs("ignored", { model: "claude-haiku-4-5-20251001" }), /Unsupported Claude model/);
    assert.throws(() => buildArgs("ignored", { model: "fable-5" }), /Unsupported Claude model/);

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

  it("accepts the durable child receipt before delivering the initial prompt", async () => {
    const fixture = turnFixture();
    let promptExistedAtAcceptance = null;

    const result = await runClaudeTurn(fixture.root, "guarded prompt", {
      claudeBin: fixture.bin,
      env: fixtureEnv(fixture),
      inputFormat: "stream-json",
      onSpawn: () => {
        promptExistedAtAcceptance = fs.existsSync(fixture.inputFile);
        fs.writeFileSync(fixture.acceptedFile, "accepted");
        return true;
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(promptExistedAtAcceptance, false);
    assert.equal(fs.readFileSync(fixture.inputFile, "utf8").includes("guarded prompt"), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(fixture.observedFile, "utf8")), { accepted: true });
  });

  for (const scenario of [
    {
      name: "is rejected",
      onSpawn: async () => {
        await delay(25);
        return false;
      },
      options: {},
    },
    {
      name: "throws",
      onSpawn: async () => {
        await delay(25);
        throw new Error("persistence failed");
      },
      options: {},
    },
    {
      name: "has no process identity",
      onSpawn: () => true,
      options: { getProcessIdentity: () => null },
    },
  ]) {
    it(`writes no prompt and terminates the child when durable acceptance ${scenario.name}`, async () => {
      const fixture = turnFixture();

      const result = await runClaudeTurn(fixture.root, "must never reach stdin", {
        claudeBin: fixture.bin,
        env: fixtureEnv(fixture),
        inputFormat: "stream-json",
        onSpawn: scenario.onSpawn,
        ...scenario.options,
      });

      assert.equal(result.status, "failed");
      assert.equal(fs.existsSync(fixture.inputFile), false);
      const observedTermination = fs.existsSync(fixture.terminatedFile) || result.signal === "SIGTERM";
      assert.equal(observedTermination, true);
    });
  }
});

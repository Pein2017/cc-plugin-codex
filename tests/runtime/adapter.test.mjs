import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  StreamParser,
  buildArgs,
  classifyClaudeFailure,
  createSandboxSettings,
  encodeStreamUserMessage,
  getClaudeAvailability,
  pruneStaleSandboxSettings,
  runClaudeTurn,
  validateTurnCompletion,
} from "../../runtime/claude-headless-adapter.mjs";
import { resolvePluginRuntimeRoot } from "../../runtime/paths.mjs";

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
const inputFile = process.env.CODEX_HARNESSDOCK_TEST_INPUT_FILE;
const acceptedFile = process.env.CODEX_HARNESSDOCK_TEST_ACCEPTED_FILE;
const observedFile = process.env.CODEX_HARNESSDOCK_TEST_OBSERVED_FILE;
const terminatedFile = process.env.CODEX_HARNESSDOCK_TEST_TERMINATED_FILE;
let finished = false;
process.stdin.on("data", (chunk) => {
  fs.appendFileSync(inputFile, chunk);
  if (finished) return;
  finished = true;
  fs.writeFileSync(observedFile, JSON.stringify({ accepted: fs.existsSync(acceptedFile) }));
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "fake-session" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: "fake-session", result: "ok", duration_ms: 4, duration_api_ms: 3, num_turns: 1, total_cost_usd: 0.001, usage: { input_tokens: 2, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, service_tier: "private" }, modelUsage: { private: true } }) + "\\n", () => process.exit(0));
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
    CODEX_HARNESSDOCK_TEST_INPUT_FILE: fixture.inputFile,
    CODEX_HARNESSDOCK_TEST_ACCEPTED_FILE: fixture.acceptedFile,
    CODEX_HARNESSDOCK_TEST_OBSERVED_FILE: fixture.observedFile,
    CODEX_HARNESSDOCK_TEST_TERMINATED_FILE: fixture.terminatedFile,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("Claude headless adapter", () => {
  it("distinguishes an unavailable working directory from a missing Claude executable", () => {
    const missingCwd = path.join(os.tmpdir(), `cc-missing-cwd-${process.pid}-${Date.now()}`);
    let spawnCalls = 0;
    const availability = getClaudeAvailability(missingCwd, {
      claudeBin: process.execPath,
      spawnSyncImpl() {
        spawnCalls += 1;
        throw new Error("must not spawn with an invalid cwd");
      },
    });
    assert.equal(availability.available, false);
    assert.equal(availability.executable, process.execPath);
    assert.match(availability.detail, /working directory|workspace/i);
    assert.doesNotMatch(availability.detail, /not found in PATH/i);
    assert.equal(spawnCalls, 0);
  });

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

  it("serializes appended policy and hard tool denial without replacing Claude defaults", () => {
    const args = buildArgs("ignored", {
      appendSystemPrompt: "bounded delegated lane",
      disallowedTools: ["Agent"],
    });
    assert.equal(args[args.indexOf("--append-system-prompt") + 1], "bounded delegated lane");
    assert.equal(args[args.indexOf("--disallowedTools") + 1], "Agent");
    assert.equal(args.includes("--system-prompt"), false);
  });

  it("serializes exactly one canonical closed native-team definition argument", () => {
    const teammateDenials = [
      "Workflow", "ListAgents", "ListPeers", "ScheduleWakeup", "CronCreate", "CronDelete",
      "CronList", "CronUpdate", "RemoteTrigger", "PushNotification", "SendUserMessage",
      "SendUserFile", "SendFile", "EnterWorktree", "ExitWorktree", "Agent",
    ];
    const agents = {
      opus: {
        description: "Opus implementer",
        prompt: "opus member",
        disallowedTools: teammateDenials,
        memory: "local",
        model: "claude-opus-5",
      },
      "haiku-scout": {
        description: "Haiku scout",
        model: "claude-haiku-4-5",
        memory: "local",
        disallowedTools: teammateDenials,
        prompt: "haiku member",
      },
      sonnet: {
        description: "Sonnet reviewer",
        memory: "local",
        prompt: "sonnet member",
        model: "claude-sonnet-5",
        disallowedTools: teammateDenials,
      },
    };
    const args = buildArgs("ignored", { agents });
    assert.equal(args.filter((value) => value === "--agents").length, 1);
    assert.equal(
      args[args.indexOf("--agents") + 1],
      '{"haiku-scout":{"description":"Haiku scout","disallowedTools":["Workflow","ListAgents","ListPeers","ScheduleWakeup","CronCreate","CronDelete","CronList","CronUpdate","RemoteTrigger","PushNotification","SendUserMessage","SendUserFile","SendFile","EnterWorktree","ExitWorktree","Agent"],"memory":"local","model":"claude-haiku-4-5","prompt":"haiku member"},"opus":{"description":"Opus implementer","disallowedTools":["Workflow","ListAgents","ListPeers","ScheduleWakeup","CronCreate","CronDelete","CronList","CronUpdate","RemoteTrigger","PushNotification","SendUserMessage","SendUserFile","SendFile","EnterWorktree","ExitWorktree","Agent"],"memory":"local","model":"claude-opus-5","prompt":"opus member"},"sonnet":{"description":"Sonnet reviewer","disallowedTools":["Workflow","ListAgents","ListPeers","ScheduleWakeup","CronCreate","CronDelete","CronList","CronUpdate","RemoteTrigger","PushNotification","SendUserMessage","SendUserFile","SendFile","EnterWorktree","ExitWorktree","Agent"],"memory":"local","model":"claude-sonnet-5","prompt":"sonnet member"}}',
    );
    assert.throws(
      () => buildArgs("ignored", { agents: { ...agents, extra: agents.opus } }),
      /exactly haiku-scout, opus, and sonnet/,
    );
    assert.throws(
      () => buildArgs("ignored", { agents: { opus: agents.opus } }),
      /exactly haiku-scout, opus, and sonnet/,
    );
    assert.throws(
      () => buildArgs("ignored", { agents: { ...agents, opus: { ...agents.opus, effort: "high" } } }),
      /unsupported field effort/,
    );
    assert.throws(
      () => buildArgs("ignored", { agents: { ...agents, opus: { ...agents.opus, description: "" } } }),
      /non-empty description/,
    );
    const { description: _description, ...withoutDescription } = agents.opus;
    assert.throws(
      () => buildArgs("ignored", { agents: { ...agents, opus: withoutDescription } }),
      /non-empty description/,
    );
    assert.throws(
      () => buildArgs("ignored", { agents: { ...agents, opus: { ...agents.opus, disallowedTools: [] } } }),
      /complete policy-owned tool denial boundary/,
    );
    assert.throws(
      () => buildArgs("ignored", { agents: { ...agents, opus: { ...agents.opus, disallowedTools: teammateDenials.slice(1) } } }),
      /complete policy-owned tool denial boundary/,
    );
  });

  it("retains only sanitized init surface evidence and detects native-team transport drift", () => {
    const witnesses = [];
    const parser = new StreamParser({
      delegationMode: "claude_orchestrator",
      onNativeTeamWitness: (fact) => witnesses.push(fact),
    });
    parser.feed(`${JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "team-session",
      tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate", "mcp__private__tool", "FutureNativeTool"],
      agents: [{ name: "sonnet", prompt: "secret prompt" }, { name: "haiku-scout" }, { name: "opus" }],
      transcript: "private transcript",
    })}\n`);
    assert.deepEqual(parser.state.runtimeReceipt.nativeTeamSurface, {
      observed: true,
      delegationMode: "claude_orchestrator",
      definitionNames: ["haiku-scout", "opus", "sonnet"],
      canonicalToolNames: ["Agent", "FutureNativeTool", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
      missingDefinitions: [],
      missingNecessaryCoordinationTools: [],
      forbiddenTools: [],
      unknownNativeTools: ["FutureNativeTool"],
      denySetLiveValidated: true,
      teamTransportLiveValidated: false,
    });
    assert.doesNotMatch(JSON.stringify(parser.state.runtimeReceipt.nativeTeamSurface), /secret|transcript|mcp__/);
    assert.match(parser.state.nativeTeamWarning, /unreviewed native tool/i);
    assert.doesNotMatch(JSON.stringify(witnesses), /secret|transcript|mcp__/);

    parser.feed(`${JSON.stringify({
      type: "assistant",
      session_id: "team-session",
      message: { content: [{
        type: "tool_use",
        id: "agent-1",
        name: "Agent",
        input: { name: "scout-1", subagent_type: "haiku-scout" },
      }] },
    })}\n`);
    assert.deepEqual(
      validateTurnCompletion(parser.state, 0),
      { status: "failed", warning: "Claude native team transport result is missing." },
    );
    parser.feed(`${JSON.stringify({
      type: "user",
      session_id: "team-session",
      tool_use_result: { status: "ordinary_subagent" },
      message: { content: [{ type: "tool_result", tool_use_id: "agent-1", content: "opaque" }] },
    })}\n`);
    assert.equal(parser.state.compatibilitySurfaceDrift, true);
    assert.equal(parser.state.runtimeReceipt.nativeTeamSurface.teamTransportLiveValidated, false);
    assert.deepEqual(witnesses.at(-1), {
      type: "native_team_transport",
      delegationMode: "claude_orchestrator",
      teamTransportLiveValidated: false,
    });
    assert.equal(classifyClaudeFailure({ status: "failed", compatibilitySurfaceDrift: true }).kind, "compatibility_surface_drift");
  });

  it("emits only production-shaped native-team witness facts and leaves top-level settle events unobservable", () => {
    const witnesses = [];
    const parser = new StreamParser({
      delegationMode: "claude_orchestrator",
      onNativeTeamWitness: (fact) => witnesses.push(fact),
    });
    parser.feed(`${JSON.stringify({
      type: "system", subtype: "init",
      tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
      agents: ["haiku-scout", "sonnet", "opus"],
    })}\n`);
    for (const [id, name, memberType] of [
      ["spawn-haiku", "haiku-scout-1", "haiku-scout"],
      ["spawn-sonnet", "sonnet-1", "sonnet"],
    ]) {
      parser.feed(`${JSON.stringify({
        type: "assistant", message: { content: [{ type: "tool_use", id, name: "Agent", input: { name, subagent_type: memberType, prompt: "private brief" } }] },
      })}\n`);
    }
    for (const [toolUseId, agentId] of [
      ["spawn-haiku", "haiku-current"],
      ["spawn-sonnet", "sonnet-current"],
    ]) {
      parser.feed(`${JSON.stringify({
        type: "user", tool_use_result: { status: "async_launched", agentId },
        message: { content: [{ type: "tool_result", tool_use_id: toolUseId }] },
      })}\n`);
    }
    parser.feed(`${JSON.stringify({
      type: "assistant", message: { content: [{ type: "tool_use", id: "message-1", name: "SendMessage", input: { recipient: "sonnet-1", message: "private message" } }] },
    })}\n`);
    parser.feed(`${JSON.stringify({
      type: "user", tool_use_result: { success: true },
      message: { content: [{ type: "tool_result", tool_use_id: "message-1" }] },
    })}\n`);
    // Claude's native mailbox/hook lifecycle is not a stable top-level
    // stream-json witness surface. These look-alike records must not become
    // Plugin-produced settle facts.
    parser.feed(`${JSON.stringify({ type: "system", subtype: "teammate_idle", teammate_name: "haiku-scout-1" })}\n`);
    parser.feed(`${JSON.stringify({ type: "system", subtype: "teammate_completed", teammate_name: "sonnet-1" })}\n`);
    parser.feed(`${JSON.stringify({ type: "result", subtype: "success", result: "private synthesis" })}\n`);

    assert.deepEqual(witnesses.slice(-7), [
      { type: "native_team_member_requested", memberName: "haiku-scout-1", memberType: "haiku-scout" },
      { type: "native_team_member_requested", memberName: "sonnet-1", memberType: "sonnet" },
      { type: "native_team_member_launched", memberName: "haiku-scout-1", memberType: "haiku-scout" },
      { type: "native_team_member_launched", memberName: "sonnet-1", memberType: "sonnet" },
      { type: "native_team_transport", delegationMode: "claude_orchestrator", teamTransportLiveValidated: true },
      { type: "native_team_message", sameTeamRecipient: true },
      { type: "native_team_parent_synthesis" },
    ]);
    assert.equal(witnesses.some((fact) => fact.type === "native_team_settled"), false);
    assert.doesNotMatch(JSON.stringify(witnesses), /private/);
  });

  it("does not call a failed terminal result a parent synthesis", () => {
    const witnesses = [];
    const parser = new StreamParser({ delegationMode: "claude_orchestrator", onNativeTeamWitness: (fact) => witnesses.push(fact) });
    parser.feed(`${JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "private" })}\n`);
    assert.equal(witnesses.some((fact) => fact.type === "native_team_parent_synthesis"), false);
  });

  it("bounds and sanitizes native member identities before witness callbacks", () => {
    const witnesses = [];
    const parser = new StreamParser({ delegationMode: "claude_orchestrator", onNativeTeamWitness: (fact) => witnesses.push(fact) });
    for (let index = 0; index < 17; index += 1) {
      parser.feed(`${JSON.stringify({ type: "assistant", message: { content: [{
        type: "tool_use", id: `member-${index}`, name: "Agent",
        input: { name: `sonnet-${index}`, subagent_type: "sonnet" },
      }] } })}\n`);
    }
    parser.feed(`${JSON.stringify({ type: "assistant", message: { content: [{
      type: "tool_use", id: "long", name: "Agent",
      input: { name: "x".repeat(97), subagent_type: "sonnet" },
    }] } })}\n`);
    assert.equal(witnesses.filter((fact) => fact.type === "native_team_member_requested").length, 16);
    assert.deepEqual(witnesses.at(-1), { type: "native_team_witness_overflow" });
    assert.doesNotMatch(JSON.stringify(witnesses), /x{20}/);

    const unsafeWitnesses = [];
    const unsafeParser = new StreamParser({
      delegationMode: "claude_orchestrator",
      onNativeTeamWitness: (fact) => unsafeWitnesses.push(fact),
    });
    unsafeParser.feed(`${JSON.stringify({ type: "assistant", message: { content: [{
      type: "tool_use", id: "unsafe-first", name: "Agent",
      input: { name: "x".repeat(97), subagent_type: "sonnet" },
    }] } })}\n`);
    assert.deepEqual(unsafeWitnesses, [{ type: "native_team_witness_overflow" }]);
    assert.equal(unsafeParser.nativeTeamMembers.size, 0);
    assert.equal(unsafeParser.state.nativeTeamTransportPending, false);
  });

  it("bounds pending native Agent and named-message correlations before results arrive", () => {
    const witnesses = [];
    const parser = new StreamParser({
      delegationMode: "claude_orchestrator",
      onNativeTeamWitness: (fact) => witnesses.push(fact),
    });
    parser.feed(`${JSON.stringify({
      type: "system", subtype: "init",
      tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
      agents: ["haiku-scout", "sonnet", "opus"],
    })}\n`);
    for (let index = 0; index < 33; index += 1) {
      parser.feed(`${JSON.stringify({ type: "assistant", message: { content: [{
        type: "tool_use", id: `repeat-${index}`, name: "Agent",
        input: { name: "repeat-sonnet", subagent_type: "sonnet" },
      }] } })}\n`);
    }
    assert.equal(parser.pendingNativeTeamAgentResults.size <= 32, true);
    assert.equal(parser.state.compatibilitySurfaceDrift, true);
    assert.deepEqual(witnesses.at(-1), { type: "native_team_witness_overflow" });
  });

  it("admits a clean orchestrator inventory without mistaking it for team transport and leaves absent leaf inventory unvalidated", () => {
    const orchestrator = new StreamParser({ delegationMode: "claude_orchestrator" });
    orchestrator.feed(`${JSON.stringify({
      type: "system",
      subtype: "init",
      tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
      agents: ["haiku-scout", "sonnet", "opus"],
    })}\n`);
    assert.equal(orchestrator.state.compatibilitySurfaceDrift, false);
    assert.equal(orchestrator.state.nativeTeamSurface.teamTransportLiveValidated, false);
    orchestrator.feed(`${JSON.stringify({ type: "result", subtype: "success", result: "unproven" })}\n`);
    assert.deepEqual(
      validateTurnCompletion(orchestrator.state, 0),
      { status: "failed", warning: "Claude native team transport was not validated." },
    );

    const leaf = new StreamParser({ delegationMode: "leaf" });
    leaf.feed(`${JSON.stringify({ type: "system", subtype: "init" })}\n`);
    assert.equal(leaf.state.nativeTeamSurface.observed, false);
    assert.equal(leaf.state.nativeTeamSurface.denySetLiveValidated, false);
    assert.equal(leaf.state.compatibilitySurfaceDrift, false);
  });

  it("validates current Claude team transport only after async launch and correlated named SendMessage success", () => {
    const initialize = () => {
      const parser = new StreamParser({ delegationMode: "claude_orchestrator" });
      parser.feed(`${JSON.stringify({
        type: "system",
        subtype: "init",
        tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
        agents: ["haiku-scout", "sonnet", "opus"],
      })}\n`);
      parser.feed(`${JSON.stringify({
        type: "assistant",
        message: { content: [{
          type: "tool_use",
          id: "sanctioned-agent-1",
          name: "Agent",
          input: { name: "reviewer-1", subagent_type: "sonnet" },
        }] },
      })}\n`);
      return parser;
    };

    const success = initialize();
    success.feed(`${JSON.stringify({
      type: "user",
      tool_use_result: { status: "async_launched", agentId: "agent-current-1" },
      message: { content: [{ type: "tool_result", tool_use_id: "sanctioned-agent-1", content: "opaque" }] },
    })}\n`);
    assert.equal(success.state.compatibilitySurfaceDrift, false);
    assert.equal(success.state.runtimeReceipt.nativeTeamSurface.teamTransportLiveValidated, false);
    success.feed(`${JSON.stringify({
      type: "assistant",
      message: { content: [{
        type: "tool_use",
        id: "send-current-1",
        name: "SendMessage",
        input: { recipient: "reviewer-1", message: "opaque" },
      }] },
    })}\n`);
    assert.equal(success.state.runtimeReceipt.nativeTeamSurface.teamTransportLiveValidated, false);
    success.feed(`${JSON.stringify({
      type: "user",
      tool_use_result: {
        success: true,
      },
      message: { content: [{ type: "tool_result", tool_use_id: "send-current-1", content: "opaque" }] },
    })}\n`);
    success.feed(`${JSON.stringify({ type: "result", subtype: "success", result: "done" })}\n`);
    assert.equal(success.state.runtimeReceipt.nativeTeamSurface.teamTransportLiveValidated, true);
    assert.deepEqual(validateTurnCompletion(success.state, 0), { status: "completed" });
  });

  it("does not validate team transport from partial Agent input, async launch alone, or SendMessage invocation alone", () => {
    const partial = new StreamParser({ delegationMode: "claude_orchestrator" });
    partial.feed(`${JSON.stringify({
      type: "system",
      subtype: "init",
      tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
      agents: ["haiku-scout", "sonnet", "opus"],
    })}\n`);
    partial.feed(`${JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_start", content_block: { type: "tool_use", id: "partial-agent-1", name: "Agent", input: {} } },
    })}\n`);
    partial.feed(`${JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"name":"scout-1","subagent_type":"haiku-scout"}' } },
    })}\n`);
    assert.deepEqual(partial.state.toolUses, [{ tool: "Agent", inputKeys: [] }]);
    assert.equal(partial.state.compatibilitySurfaceDrift, false);
    partial.feed(`${JSON.stringify({
      type: "assistant",
      message: { content: [{
        type: "tool_use",
        id: "partial-agent-1",
        name: "Agent",
        input: { name: "scout-1", subagent_type: "haiku-scout" },
      }] },
    })}\n`);
    partial.feed(`${JSON.stringify({
      type: "user",
      tool_use_result: { status: "async_launched", agentId: "partial-agent-current" },
      message: { content: [{ type: "tool_result", tool_use_id: "partial-agent-1", content: "rendered string" }] },
    })}\n`);
    partial.feed(`${JSON.stringify({
      type: "assistant",
      message: { content: [{
        type: "tool_use",
        id: "partial-send-1",
        name: "SendMessage",
        input: { recipient: "scout-1", message: "opaque" },
      }] },
    })}\n`);
    partial.feed(`${JSON.stringify({ type: "result", subtype: "success", result: "partial complete" })}\n`);
    assert.equal(partial.state.compatibilitySurfaceDrift, false);
    assert.equal(partial.state.runtimeReceipt.nativeTeamSurface.teamTransportLiveValidated, false);
    assert.deepEqual(
      validateTurnCompletion(partial.state, 0),
      { status: "failed", warning: "Claude native team transport result is missing." },
    );
  });

  it("rejects non-background Agent results and uncorrelated named-message results", () => {
    const initialize = () => {
      const parser = new StreamParser({ delegationMode: "claude_orchestrator" });
      parser.feed(`${JSON.stringify({
        type: "system",
        subtype: "init",
        tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
        agents: ["haiku-scout", "sonnet", "opus"],
      })}\n`);
      parser.feed(`${JSON.stringify({
        type: "assistant",
        message: { content: [{
          type: "tool_use",
          id: "sanctioned-agent-1",
          name: "Agent",
          input: { name: "reviewer-1", subagent_type: "sonnet" },
        }] },
      })}\n`);
      return parser;
    };
    const ordinary = initialize();
    ordinary.feed(`${JSON.stringify({
      type: "user",
      tool_use_result: { status: "completed", agentId: "ordinary-agent" },
      message: { content: [{ type: "tool_result", tool_use_id: "sanctioned-agent-1", content: "opaque" }] },
    })}\n`);
    ordinary.feed(`${JSON.stringify({ type: "result", subtype: "success", result: "wrong" })}\n`);
    assert.equal(ordinary.state.compatibilitySurfaceDrift, true);
    assert.equal(validateTurnCompletion(ordinary.state, 0).status, "failed");

    const mismatch = initialize();
    mismatch.feed(`${JSON.stringify({
      type: "user",
      tool_use_result: { status: "async_launched", agentId: "mismatch-agent" },
      message: { content: [{ type: "tool_result", tool_use_id: "other-agent", content: "opaque" }] },
    })}\n`);
    mismatch.feed(`${JSON.stringify({ type: "result", subtype: "success", result: "mismatch" })}\n`);
    assert.equal(mismatch.state.runtimeReceipt.nativeTeamSurface.teamTransportLiveValidated, false);
    assert.deepEqual(
      validateTurnCompletion(mismatch.state, 0),
      { status: "failed", warning: "Claude native team transport result is missing." },
    );
  });

  it("does not fan one enriched tool result across multiple pending native calls", () => {
    const parser = new StreamParser({ delegationMode: "claude_orchestrator" });
    parser.feed(`${JSON.stringify({
      type: "system", subtype: "init",
      tools: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
      agents: ["haiku-scout", "sonnet", "opus"],
    })}\n`);
    parser.feed(`${JSON.stringify({ type: "assistant", message: { content: [{
      type: "tool_use", id: "multi-a", name: "Agent",
      input: { name: "multi-scout", subagent_type: "haiku-scout" },
    }, {
      type: "tool_use", id: "multi-b", name: "Agent",
      input: { name: "multi-reviewer", subagent_type: "sonnet" },
    }] } })}\n`);
    parser.feed(`${JSON.stringify({
      type: "user", tool_use_result: { status: "async_launched", agentId: "ambiguous-agent" },
      message: { content: [
        { type: "tool_result", tool_use_id: "multi-a" },
        { type: "tool_result", tool_use_id: "multi-b" },
      ] },
    })}\n`);
    assert.equal(parser.launchedNativeTeamMembers.size, 0);
    assert.equal(parser.state.compatibilitySurfaceDrift, true);
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
    assert.equal(parser.state.assistantOutputObserved, true);
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
      "You've hit your session limit. Your limit will reset at 8pm.",
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
      "HTTP 429: You have reached your limit for requests; retry later",
      "HTTP 429: You've hit your limit on requests; retry after 30 seconds",
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
    assert.deepEqual(result.providerReportedMetrics, {
      duration_ms: 4,
      duration_api_ms: 3,
      turn_count: 1,
      input_tokens: 2,
      output_tokens: 1,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      reported_cost_usd: 0.001,
    });
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

describe("sandbox settings temp files", () => {
  it("writes under the current prefix and sweeps orphans left under the retired one", () => {
    const sandboxDir = path.join(resolvePluginRuntimeRoot(), "sandbox");
    fs.mkdirSync(sandboxDir, { recursive: true, mode: 0o700 });

    const written = createSandboxSettings("read-only");
    assert.ok(written, "read-only mode must produce a settings file");
    assert.match(path.basename(written), /^hd-sandbox-/);

    // A crash before the rename can leave files under the retired prefix.
    // Sweeping both is orphan cleanup: no new file is ever written under the
    // retired name, and nothing parses either prefix.
    const stale = {
      retired: path.join(sandboxDir, "cc-sandbox-999-stale.json"),
      current: path.join(sandboxDir, "hd-sandbox-999-stale.json"),
      unrelated: path.join(sandboxDir, "unrelated-999-stale.json"),
    };
    const old = Date.now() - 24 * 60 * 60 * 1000;
    for (const file of Object.values(stale)) {
      fs.writeFileSync(file, "{}", { mode: 0o600 });
      fs.utimesSync(file, old / 1000, old / 1000);
    }

    pruneStaleSandboxSettings();

    assert.equal(fs.existsSync(stale.retired), false, "retired-prefix orphan must be swept");
    assert.equal(fs.existsSync(stale.current), false, "current-prefix orphan must be swept");
    assert.equal(fs.existsSync(stale.unrelated), true, "an unrelated file must not be swept");
    assert.equal(fs.existsSync(written), true, "a fresh settings file must survive");

    fs.rmSync(stale.unrelated, { force: true });
    fs.rmSync(written, { force: true });
  });
});

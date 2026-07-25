/**
 * Copyright 2026 Sendbird, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  enqueueSteeringMessage,
  readJobFile,
  resolveStateDir,
  transitionJob,
  writeJobFile,
} from "../scripts/lib/state.mjs";
import {
  buildRecoveryPrompt,
  mergeAttemptOutput,
  runClaudeTaskSession,
} from "../scripts/lib/claude-supervisor.mjs";

const roots = [];

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-supervisor-test-"));
  roots.push(root);
  const result = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "git init failed");
  return root;
}

function createRunningJob(workspaceRoot, id) {
  writeJobFile(workspaceRoot, id, {
    id,
    kind: "task",
    jobClass: "task",
    status: "running",
    phase: "running",
    acceptingSteering: true,
    createdAt: new Date().toISOString(),
  });
}

function transportFailure(sessionId, partial = "partial") {
  return {
    status: "failed",
    exitCode: 1,
    sessionId,
    finalMessage: partial,
    structuredOutput: null,
    toolUses: [],
    touchedFiles: [],
    stderr: "API Error: Connection closed mid-response. The response above may be incomplete.",
    failureClass: sessionId ? "transport_closed_resumable" : "protocol_unknown",
    failureReason: "Connection closed mid-response",
    resumable: Boolean(sessionId),
    runtimeReceipt: { claudeCodeVersion: "fixture" },
    lastByteAt: new Date().toISOString(),
  };
}

function success(sessionId, text = "done") {
  return {
    status: "completed",
    exitCode: 0,
    sessionId,
    finalMessage: text,
    structuredOutput: null,
    toolUses: [],
    touchedFiles: [],
    stderr: "",
    failureClass: null,
    failureReason: null,
    resumable: false,
    runtimeReceipt: { claudeCodeVersion: "fixture" },
    lastByteAt: new Date().toISOString(),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(resolveStateDir(root), { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("mergeAttemptOutput", () => {
  it("removes a repeated streamed prefix across recovery attempts", () => {
    assert.equal(mergeAttemptOutput("alpha beta", "beta gamma"), "alpha beta gamma");
    assert.equal(mergeAttemptOutput("alpha", "alpha beta"), "alpha beta");
  });

  it("does not discard a short partial merely because it appears later", () => {
    assert.equal(mergeAttemptOutput("1", "2 through 10"), "1\n2 through 10");
  });
});

describe("buildRecoveryPrompt", () => {
  it("does not replay the original task and warns against repeating side effects", () => {
    const prompt = buildRecoveryPrompt({
      jobId: "task-1",
      reconnectAttempt: 2,
      uncertainSteering: [{ sequence: 3, text: "use the smaller fixture" }],
    });
    assert.match(prompt, /recovery attempt 2/i);
    assert.match(prompt, /do not repeat completed.*side-effect/i);
    assert.match(prompt, /sequence 3/i);
    assert.doesNotMatch(prompt, /original task/i);
  });
});

describe("runClaudeTaskSession", () => {
  it("resumes the exact session after a partial transport closure", async () => {
    const workspaceRoot = createWorkspace();
    const jobId = "task-recover";
    createRunningJob(workspaceRoot, jobId);
    const calls = [];
    const runAttempt = async (_cwd, prompt, options) => {
      calls.push({ prompt, resumeSessionId: options.resumeSessionId });
      return calls.length === 1
        ? transportFailure("session-one", "alpha beta")
        : success("session-one", "beta gamma");
    };

    const result = await runClaudeTaskSession({
      workspaceRoot,
      jobId,
      cwd: workspaceRoot,
      prompt: "DO_NOT_REPLAY_THIS_TASK",
      write: true,
      claudeOptions: {},
      runAttempt,
      retryPolicy: { maxReconnectAttempts: 3, baseDelayMs: 0, jitterRatio: 0 },
      sleep: async () => {},
    });

    assert.equal(result.status, "completed");
    assert.equal(result.sessionId, "session-one");
    assert.equal(result.finalMessage, "alpha beta gamma");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].resumeSessionId, "session-one");
    assert.doesNotMatch(calls[1].prompt, /DO_NOT_REPLAY_THIS_TASK/);
    assert.equal(result.recoveryAttempts, 1);
    assert.equal(readJobFile(workspaceRoot, jobId).recoveryAttempts, 1);
  });

  it("keeps two simultaneous recovery loops independent", async () => {
    const workspaceRoot = createWorkspace();
    createRunningJob(workspaceRoot, "task-a");
    createRunningJob(workspaceRoot, "task-b");

    async function run(jobId, sessionId) {
      let attempt = 0;
      return runClaudeTaskSession({
        workspaceRoot,
        jobId,
        cwd: workspaceRoot,
        prompt: jobId,
        write: false,
        claudeOptions: {},
        runAttempt: async (_cwd, _prompt, options) => {
          attempt += 1;
          if (attempt === 1) return transportFailure(sessionId, `${jobId}-partial`);
          assert.equal(options.resumeSessionId, sessionId);
          return success(sessionId, `${jobId}-done`);
        },
        retryPolicy: { maxReconnectAttempts: 1, baseDelayMs: 0, jitterRatio: 0 },
        sleep: async () => {},
      });
    }

    const [a, b] = await Promise.all([
      run("task-a", "session-a"),
      run("task-b", "session-b"),
    ]);
    assert.equal(a.sessionId, "session-a");
    assert.equal(b.sessionId, "session-b");
    assert.equal(readJobFile(workspaceRoot, "task-a").threadId, "session-a");
    assert.equal(readJobFile(workspaceRoot, "task-b").threadId, "session-b");
  });

  it("lets cancellation win during reconnect backoff and prevents another spawn", async () => {
    const workspaceRoot = createWorkspace();
    const jobId = "task-cancel";
    createRunningJob(workspaceRoot, jobId);
    let attempts = 0;
    const result = await runClaudeTaskSession({
      workspaceRoot,
      jobId,
      cwd: workspaceRoot,
      prompt: "cancel me",
      write: false,
      claudeOptions: {},
      runAttempt: async () => {
        attempts += 1;
        return transportFailure("session-cancel");
      },
      retryPolicy: { maxReconnectAttempts: 3, baseDelayMs: 100, jitterRatio: 0 },
      sleep: async () => {
        transitionJob(workspaceRoot, jobId, ["running"], "cancelling");
      },
    });

    assert.equal(attempts, 1);
    assert.equal(result.failureClass, "cancelled_or_interrupted");
  });

  it("delivers steering queued during reconnect exactly once", async () => {
    const workspaceRoot = createWorkspace();
    const jobId = "task-steer";
    createRunningJob(workspaceRoot, jobId);
    let attempts = 0;
    const delivered = [];
    const result = await runClaudeTaskSession({
      workspaceRoot,
      jobId,
      cwd: workspaceRoot,
      prompt: "steer me",
      write: false,
      claudeOptions: {},
      runAttempt: async (_cwd, _prompt, options) => {
        attempts += 1;
        if (attempts === 1) return transportFailure("session-steer");
        const messages = await options.pollInput();
        for (const message of messages) {
          delivered.push(message.sequence);
          options.onInputDispatched(message);
          options.onInputAcknowledged(message);
        }
        return success("session-steer");
      },
      retryPolicy: { maxReconnectAttempts: 1, baseDelayMs: 10, jitterRatio: 0 },
      sleep: async () => {
        enqueueSteeringMessage(workspaceRoot, jobId, "new direction");
      },
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(delivered, [1]);
    const messages = readJobFile(workspaceRoot, jobId).steering.messages;
    assert.equal(messages.length, 1);
    assert.ok(messages[0].acknowledgedAt);
  });

  it("stops for attention when a write-capable attempt has side effects but no session id", async () => {
    const workspaceRoot = createWorkspace();
    const jobId = "task-side-effect";
    createRunningJob(workspaceRoot, jobId);
    let attempts = 0;
    const result = await runClaudeTaskSession({
      workspaceRoot,
      jobId,
      cwd: workspaceRoot,
      prompt: "write once",
      write: true,
      claudeOptions: {},
      runAttempt: async () => {
        attempts += 1;
        return {
          ...transportFailure(null),
          toolUses: [{ tool: "Write", input: { file_path: "x" } }],
          touchedFiles: ["x"],
        };
      },
      retryPolicy: { maxReconnectAttempts: 3, baseDelayMs: 0, jitterRatio: 0 },
      sleep: async () => {},
    });

    assert.equal(attempts, 1);
    assert.equal(result.requiresAttention, true);
    assert.match(result.warning, /side effects.*session id/i);
  });

  it("uses the real stream subprocess boundary and resumes the exact emitted session", async () => {
    const workspaceRoot = createWorkspace();
    const jobId = "task-real-boundary";
    createRunningJob(workspaceRoot, jobId);
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-claude-fixture-"));
    roots.push(fixtureDir);
    const claudeBin = path.join(fixtureDir, "claude-fixture.mjs");
    const counterFile = path.join(fixtureDir, "counter");
    const callsFile = path.join(fixtureDir, "calls.jsonl");
    fs.writeFileSync(claudeBin, `#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";
const args = process.argv.slice(2);
const getValue = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const rl = readline.createInterface({ input: process.stdin });
const line = await new Promise((resolve) => rl.once("line", resolve));
rl.close();
const prompt = JSON.parse(line).message.content[0].text;
const previous = fs.existsSync(process.env.FIXTURE_COUNTER)
  ? Number(fs.readFileSync(process.env.FIXTURE_COUNTER, "utf8"))
  : 0;
const attempt = previous + 1;
fs.writeFileSync(process.env.FIXTURE_COUNTER, String(attempt));
fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ args, prompt }) + "\\n");
const session_id = "session-from-init";
process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id, claude_code_version: "fixture", model: "fixture" }) + "\\n");
const text = attempt === 1 ? "alpha beta" : "beta gamma";
process.stdout.write(JSON.stringify({ type: "stream_event", session_id, event: { delta: { type: "text_delta", text } } }) + "\\n");
if (attempt === 1) {
  process.stderr.write("API Error: Connection closed mid-response. The response above may be incomplete.\\n");
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id, result: text }) + "\\n");
}
`, "utf8");
    fs.chmodSync(claudeBin, 0o755);

    const result = await runClaudeTaskSession({
      workspaceRoot,
      jobId,
      cwd: workspaceRoot,
      prompt: "ORIGINAL_BOUNDARY_TASK",
      write: false,
      claudeOptions: {
        claudeBin,
        env: {
          ...process.env,
          FIXTURE_COUNTER: counterFile,
          FIXTURE_CALLS: callsFile,
        },
      },
      retryPolicy: { maxReconnectAttempts: 1, baseDelayMs: 0, jitterRatio: 0 },
      sleep: async () => {},
    });

    const calls = fs.readFileSync(callsFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(result.status, "completed");
    assert.equal(result.sessionId, "session-from-init");
    assert.equal(result.finalMessage, "alpha beta gamma");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].prompt, "ORIGINAL_BOUNDARY_TASK");
    assert.equal(calls[1].args[calls[1].args.indexOf("--resume") + 1], "session-from-init");
    assert.doesNotMatch(calls[1].prompt, /ORIGINAL_BOUNDARY_TASK/);
  });
});

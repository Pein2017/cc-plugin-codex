import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  acknowledgeAgentCompletionEvents,
  acknowledgeCompletionEvents,
  appendCompletionEvent,
  compactAcknowledgedCompletionEvents,
  deterministicCompletionEventId,
  readUnreadAgentCompletionSummaries,
  readUnreadCompletionEvents,
  reconcileTerminalJobCompletion,
  resolveCompletionInboxFile,
} from "../../runtime/completion-inbox.mjs";

const roots = [];
const originalRuntimeHome = process.env.CC_RUNTIME_HOME;

afterEach(() => {
  if (originalRuntimeHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = originalRuntimeHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-completion-inbox-"));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  process.env.CC_RUNTIME_HOME = path.join(root, "runtime-home");
  roots.push(root);
  return { workspace, ownerRootId: "codex-root-test" };
}

function completion(jobId, overrides = {}) {
  return {
    jobId,
    terminalStatus: "completed",
    completedAt: "2026-07-25T00:00:00.000Z",
    summary: `Job ${jobId} completed`,
    resumability: { classification: "resumable", claudeSessionId: `session-${jobId}` },
    detailedResultAvailable: true,
    resultPointer: jobId,
    ...overrides,
  };
}

const completionInboxUrl = new URL("../../runtime/completion-inbox.mjs", import.meta.url).href;

function runWriter(moduleUrl, workspace, ownerRootId, start, count, runtimeHome) {
  const source = [
    `import { appendCompletionEvent } from ${JSON.stringify(moduleUrl)};`,
    "const [workspace, ownerRootId, start, count] = process.argv.slice(1);",
    "for (let i = 0; i < Number(count); i += 1) {",
    "  const jobId = `concurrent-${Number(start) + i}`;",
    "  appendCompletionEvent(workspace, ownerRootId, {",
    "    jobId, terminalStatus: 'completed', completedAt: '2026-07-25T00:00:00.000Z',",
    "    summary: jobId, resumability: { classification: 'resumable', claudeSessionId: `session-${jobId}` },",
    "    detailedResultAvailable: true, resultPointer: jobId,",
    "  });",
    "}",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, workspace, ownerRootId, String(start), String(count)], {
      env: { ...process.env, CC_RUNTIME_HOME: runtimeHome },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr || `writer exited ${code}`)));
  });
}

function readFromFreshProcess(workspace, ownerRootId, runtimeHome) {
  const source = [
    `import { readUnreadCompletionEvents } from ${JSON.stringify(completionInboxUrl)};`,
    "const [workspace, ownerRootId] = process.argv.slice(1);",
    "process.stdout.write(JSON.stringify(readUnreadCompletionEvents(workspace, ownerRootId)));",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, workspace, ownerRootId], {
      env: { ...process.env, CC_RUNTIME_HOME: runtimeHome },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `reader exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

describe("completion inbox", () => {
  it("survives restart and redelivers an unacknowledged completion", async () => {
    const { workspace, ownerRootId } = setup();
    const first = appendCompletionEvent(workspace, ownerRootId, completion("job-1"));
    assert.equal(first.appended, true);
    assert.equal(first.event.eventId, deterministicCompletionEventId(ownerRootId, "job-1"));

    const initial = readUnreadCompletionEvents(workspace, ownerRootId);
    const afterRestart = await readFromFreshProcess(workspace, ownerRootId, process.env.CC_RUNTIME_HOME);
    assert.deepEqual(afterRestart.events, initial.events);
    assert.equal(afterRestart.events.length, 1);
    assert.match(afterRestart.events[0].deliveryToken, /^delivery-/);
    assert.ok(fs.existsSync(resolveCompletionInboxFile(workspace, ownerRootId)));
  });

  it("rejects skipped acknowledgement and permits a later contiguous acknowledgement", () => {
    const { workspace, ownerRootId } = setup();
    appendCompletionEvent(workspace, ownerRootId, completion("job-1"));
    appendCompletionEvent(workspace, ownerRootId, completion("job-2"));
    const delivered = readUnreadCompletionEvents(workspace, ownerRootId);
    assert.throws(
      () => acknowledgeCompletionEvents(workspace, ownerRootId, [delivered.events[1].deliveryToken]),
      /oldest unread contiguous token prefix/
    );
    assert.equal(readUnreadCompletionEvents(workspace, ownerRootId).events.length, 2);

    const acknowledged = acknowledgeCompletionEvents(workspace, ownerRootId, delivered.events.map((event) => event.deliveryToken));
    assert.deepEqual(acknowledged, { acknowledgedThrough: 2, acknowledgedCount: 2, compactedCount: 0 });
    assert.equal(readUnreadCompletionEvents(workspace, ownerRootId).events.length, 0);
  });

  it("skips a legacy prefix for Agent delivery while acknowledgement advances its cursor", () => {
    const { workspace, ownerRootId } = setup();
    const legacy = appendCompletionEvent(workspace, ownerRootId, completion("legacy-one-shot", {
      finalMessage: "legacy final output must remain internal",
    })).event;
    const linked = appendCompletionEvent(workspace, ownerRootId, completion("agent-completion", {
      agentId: "agent-current",
      finalMessage: "Claude final output must not enter the Agent summary",
    })).event;

    const delivered = readUnreadAgentCompletionSummaries(workspace, ownerRootId);
    assert.deepEqual(delivered.events, [{
      agentId: "agent-current",
      agentStatus: "completed",
      terminalStatus: "completed",
      summary: "Agent turn completed.",
      deliveryToken: linked.deliveryToken,
    }]);
    assert.equal("finalMessage" in delivered.events[0], false);
    assert.equal("resultPointer" in delivered.events[0], false);
    assert.equal("resumability" in delivered.events[0], false);

    const acknowledged = acknowledgeAgentCompletionEvents(
      workspace,
      ownerRootId,
      [linked.deliveryToken]
    );
    assert.deepEqual(acknowledged, { acknowledgedThrough: 2, acknowledgedCount: 1, compactedCount: 0 });
    const stored = JSON.parse(fs.readFileSync(resolveCompletionInboxFile(workspace, ownerRootId), "utf8"));
    assert.deepEqual(stored.events.map((event) => [event.sequence, event.eventId]), [
      [1, legacy.eventId],
      [2, linked.eventId],
    ]);
    assert.deepEqual(readUnreadAgentCompletionSummaries(workspace, ownerRootId).events, []);
  });

  it("serializes concurrent appends without duplicate or missing sequences", async () => {
    const { workspace, ownerRootId } = setup();
    const writers = 5;
    const perWriter = 12;
    await Promise.all(Array.from({ length: writers }, (_, index) => runWriter(
      completionInboxUrl,
      workspace,
      ownerRootId,
      index * perWriter,
      perWriter,
      process.env.CC_RUNTIME_HOME
    )));
    const unread = readUnreadCompletionEvents(workspace, ownerRootId, { limit: 100 });
    assert.equal(unread.events.length, writers * perWriter);
    assert.deepEqual(
      unread.events.map((event) => event.sequence),
      Array.from({ length: writers * perWriter }, (_, index) => index + 1)
    );
    assert.equal(new Set(unread.events.map((event) => event.eventId)).size, writers * perWriter);
  });

  it("reconciles terminal jobs idempotently and compacts only acknowledged history", () => {
    const { workspace, ownerRootId } = setup();
    const job = {
      id: "job-reconcile",
      status: "failed",
      updatedAt: "2026-07-25T00:00:00.000Z",
      errorMessage: "transport exhausted",
      resumability: { classification: "not_resumable", blockingReason: "transport exhausted" },
    };
    assert.equal(reconcileTerminalJobCompletion(workspace, ownerRootId, job).reconciled, true);
    assert.equal(reconcileTerminalJobCompletion(workspace, ownerRootId, job).reconciled, false);

    for (let index = 0; index < 5; index += 1) {
      appendCompletionEvent(workspace, ownerRootId, completion(`job-${index}`));
    }
    const delivered = readUnreadCompletionEvents(workspace, ownerRootId, { limit: 100 });
    acknowledgeCompletionEvents(workspace, ownerRootId, delivered.events.map((event) => event.deliveryToken), { acknowledgedTail: 2 });
    const compacted = compactAcknowledgedCompletionEvents(workspace, ownerRootId, { acknowledgedTail: 2 });
    assert.equal(compacted.retainedEventCount, 2);
    assert.equal(compacted.compactedCount, 0);
    const stored = JSON.parse(fs.readFileSync(resolveCompletionInboxFile(workspace, ownerRootId), "utf8"));
    assert.deepEqual(stored.events.map((event) => event.sequence), [5, 6]);
  });
});

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

function observePersistenceIo(operation) {
  const originalFsyncSync = fs.fsyncSync;
  const originalLinkSync = fs.linkSync;
  const counts = { fsync: 0, lockLinks: 0 };
  fs.fsyncSync = (...args) => {
    counts.fsync += 1;
    return originalFsyncSync(...args);
  };
  fs.linkSync = (...args) => {
    counts.lockLinks += 1;
    return originalLinkSync(...args);
  };
  try {
    return { counts, result: operation() };
  } finally {
    fs.fsyncSync = originalFsyncSync;
    fs.linkSync = originalLinkSync;
  }
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
  it("keeps identical reconciliation lock-free while serializing mutable corrections", () => {
    const { workspace, ownerRootId } = setup();
    const job = {
      id: "immutable-reconciliation",
      agentId: "agent-immutable-reconciliation",
      status: "completed",
      completedAt: "2026-07-25T00:00:00.000Z",
      completionSummary: "immutable reconciliation",
      result: { rawOutput: "immutable public handoff" },
      recoverability: {
        resumable: false,
        reason: "test_terminal",
      },
    };
    const initial = reconcileTerminalJobCompletion(workspace, ownerRootId, job).event;

    const unfrozenDuplicate = observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, job)
    );
    assert.deepEqual(unfrozenDuplicate.counts, { fsync: 0, lockLinks: 0 });

    const correctedJob = {
      ...job,
      completionSummary: "corrected before delivery",
      result: { rawOutput: "corrected public handoff" },
    };
    const mutableCorrection = observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, correctedJob)
    );
    assert.ok(mutableCorrection.counts.lockLinks > 0);
    assert.ok(mutableCorrection.counts.fsync > 0);
    assert.equal(mutableCorrection.result.reason, "corrected_unacknowledged_event");
    assert.equal(mutableCorrection.result.event.deliveryToken, initial.deliveryToken);

    readUnreadAgentCompletionSummaries(workspace, ownerRootId);
    const frozenDuplicate = observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, correctedJob)
    );
    assert.deepEqual(frozenDuplicate.counts, { fsync: 0, lockLinks: 0 });
    assert.equal(frozenDuplicate.result.event.deliveryToken, initial.deliveryToken);

    acknowledgeAgentCompletionEvents(workspace, ownerRootId, [initial.deliveryToken]);
    const acknowledgedOnlyJob = {
      ...job,
      id: "acknowledged-only-reconciliation",
      completionSummary: "acknowledged without first-delivery freezing",
    };
    const acknowledgedOnly = reconcileTerminalJobCompletion(
      workspace,
      ownerRootId,
      acknowledgedOnlyJob
    ).event;
    acknowledgeAgentCompletionEvents(workspace, ownerRootId, [acknowledgedOnly.deliveryToken]);
    const acknowledgedDuplicate = observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, acknowledgedOnlyJob)
    );
    assert.deepEqual(acknowledgedDuplicate.counts, { fsync: 0, lockLinks: 0 });
    assert.equal(acknowledgedDuplicate.result.event.deliveryToken, acknowledgedOnly.deliveryToken);

    assert.throws(
      () => appendCompletionEvent(workspace, ownerRootId, {
        ...completion(job.id, {
          agentId: "agent-identity-collision",
          finalMessage: "different Agent",
        }),
      }, { reconcileExisting: true }),
      /identity collision/
    );
  });

  it("derives blocking purely from the terminal job fact and corrects it once before freezing", () => {
    const { workspace, ownerRootId } = setup();
    const job = {
      id: "blocking-correction",
      agentId: "agent-blocking-correction",
      status: "failed",
      completedAt: "2026-07-25T00:00:00.000Z",
      result: { failureClass: "transport_closed_resumable", rawOutput: "" },
      recoverability: { resumable: false, mode: "blocked", reason: "transport_closed_resumable" },
    };
    const initial = reconcileTerminalJobCompletion(workspace, ownerRootId, job).event;
    assert.deepEqual(initial.blocking, { reason: "transport_exhausted", scope: "agent", retry: "new_agent" });

    // The turn is later reclassified before first delivery: an unread,
    // unfrozen event still corrects in place under the existing lock-and-reread
    // rule, and `blocking` changes along with the rest of the fact.
    const reclassifiedJob = {
      ...job,
      result: { failureClass: "auth_or_permission", rawOutput: "" },
      recoverability: { resumable: false, mode: "blocked", reason: "auth_or_permission" },
    };
    const corrected = observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, reclassifiedJob)
    );
    assert.ok(corrected.result.reconciled, "a genuine blocking-evidence change must be recognized as a correction");
    assert.deepEqual(corrected.result.event.blocking, { reason: "auth_required", scope: "harness", retry: "operator_required" });
    assert.equal(corrected.result.event.deliveryToken, initial.deliveryToken);

    // The identical fact converges in one step: a further reconcile of the
    // same reclassified job performs no additional write.
    const settled = observePersistenceIo(
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, reclassifiedJob)
    );
    assert.deepEqual(settled.counts, { fsync: 0, lockLinks: 0 });
  });

  it("never copies job.errorMessage into the model-facing summary or final message", () => {
    const { workspace, ownerRootId } = setup();
    const job = {
      id: "no-summary-operator-prose",
      agentId: "agent-no-summary-operator-prose",
      status: "failed",
      completedAt: "2026-07-25T00:00:00.000Z",
      // No completionSummary, summary, finalMessage, result, or rendered text
      // at all: a malformed or legacy job whose only text is operator prose.
      errorMessage:
        "Control process 55555 died or changed identity without completing. Auto-reaped. " +
        "Resume manually with: claude --resume native-session-should-not-leak",
      recoverability: { resumable: false, mode: "blocked", reason: "worker_reaped" },
    };
    const { event } = reconcileTerminalJobCompletion(workspace, ownerRootId, job);
    assert.equal(event.summary.includes("55555"), false);
    assert.equal(event.summary.includes("Control process"), false);
    assert.equal(event.summary.includes("claude --resume"), false);
    assert.equal(event.summary.includes("native-session-should-not-leak"), false);
    assert.equal(event.finalMessage.includes("55555"), false);
    assert.equal(event.finalMessage.includes("claude --resume"), false);
    assert.equal(event.finalMessage.includes("native-session-should-not-leak"), false);
    // With no prompt-derived text anywhere, the projection falls back to the
    // generic status/job-id text rather than any operator prose.
    assert.equal(event.summary, `failed job ${job.id}`);
    assert.equal(event.finalMessage, `failed job ${job.id}`);
  });

  it("performs no durable write across repeated observation of a settled failed Agent", () => {
    const { workspace, ownerRootId } = setup();
    const job = {
      id: "settled-failed-agent",
      agentId: "agent-settled-failed",
      status: "failed",
      completedAt: "2026-07-25T00:00:00.000Z",
      result: { failureClass: "fatal", rawOutput: "" },
      recoverability: { resumable: false, mode: "blocked", reason: "fatal" },
    };
    const appended = reconcileTerminalJobCompletion(workspace, ownerRootId, job).event;
    assert.deepEqual(appended.blocking, { reason: "unclassified", scope: "agent", retry: "new_agent" });

    const firstDelivery = observePersistenceIo(
      () => readUnreadAgentCompletionSummaries(workspace, ownerRootId)
    );
    assert.equal(firstDelivery.result.events[0].blocking.reason, "unclassified");

    const settledObservations = observePersistenceIo(() => Array.from(
      { length: 10 },
      () => readUnreadAgentCompletionSummaries(workspace, ownerRootId)
    ));
    assert.deepEqual(settledObservations.counts, { fsync: 0, lockLinks: 0 });
    assert.ok(settledObservations.result.every(
      (receipt) => JSON.stringify(receipt) === JSON.stringify(firstDelivery.result)
    ));

    // Reconciling the same unchanged terminal job repeatedly is also write-free:
    // the derivation is pure, so it never disagrees with the frozen payload.
    const repeatedReconcile = observePersistenceIo(() => Array.from(
      { length: 10 },
      () => reconcileTerminalJobCompletion(workspace, ownerRootId, job)
    ));
    assert.deepEqual(repeatedReconcile.counts, { fsync: 0, lockLinks: 0 });
  });

  it("does not overwrite a correction committed after an identical snapshot read", () => {
    const { workspace, ownerRootId } = setup();
    const factA = completion("snapshot-correction-race", {
      agentId: "agent-snapshot-correction-race",
      summary: "snapshot fact A",
      finalMessage: "public fact A",
    });
    const factB = {
      ...factA,
      summary: "corrected fact B",
      finalMessage: "public fact B",
    };
    const initial = appendCompletionEvent(workspace, ownerRootId, factA).event;
    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const originalReadFileSync = fs.readFileSync;
    let correction = null;
    let injected = false;
    fs.readFileSync = (filePath, ...args) => {
      const snapshot = originalReadFileSync(filePath, ...args);
      if (!injected && path.resolve(String(filePath)) === inboxFile) {
        injected = true;
        correction = appendCompletionEvent(
          workspace,
          ownerRootId,
          factB,
          { reconcileExisting: true }
        );
      }
      return snapshot;
    };
    let staleReceipt;
    try {
      staleReceipt = appendCompletionEvent(
        workspace,
        ownerRootId,
        factA,
        { reconcileExisting: true }
      );
    } finally {
      fs.readFileSync = originalReadFileSync;
    }

    assert.equal(injected, true);
    assert.equal(staleReceipt.event.summary, "snapshot fact A");
    assert.equal(correction?.corrected, true);
    assert.equal(correction?.event.sequence, initial.sequence);
    assert.equal(correction?.event.deliveryToken, initial.deliveryToken);

    const durable = readUnreadCompletionEvents(workspace, ownerRootId).events[0];
    assert.equal(durable.summary, "corrected fact B");
    assert.equal(durable.finalMessage, "public fact B");
    assert.equal(durable.sequence, initial.sequence);
    assert.equal(durable.deliveryToken, initial.deliveryToken);
    assert.deepEqual(readUnreadAgentCompletionSummaries(workspace, ownerRootId).events, [{
      kind: "completion",
      agentId: factA.agentId,
      agentStatus: "completed",
      terminalStatus: "completed",
      summary: "Agent turn completed.",
      completionMessage: "public fact B",
      completionMessageTruncated: false,
      deliveryToken: initial.deliveryToken,
      blocking: null,
    }]);
  });

  it("keeps quiet observation and frozen redelivery free of locks and fsync", () => {
    const { workspace, ownerRootId } = setup();
    const appended = appendCompletionEvent(workspace, ownerRootId, completion("agent-observation", {
      agentId: "agent-observation",
      finalMessage: "immutable public handoff",
    })).event;

    const firstDelivery = observePersistenceIo(
      () => readUnreadAgentCompletionSummaries(workspace, ownerRootId)
    );
    assert.ok(firstDelivery.counts.lockLinks > 0);
    assert.ok(firstDelivery.counts.fsync > 0);
    assert.equal(firstDelivery.result.events[0].deliveryToken, appended.deliveryToken);

    const frozenRedelivery = observePersistenceIo(() => Array.from(
      { length: 25 },
      () => readUnreadAgentCompletionSummaries(workspace, ownerRootId)
    ));
    assert.deepEqual(frozenRedelivery.counts, { fsync: 0, lockLinks: 0 });
    assert.ok(frozenRedelivery.result.every(
      (receipt) => JSON.stringify(receipt) === JSON.stringify(firstDelivery.result)
    ));

    const acknowledgement = observePersistenceIo(() => acknowledgeAgentCompletionEvents(
      workspace,
      ownerRootId,
      [appended.deliveryToken]
    ));
    assert.ok(acknowledgement.counts.lockLinks > 0);
    assert.ok(acknowledgement.counts.fsync > 0);

    const quietReads = observePersistenceIo(() => Array.from(
      { length: 25 },
      () => readUnreadAgentCompletionSummaries(workspace, ownerRootId)
    ));
    assert.deepEqual(quietReads.counts, { fsync: 0, lockLinks: 0 });
    assert.ok(quietReads.result.every((receipt) => receipt.events.length === 0));
  });

  it("locks a mixed frozen and unfrozen batch once, then redelivers it read-only", () => {
    const { workspace, ownerRootId } = setup();
    const first = appendCompletionEvent(workspace, ownerRootId, completion("mixed-first", {
      agentId: "agent-mixed-first",
      finalMessage: "first handoff",
    })).event;
    const second = appendCompletionEvent(workspace, ownerRootId, completion("mixed-second", {
      agentId: "agent-mixed-second",
      finalMessage: "second handoff",
    })).event;

    const frozenFirst = readUnreadAgentCompletionSummaries(
      workspace,
      ownerRootId,
      { limit: 1 },
    );
    assert.deepEqual(frozenFirst.events.map((event) => event.deliveryToken), [first.deliveryToken]);

    const mixed = observePersistenceIo(() => readUnreadAgentCompletionSummaries(
      workspace,
      ownerRootId,
      { limit: 2 },
    ));
    assert.ok(mixed.counts.lockLinks > 0);
    assert.ok(mixed.counts.fsync > 0);
    assert.deepEqual(
      mixed.result.events.map((event) => event.deliveryToken),
      [first.deliveryToken, second.deliveryToken],
    );

    const redelivery = observePersistenceIo(() => readUnreadAgentCompletionSummaries(
      workspace,
      ownerRootId,
      { limit: 2 },
    ));
    assert.deepEqual(redelivery.counts, { fsync: 0, lockLinks: 0 });
    assert.deepEqual(redelivery.result, mixed.result);
  });

  it("permits only an immutable at-least-once duplicate when acknowledgement races snapshot redelivery", () => {
    const { workspace, ownerRootId } = setup();
    const appended = appendCompletionEvent(workspace, ownerRootId, completion("racing-ack", {
      agentId: "agent-racing-ack",
      finalMessage: "frozen handoff",
    })).event;
    const frozen = readUnreadAgentCompletionSummaries(workspace, ownerRootId);

    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const originalReadFileSync = fs.readFileSync;
    let acknowledgementTriggered = false;
    fs.readFileSync = (...args) => {
      const snapshot = originalReadFileSync(...args);
      if (!acknowledgementTriggered && path.resolve(String(args[0])) === path.resolve(inboxFile)) {
        acknowledgementTriggered = true;
        acknowledgeAgentCompletionEvents(workspace, ownerRootId, [appended.deliveryToken]);
      }
      return snapshot;
    };
    let raced;
    try {
      raced = readUnreadAgentCompletionSummaries(workspace, ownerRootId);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }

    assert.equal(acknowledgementTriggered, true);
    assert.deepEqual(raced, frozen);
    assert.deepEqual(readUnreadAgentCompletionSummaries(workspace, ownerRootId), { events: [] });
    const stored = JSON.parse(fs.readFileSync(inboxFile, "utf8"));
    assert.equal(stored.acknowledgedThrough, 1);
  });

  it("accepts an already-acknowledged prefix when partial acknowledgement races a frozen batch", () => {
    const { workspace, ownerRootId } = setup();
    const events = ["batch-first", "batch-second"].map((jobId) => appendCompletionEvent(
      workspace,
      ownerRootId,
      completion(jobId, { agentId: `agent-${jobId}`, finalMessage: jobId }),
    ).event);
    const frozen = readUnreadAgentCompletionSummaries(workspace, ownerRootId, { limit: 2 });
    assert.deepEqual(
      frozen.events.map((event) => event.deliveryToken),
      events.map((event) => event.deliveryToken),
    );

    const inboxFile = resolveCompletionInboxFile(workspace, ownerRootId);
    const originalReadFileSync = fs.readFileSync;
    let partialAckTriggered = false;
    fs.readFileSync = (...args) => {
      const snapshot = originalReadFileSync(...args);
      if (!partialAckTriggered && path.resolve(String(args[0])) === path.resolve(inboxFile)) {
        partialAckTriggered = true;
        acknowledgeAgentCompletionEvents(workspace, ownerRootId, [events[0].deliveryToken]);
      }
      return snapshot;
    };
    let raced;
    try {
      raced = readUnreadAgentCompletionSummaries(workspace, ownerRootId, { limit: 2 });
    } finally {
      fs.readFileSync = originalReadFileSync;
    }

    assert.equal(partialAckTriggered, true);
    assert.deepEqual(raced, frozen);
    const acknowledged = acknowledgeAgentCompletionEvents(
      workspace,
      ownerRootId,
      raced.events.map((event) => event.deliveryToken),
    );
    assert.equal(acknowledged.acknowledgedThrough, 2);
    assert.equal(acknowledged.acknowledgedCount, 1);
    assert.deepEqual(readUnreadAgentCompletionSummaries(workspace, ownerRootId), { events: [] });
  });

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
      finalMessage: "Claude final output enters only the bounded handoff",
    })).event;

    const delivered = readUnreadAgentCompletionSummaries(workspace, ownerRootId);
    assert.deepEqual(delivered.events, [{
      kind: "completion",
      agentId: "agent-current",
      agentStatus: "completed",
      terminalStatus: "completed",
      summary: "Agent turn completed.",
      completionMessage: "Claude final output enters only the bounded handoff",
      completionMessageTruncated: false,
      deliveryToken: linked.deliveryToken,
      blocking: null,
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

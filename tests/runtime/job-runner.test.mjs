import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  createJobProgressUpdater,
  PUBLIC_PROGRESS_TEXT_HEARTBEAT_MS,
  runTrackedJob,
} from "../../runtime/job-runner.mjs";
import { readJobFile, transitionJob, writeJobFile } from "../../runtime/job-store.mjs";
import { getProcessIdentity } from "../../runtime/process-control.mjs";

const priorHome = process.env.CC_RUNTIME_HOME;
const roots = [];

afterEach(() => {
  if (priorHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = priorHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-runner-"));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  roots.push(root);
  process.env.CC_RUNTIME_HOME = path.join(root, "runtime-home");
  const job = {
    id: "cc-1",
    workspaceRoot: workspace,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  writeJobFile(workspace, job.id, job);
  return { workspace, job };
}

function completedExecution() {
  return {
    exitStatus: 0,
    threadId: "session-1",
    turnId: null,
    payload: { status: "completed", sessionId: "session-1" },
    rendered: "done\n",
    summary: "done",
  };
}

describe("tracked worker ownership", () => {
  it("persists only sanitized, rate-limited public progress", () => {
    const { workspace, job } = setup();
    let observedAt = Date.parse("2026-07-26T00:00:00.000Z");
    const update = createJobProgressUpdater(workspace, job.id, { now: () => observedAt });

    update({
      kind: "text",
      text: "secret response body",
      message: "secret response body",
      phase: "running",
    });
    let stored = readJobFile(workspace, job.id);
    assert.deepEqual(stored.publicProgress, {
      revision: 1,
      activity: "responding",
      phase: "running",
      summary: "Claude is drafting its response.",
      updatedAt: "2026-07-26T00:00:00.000Z",
    });
    assert.equal(JSON.stringify(stored.publicProgress).includes("secret"), false);

    observedAt += PUBLIC_PROGRESS_TEXT_HEARTBEAT_MS - 1;
    update({ kind: "text", message: "another secret", phase: "running" });
    assert.equal(readJobFile(workspace, job.id).publicProgress.revision, 1);

    observedAt += 1;
    update({ kind: "text", message: "still secret", phase: "running" });
    assert.equal(readJobFile(workspace, job.id).publicProgress.revision, 2);

    observedAt += 1;
    update({
      kind: "tool_use",
      tool: "C:\\Users\\alice\\secret.txt",
      input: { file_path: "/secret/path" },
      message: "Using tool with /secret/path",
      phase: "tool",
    });
    stored = readJobFile(workspace, job.id);
    assert.equal(stored.publicProgress.revision, 3);
    assert.equal(stored.publicProgress.summary, "Claude is using a tool.");
    assert.equal(JSON.stringify(stored.publicProgress).includes("/secret/path"), false);
    assert.equal(JSON.stringify(stored.publicProgress).includes("alice"), false);

    observedAt += 1;
    update({ kind: "tool_use", tool: "Read", message: "Using Read", phase: "tool" });
    assert.equal(readJobFile(workspace, job.id).publicProgress.summary, "Claude is using Read.");
  });

  it("allows only one worker to claim a queued job", async () => {
    const { workspace, job } = setup();
    let starts = 0;
    let release;
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    const first = runTrackedJob(job, async () => {
      starts += 1;
      markStarted();
      await gate;
      return completedExecution();
    });
    await started;
    await assert.rejects(
      runTrackedJob(job, async () => {
        starts += 1;
        return completedExecution();
      }),
      /cannot start from running/
    );
    release();
    await first;
    assert.equal(starts, 1);
    assert.equal(readJobFile(workspace, job.id).status, "completed");
  });

  it("does not revive a queued job after cancel wins", async () => {
    const { workspace, job } = setup();
    transitionJob(workspace, job.id, ["queued"], "cancelled");
    let starts = 0;
    await assert.rejects(
      runTrackedJob(job, async () => {
        starts += 1;
        return completedExecution();
      }),
      /cannot start from cancelled/
    );
    assert.equal(starts, 0);
    assert.equal(readJobFile(workspace, job.id).status, "cancelled");
  });

  it("does not let a late runner failure overwrite a control terminal", async () => {
    const { workspace, job } = setup();
    let rejectRunner;
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const runnerResult = new Promise((_resolve, reject) => { rejectRunner = reject; });
    const running = runTrackedJob(job, async () => {
      markStarted();
      return runnerResult;
    });
    await started;
    transitionJob(workspace, job.id, ["running"], "cancelled");
    rejectRunner(new Error("late failure"));
    await assert.rejects(running, /late failure/);
    assert.equal(readJobFile(workspace, job.id).status, "cancelled");
  });

  it("accepts a Claude child only by atomically recording identity and clearing the pre-Claude marker", async () => {
    const { workspace, job } = setup();
    writeJobFile(workspace, job.id, {
      ...readJobFile(workspace, job.id),
      preClaudeLaunch: true,
      safeFreshRetry: true,
    });
    let acceptance = null;

    await runTrackedJob(job, async (onSpawn) => {
      acceptance = onSpawn({
        pid: process.pid,
        pidIdentity: getProcessIdentity(process.pid),
      });
      const stored = readJobFile(workspace, job.id);
      assert.equal(acceptance, true);
      assert.equal(stored.preClaudeLaunch, false);
      assert.equal(stored.safeFreshRetry, false);
      assert.equal(stored.pid, process.pid);
      assert.equal(stored.pidIdentity, getProcessIdentity(process.pid));
      return completedExecution();
    });

    assert.equal(acceptance, true);
  });

  it("rejects an identity-less child receipt without clearing the pre-Claude marker", async () => {
    const { workspace, job } = setup();
    writeJobFile(workspace, job.id, {
      ...readJobFile(workspace, job.id),
      preClaudeLaunch: true,
      safeFreshRetry: true,
    });
    let acceptance = null;

    await runTrackedJob(job, async (onSpawn) => {
      acceptance = onSpawn({ pid: process.pid, pidIdentity: null });
      const stored = readJobFile(workspace, job.id);
      assert.equal(acceptance, false);
      assert.equal(stored.preClaudeLaunch, true);
      assert.equal(stored.safeFreshRetry, true);
      assert.equal(stored.pid, null);
      return completedExecution();
    });

    assert.equal(acceptance, false);
  });
});

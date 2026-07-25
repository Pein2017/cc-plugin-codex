import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runTrackedJob } from "../../runtime/job-runner.mjs";
import { readJobFile, transitionJob, writeJobFile } from "../../runtime/job-store.mjs";

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
});

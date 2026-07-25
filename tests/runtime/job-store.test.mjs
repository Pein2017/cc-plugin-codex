import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import {
  acknowledgeSteeringMessage,
  enqueueSteeringMessage,
  getSteeringSnapshot,
  listJobs,
  listPendingSteeringMessages,
  markSteeringMessageDispatched,
  patchJob,
  readJobFile,
  reserveSessionLease,
  resolveJobFile,
  transitionJob,
  writeJobFile,
} from "../../runtime/job-store.mjs";
import { getProcessIdentity } from "../../runtime/process-control.mjs";

const writerFixture = fileURLToPath(new URL("./fixtures/job-store-writer.mjs", import.meta.url));

const priorHome = process.env.CC_RUNTIME_HOME;
const roots = [];
afterEach(() => {
  if (priorHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = priorHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-store-"));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  roots.push(root);
  process.env.CC_RUNTIME_HOME = path.join(root, "state-home");
  writeJobFile(workspace, "cc-1", {
    id: "cc-1",
    workspaceRoot: workspace,
    status: "running",
    acceptingSteering: true,
  });
  return { workspace };
}

describe("job store and mailbox", () => {
  it("persists ordered steering before acknowledgement", () => {
    const { workspace } = setup();
    const first = enqueueSteeringMessage(workspace, "cc-1", "first");
    const second = enqueueSteeringMessage(workspace, "cc-1", "second");
    assert.deepEqual([first.sequence, second.sequence], [1, 2]);
    assert.deepEqual(listPendingSteeringMessages(workspace, "cc-1").map((m) => m.text), ["first", "second"]);
    markSteeringMessageDispatched(workspace, "cc-1", 1, { deliveryMode: "live_stdin", attempt: 1 });
    acknowledgeSteeringMessage(workspace, "cc-1", 1);
    assert.deepEqual(getSteeringSnapshot(workspace, "cc-1"), {
      pendingCount: 1,
      unacknowledgedCount: 0,
      latestAcknowledgedSequence: 1,
      lastSequence: 2,
    });
  });

  it("uses compare-and-swap for terminal control races", () => {
    const { workspace } = setup();
    assert.equal(transitionJob(workspace, "cc-1", ["running"], "cancelling").transitioned, true);
    assert.equal(transitionJob(workspace, "cc-1", ["running"], "completed").transitioned, false);
    assert.equal(readJobFile(workspace, "cc-1").status, "cancelling");
  });

  it("preserves mailbox state when progress patches the same job", () => {
    const { workspace } = setup();
    enqueueSteeringMessage(workspace, "cc-1", "keep me");
    patchJob(workspace, "cc-1", { phase: "running_attempt" });
    const stored = readJobFile(workspace, "cc-1");
    assert.equal(stored.phase, "running_attempt");
    assert.deepEqual(stored.steering.messages.map((message) => message.text), ["keep me"]);
  });

  it("serializes a high-contention multi-process mailbox without silent loss", async () => {
    const { workspace } = setup();
    const writers = 8;
    const messagesPerWriter = 75;
    const children = Array.from({ length: writers }, (_, writer) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
          writerFixture,
          workspace,
          "cc-1",
          `writer-${writer}`,
          String(messagesPerWriter),
        ], {
          env: process.env,
          stdio: ["ignore", "ignore", "pipe"],
        });
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr || `writer exited ${code}`));
        });
      })
    );
    await Promise.all(children);
    const messages = readJobFile(workspace, "cc-1").steering.messages;
    assert.equal(messages.length, writers * messagesPerWriter);
    assert.equal(new Set(messages.map((message) => message.sequence)).size, messages.length);
    assert.deepEqual(
      messages.map((message) => message.sequence),
      Array.from({ length: messages.length }, (_, index) => index + 1)
    );
  });

  it("holds one exact-session lease across workspaces and releases it at terminal", () => {
    const { workspace } = setup();
    const otherWorkspace = path.join(path.dirname(workspace), "other-workspace");
    fs.mkdirSync(otherWorkspace);
    const configDir = path.join(path.dirname(workspace), ".claude");
    const lease = reserveSessionLease(workspace, configDir, "session-lease-1", "cc-1");
    patchJob(workspace, "cc-1", {
      status: "running",
      sessionLease: {
        configIdentity: lease.configIdentity,
        sessionId: lease.sessionId,
      },
    });
    assert.throws(
      () => reserveSessionLease(otherWorkspace, configDir, "session-lease-1", "cc-2"),
      /already owned by active job cc-1/
    );
    assert.equal(transitionJob(workspace, "cc-1", ["running"], "completed").transitioned, true);
    assert.doesNotThrow(
      () => reserveSessionLease(otherWorkspace, configDir, "session-lease-1", "cc-2")
    );
  });

  it("reaps a queued job whose worker never became live", () => {
    const { workspace } = setup();
    const old = new Date(Date.now() - 60_000).toISOString();
    fs.writeFileSync(resolveJobFile(workspace, "cc-1"), `${JSON.stringify({
      id: "cc-1",
      workspaceRoot: workspace,
      status: "queued",
      createdAt: old,
      updatedAt: old,
      workerPid: 99999999,
      workerPidIdentity: "missing",
    })}\n`);
    const job = listJobs(workspace).find((candidate) => candidate.id === "cc-1");
    assert.equal(job.status, "failed");
    assert.match(job.errorMessage, /Auto-reaped/);
  });

  it("does not reap a live supervisor while its Claude child is between attempts", () => {
    const { workspace } = setup();
    const old = new Date(Date.now() - 60_000).toISOString();
    fs.writeFileSync(resolveJobFile(workspace, "cc-1"), `${JSON.stringify({
      id: "cc-1",
      workspaceRoot: workspace,
      status: "running",
      phase: "reconnect_backoff",
      createdAt: old,
      updatedAt: old,
      pid: null,
      pidIdentity: null,
      workerPid: process.pid,
      workerPidIdentity: getProcessIdentity(process.pid),
    })}\n`);
    const job = listJobs(workspace).find((candidate) => candidate.id === "cc-1");
    assert.equal(job.status, "running");
    assert.equal(job.phase, "reconnect_backoff");
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { readUnreadCompletionEvents } from "../../runtime/completion-inbox.mjs";
import {
  cleanupOldJobs,
  getStateProtectionReceipt,
  listJobs,
  readJobFile,
  transitionJob,
  writeJobFile,
} from "../../runtime/job-store.mjs";

const priorHome = process.env.CC_RUNTIME_HOME;
const roots = [];

afterEach(() => {
  if (priorHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = priorHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-hardening-"));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  process.env.CC_RUNTIME_HOME = path.join(root, "runtime-home");
  roots.push(root);
  return { root, workspace, ownerRootId: "codex-root-hardening" };
}

function writeRunning(workspace, ownerRootId, id, createdAt = new Date().toISOString()) {
  writeJobFile(workspace, id, {
    id,
    workspaceRoot: workspace,
    ownerRootId,
    status: "running",
    createdAt,
    pid: null,
    pidIdentity: null,
    workerPid: null,
    workerPidIdentity: null,
  });
}

describe("hardened runtime state", () => {
  it("publishes one self-contained completion with recoverability and residency evidence", () => {
    const { workspace, ownerRootId } = setup();
    writeRunning(workspace, ownerRootId, "job-complete");
    const first = transitionJob(workspace, "job-complete", ["running"], "completed", {
      completedAt: new Date().toISOString(),
      summary: "completed output",
      threadId: "claude-session-1",
      result: {
        status: "completed",
        sessionId: "claude-session-1",
        rawOutput: "the complete final answer",
        resumable: true,
      },
    });
    assert.equal(first.transitioned, true);
    assert.equal(first.job.recoverability.mode, "exact_session");
    assert.equal(first.job.residencyReceipt.processIdentitiesCleared, true);
    assert.equal(first.job.residencyReceipt.sessionLeaseReleased, true);

    listJobs(workspace);
    listJobs(workspace);
    const inbox = readUnreadCompletionEvents(workspace, ownerRootId);
    assert.equal(inbox.events.length, 1);
    assert.equal(inbox.events[0].finalMessage, "the complete final answer");
    assert.equal(inbox.events[0].truncated, false);
    assert.equal(inbox.events[0].claudeSessionIdAvailable, true);
  });

  it("persists the failed and cancelled recoverability matrix", () => {
    const { workspace, ownerRootId } = setup();
    writeRunning(workspace, ownerRootId, "job-failed");
    transitionJob(workspace, "job-failed", ["running"], "failed", {
      completedAt: new Date().toISOString(),
      threadId: "unproven-session",
      result: { status: "failed", sessionId: "unproven-session", resumable: false, failureClass: "fatal" },
    });
    writeRunning(workspace, ownerRootId, "job-cancelled");
    transitionJob(workspace, "job-cancelled", ["running"], "cancelled", {
      completedAt: new Date().toISOString(),
    });
    assert.equal(readJobFile(workspace, "job-failed").recoverability.resumable, false);
    assert.equal(readJobFile(workspace, "job-failed").recoverability.reason, "fatal");
    assert.equal(readJobFile(workspace, "job-cancelled").recoverability.reason, "destructive_cancellation");
  });

  it("prunes detailed jobs per owner while retaining unread output and Claude artifacts", () => {
    const { root, workspace, ownerRootId } = setup();
    const claudeDir = path.join(root, ".claude");
    const sentinel = path.join(claudeDir, "session-artifact.jsonl");
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(sentinel, "claude-owned\n");

    for (let index = 0; index < 101; index += 1) {
      const id = `job-${String(index).padStart(3, "0")}`;
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      writeRunning(workspace, ownerRootId, id, createdAt);
      transitionJob(workspace, id, ["running"], "completed", {
        completedAt: createdAt,
        summary: id,
        threadId: `session-${id}`,
        result: { status: "completed", sessionId: `session-${id}`, rawOutput: `output-${id}`, resumable: true },
      });
    }
    cleanupOldJobs(workspace);
    assert.equal(readJobFile(workspace, "job-000"), null);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "claude-owned\n");
    const firstUnread = readUnreadCompletionEvents(workspace, ownerRootId, { limit: 100 }).events[0];
    assert.equal(firstUnread.jobId, "job-000");
    assert.equal(firstUnread.finalMessage, "output-job-000");
    assert.equal(firstUnread.detailedResultAvailable, false);
  });

  it("reports POSIX protection and an honest Windows limitation", () => {
    const { workspace } = setup();
    assert.equal(getStateProtectionReceipt(workspace).status, "verified_owner_only");
    const windows = getStateProtectionReceipt(workspace, { platform: "win32" });
    assert.equal(windows.status, "unverified");
    assert.match(windows.detail, /did not verify/);
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createJobLogFile, createProgressReporter } from "../../runtime/job-runner.mjs";
import {
  ensureStateDir,
  reserveSessionLease,
  resolveJobLogFile,
  resolveJobsDir,
  resolveStateDir,
} from "../../runtime/job-store.mjs";

const temporaryRoots = [];

afterEach(() => {
  delete process.env.CC_RUNTIME_HOME;
  while (temporaryRoots.length) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

function mode(file) {
  return fs.statSync(file).mode & 0o777;
}

describe("runtime evidence permissions", () => {
  it("repairs state directories and job logs to owner-only modes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-runtime-mode-"));
    temporaryRoots.push(root);
    const workspace = path.join(root, "workspace");
    const runtimeHome = path.join(root, "runtime-home");
    fs.mkdirSync(workspace);
    process.env.CC_RUNTIME_HOME = runtimeHome;

    ensureStateDir(workspace);
    fs.chmodSync(resolveStateDir(workspace), 0o755);
    fs.chmodSync(resolveJobsDir(workspace), 0o755);
    ensureStateDir(workspace);
    assert.equal(mode(resolveStateDir(workspace)), 0o700);
    assert.equal(mode(resolveJobsDir(workspace)), 0o700);

    const logFile = createJobLogFile(workspace, "job-mode", "permission test");
    assert.equal(logFile, resolveJobLogFile(workspace, "job-mode"));
    assert.equal(mode(logFile), 0o600);

    const leaseDirectory = path.join(runtimeHome, "state", "session-leases");
    fs.mkdirSync(leaseDirectory, { recursive: true, mode: 0o755 });
    fs.chmodSync(leaseDirectory, 0o755);
    reserveSessionLease(workspace, path.join(root, ".claude"), "session-mode", "job-mode");
    assert.equal(mode(leaseDirectory), 0o700);

    fs.chmodSync(logFile, 0o644);
    createProgressReporter({ logFile })("private evidence");
    assert.equal(mode(logFile), 0o600);
  });
});

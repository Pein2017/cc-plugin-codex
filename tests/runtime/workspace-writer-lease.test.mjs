/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * OpenSpec `generalize-multi-harness-agent-control-plane` task 4.1-4.3,
 * `workspace-turn-authority` spec: one canonical workspace has at most one
 * behavioral writer, regardless of Harness/instance/model, and it releases
 * only through the same settlement-gated predicate every lease kind shares.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import {
  acquireInstanceLease,
  acquiredLeaseEvidence,
} from "../../runtime/instance-admission-lease.mjs";
import {
  acquireWorkspaceWriterLease,
  releaseLeasesOnSettlement,
} from "../../runtime/workspace-writer-lease.mjs";
import { versionThreeRoute } from "./fixtures/version-three-state.mjs";

const contentionFixture = fileURLToPath(
  new URL("./fixtures/instance-admission-lease-contender.mjs", import.meta.url)
);

const priorHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
const roots = [];

afterEach(() => {
  if (priorHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = priorHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-writer-lease-"));
  roots.push(root);
  process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = path.join(root, "state-home");
  return { root };
}

function worktree(root, name) {
  return fs.mkdtempSync(path.join(root, `${name}-`));
}

function publishableResult(overrides = {}) {
  return {
    status: "completed",
    nativeTurn: "terminal",
    executionWorld: { continuity: "not_applicable", settlement: "settled" },
    continuation: { mode: "none" },
    nativeTurnRef: {
      version: 1,
      harnessId: "fake-service",
      driverVersion: "fake-service@1",
      instanceKey: "tenant-alpha",
      locatorVersion: 1,
      locator: { turnId: "t-1" },
    },
    ...overrides,
  };
}

describe("workspace writer lease: one writer per canonical workspace across Harnesses", () => {
  it("rejects a second writer for the same workspace regardless of Harness or model", () => {
    const { root } = setup();
    const workspaceRoot = worktree(root, "worktree");
    const first = acquireWorkspaceWriterLease({
      ownerRootId: "root-1",
      agentId: "agent-1",
      jobId: "job-1",
      route: versionThreeRoute({ harnessId: "fake-service", model: "fake-service-large", authority: "behavioral_write" }),
      workspaceRoot,
    });
    assert.equal(first.kind, "writer");
    assert.equal(first.capacity.limit, 1);

    assert.throws(
      () => acquireWorkspaceWriterLease({
        ownerRootId: "root-1",
        agentId: "agent-2",
        jobId: "job-2",
        route: versionThreeRoute({ harnessId: "claude-code", model: "opus", authority: "behavioral_write" }),
        workspaceRoot,
      }),
      /capacity/i
    );
  });

  it("rejects a second writer from an entirely different owner root, not just a different Agent", () => {
    const { root } = setup();
    const workspaceRoot = worktree(root, "worktree");
    acquireWorkspaceWriterLease({
      ownerRootId: "root-alpha",
      agentId: "agent-1",
      jobId: "job-1",
      route: versionThreeRoute({ harnessId: "fake-service", authority: "behavioral_write" }),
      workspaceRoot,
    });
    // A canonical workspace root is a single physical filesystem location:
    // the writer lease has no owner-root component in its key at all, so a
    // second Codex root racing the same worktree is refused exactly like a
    // second Agent under the same root would be.
    assert.throws(
      () => acquireWorkspaceWriterLease({
        ownerRootId: "root-beta",
        agentId: "agent-1",
        jobId: "job-1",
        route: versionThreeRoute({ harnessId: "claude-code", authority: "behavioral_write" }),
        workspaceRoot,
      }),
      /capacity/i
    );
  });

  it("releases only through the shared settlement predicate and admits the next writer afterward", () => {
    const { root } = setup();
    const workspaceRoot = worktree(root, "worktree");
    const binding = {
      ownerRootId: "root-1",
      agentId: "agent-1",
      jobId: "job-1",
      route: versionThreeRoute({ authority: "behavioral_write" }),
      workspaceRoot,
    };
    acquireWorkspaceWriterLease(binding);

    const retained = releaseLeasesOnSettlement({
      normalizedTerminalResult: null,
      releases: [{ kind: "writer", ...binding }],
    });
    assert.equal(retained.released, false);
    assert.throws(
      () => acquireWorkspaceWriterLease({ ...binding, agentId: "agent-2", jobId: "job-2" }),
      /capacity/i
    );

    const released = releaseLeasesOnSettlement({
      normalizedTerminalResult: publishableResult(),
      releases: [{ kind: "writer", ...binding }],
    });
    assert.equal(released.released, true);
    assert.equal(released.releasedCount, 1);

    const second = acquireWorkspaceWriterLease({ ...binding, agentId: "agent-2", jobId: "job-2" });
    assert.equal(second.agentId, "agent-2");
  });

  it("serializes concurrent independent-process admission for one exclusive writer", async () => {
    const { root } = setup();
    const workspaceRoot = worktree(root, "worktree");
    const attempts = 6;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, index) =>
        new Promise((resolve) => {
          const child = spawn(process.execPath, [
            contentionFixture,
            "writer",
            workspaceRoot,
            `agent-${index}`,
            `job-${index}`,
          ], {
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stdout = "";
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (chunk) => { stdout += chunk; });
          child.on("exit", () => resolve(stdout.trim()));
        })
      )
    );
    const admitted = results.filter((line) => line === "admitted");
    const refused = results.filter((line) => line === "capacity_exhausted");
    assert.equal(admitted.length, 1);
    assert.equal(refused.length, attempts - 1);
  });
});

describe("workspace writer lease: release after workspace removal", () => {
  it("releases a writer lease through its stored canonical workspaceRoot after the directory is removed from disk", () => {
    const { root } = setup();
    const workspaceRoot = worktree(root, "worktree");
    const binding = {
      ownerRootId: "root-1",
      agentId: "agent-1",
      jobId: "job-1",
      route: versionThreeRoute({ authority: "behavioral_write" }),
    };
    const record = acquireWorkspaceWriterLease({ ...binding, workspaceRoot });
    const canonicalWorkspaceRoot = record.keyFields.workspaceRoot;

    fs.rmSync(workspaceRoot, { recursive: true, force: true });

    const release = { kind: "writer", ...binding, workspaceRoot: canonicalWorkspaceRoot };
    const released = releaseLeasesOnSettlement({
      normalizedTerminalResult: publishableResult(),
      releases: [release],
    });
    assert.equal(released.released, true);
    assert.equal(released.outcome, "all");
    assert.equal(released.releasedCount, 1);

    // Idempotent replay: the holder file is already gone, so a repeat release
    // of the same target reports already-released, not a thrown error.
    const replay = releaseLeasesOnSettlement({
      normalizedTerminalResult: publishableResult(),
      releases: [release],
    });
    assert.equal(replay.released, true);
    assert.equal(replay.alreadyReleasedCount, 1);
  });
});

describe("workspace writer lease: distinct operator-prepared canonical worktrees", () => {
  it("does not collide when canonical workspace roots differ", () => {
    const { root } = setup();
    const workspaceA = worktree(root, "worktree-a");
    const workspaceB = worktree(root, "worktree-b");
    const leaseA = acquireWorkspaceWriterLease({
      ownerRootId: "root-1", agentId: "agent-1", jobId: "job-1",
      route: versionThreeRoute({ authority: "behavioral_write" }), workspaceRoot: workspaceA,
    });
    const leaseB = acquireWorkspaceWriterLease({
      ownerRootId: "root-1", agentId: "agent-2", jobId: "job-2",
      route: versionThreeRoute({ authority: "behavioral_write" }), workspaceRoot: workspaceB,
    });
    assert.notEqual(leaseA.key, leaseB.key);
    assert.equal(leaseA.keyFields.workspaceRoot, fs.realpathSync.native(workspaceA));
    assert.equal(leaseB.keyFields.workspaceRoot, fs.realpathSync.native(workspaceB));
  });

  it("collides for two different-looking paths that are symlinks to the same worktree", () => {
    const { root } = setup();
    const real = worktree(root, "worktree-real");
    const alias = path.join(root, "worktree-alias");
    fs.symlinkSync(real, alias, "dir");
    acquireWorkspaceWriterLease({
      ownerRootId: "root-1", agentId: "agent-1", jobId: "job-1",
      route: versionThreeRoute({ authority: "behavioral_write" }), workspaceRoot: real,
    });
    assert.throws(
      () => acquireWorkspaceWriterLease({
        ownerRootId: "root-1", agentId: "agent-2", jobId: "job-2",
        route: versionThreeRoute({ authority: "behavioral_write" }), workspaceRoot: alias,
      }),
      /capacity/i
    );
  });

  it("fails closed on a workspace root that does not exist rather than silently diverging", () => {
    const { root } = setup();
    const missing = path.join(root, "does-not-exist");
    assert.throws(
      () => acquireWorkspaceWriterLease({
        ownerRootId: "root-1", agentId: "agent-1", jobId: "job-1",
        route: versionThreeRoute({ authority: "behavioral_write" }), workspaceRoot: missing,
      })
    );
  });
});

describe("workspace writer lease: read-only coexistence", () => {
  it("lets a read-only turn hold its own instance admission alongside an active writer, unblocked", () => {
    const { root } = setup();
    const workspaceRoot = worktree(root, "worktree");
    acquireWorkspaceWriterLease({
      ownerRootId: "root-1",
      agentId: "writer-agent",
      jobId: "writer-job",
      route: versionThreeRoute({ harnessId: "fake-service", authority: "behavioral_write" }),
      workspaceRoot,
    });

    // A read-only turn never acquires a writer lease -- the engine refuses a
    // writer-kind lease bound to anything but a behavioral_write route -- but
    // it can freely acquire the instance lease its own route requires, on the
    // very same Harness instance, without ever touching the writer lease.
    const readOnlyLease = acquireInstanceLease({
      ownerRootId: "root-1",
      agentId: "reader-agent",
      jobId: "reader-job",
      route: versionThreeRoute({ harnessId: "fake-service", authority: "behavioral_read_only" }),
      harnessId: "fake-service",
      instanceKey: "tenant-alpha",
      capacityClass: "shared",
      capacityLimit: 4,
    });
    assert.equal(readOnlyLease.route.authority, "behavioral_read_only");

    // The writer lease is still exclusively held; a second writer still fails.
    assert.throws(
      () => acquireWorkspaceWriterLease({
        ownerRootId: "root-1",
        agentId: "writer-agent-2",
        jobId: "writer-job-2",
        route: versionThreeRoute({ harnessId: "claude-code", authority: "behavioral_write" }),
        workspaceRoot,
      }),
      /capacity/i
    );
  });

  it("refuses a writer-kind lease bound to a behavioral_read_only route before any native input", () => {
    const { root } = setup();
    const workspaceRoot = worktree(root, "worktree");
    assert.throws(
      () => acquireWorkspaceWriterLease({
        ownerRootId: "root-1",
        agentId: "agent-1",
        jobId: "job-1",
        route: versionThreeRoute({ authority: "behavioral_read_only" }),
        workspaceRoot,
      }),
      /requires a behavioral_write route/i
    );
  });
});

describe("workspace writer lease: no ungated release surface", () => {
  it("exports no identity-only release function", async () => {
    const module = await import("../../runtime/workspace-writer-lease.mjs");
    assert.equal(module.releaseWorkspaceWriterLease, undefined);
    assert.equal(module.releaseLease, undefined);
    assert.equal(typeof module.releaseLeasesOnSettlement, "function");
  });
});

describe("workspace writer lease: brand-gated acquisition evidence (Task 5.3 correction)", () => {
  it("returns the canonical stable projection for a real writer acquire", () => {
    setup();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc-writer-lease-"));
    const record = acquireWorkspaceWriterLease({
      ownerRootId: "root-1", agentId: "agent-1", jobId: "job-1",
      route: versionThreeRoute({ authority: "behavioral_write" }), workspaceRoot,
    });
    const evidence = acquiredLeaseEvidence(record);
    assert.equal(evidence.kind, "writer");
    assert.deepEqual(evidence.keyFields, { workspaceRoot: fs.realpathSync.native(workspaceRoot) });
    assert.deepEqual(evidence.capacity, { class: null, limit: 1 });
  });

  it("a writer lease acquired for workspace A yields evidence that conflicts with a launch claim bound to workspace B (distinct keyFields)", () => {
    setup();
    const workspaceA = fs.mkdtempSync(path.join(os.tmpdir(), "cc-writer-lease-a-"));
    const workspaceB = fs.mkdtempSync(path.join(os.tmpdir(), "cc-writer-lease-b-"));
    const recordA = acquireWorkspaceWriterLease({
      ownerRootId: "root-1", agentId: "agent-1", jobId: "job-1",
      route: versionThreeRoute({ authority: "behavioral_write" }), workspaceRoot: workspaceA,
    });
    const evidenceA = acquiredLeaseEvidence(recordA);
    assert.notEqual(evidenceA.keyFields.workspaceRoot, fs.realpathSync.native(workspaceB));
  });
});

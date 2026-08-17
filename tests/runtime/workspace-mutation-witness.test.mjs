/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 6.4 of add-opencode-explorer-driver: the before/after workspace witness
 * that real acceptance binds to a read-only turn.
 *
 * The witness is the only thing that can say a read-only route actually left the
 * workspace alone, because that route's enforcement is Harness policy and a
 * prompt rather than an OS boundary. So these tests check two things with equal
 * weight: that the witness detects an added, modified, or deleted path, and that
 * a clean verdict never upgrades the claim to containment.
 *
 * No Harness, Server, or model is involved: the witness observes a filesystem.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";

import {
  MAX_WITNESS_BASENAME_CHARS,
  MAX_WITNESS_REPORTED_BASENAMES,
  MAX_WITNESS_SNAPSHOT_PATHS,
  WORKSPACE_MUTATION_WITNESS_VERSION,
  boundedWorkspaceBasenames,
  changedWorkspacePaths,
  closeWorkspaceMutationWitness,
  gitWorkspaceStatus,
  openWorkspaceMutationWitness,
  snapshotWorkspaceState,
} from "../../runtime/workspace-mutation-witness.mjs";

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function makeWorkspace({ git = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-witness-"));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "# workspace\n");
  fs.writeFileSync(path.join(root, "src", "index.mjs"), "export const value = 1;\n");
  if (git) {
    const run = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    run("init", "--quiet");
    run("config", "user.email", "witness@invalid");
    run("config", "user.name", "witness");
    run("add", "--all");
    run("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "seed");
  }
  return root;
}

describe("workspace mutation witness: detection", () => {
  it("reports a clean workspace after a turn that changed nothing", () => {
    const root = makeWorkspace();
    const witness = openWorkspaceMutationWitness(root);
    // A read-only turn reads; reading changes no metadata this witness records.
    fs.readFileSync(path.join(root, "README.md"), "utf8");
    fs.readdirSync(path.join(root, "src"));
    const verdict = closeWorkspaceMutationWitness(witness);
    assert.equal(verdict.clean, true);
    assert.equal(verdict.changedPathCount, 0);
    assert.deepEqual([...verdict.changedBasenames], []);
    assert.equal(verdict.snapshotOverflow, false);
    assert.equal(verdict.version, WORKSPACE_MUTATION_WITNESS_VERSION);
    assert.equal(Object.isFrozen(verdict), true);
  });

  it("detects an added file", () => {
    const root = makeWorkspace();
    const witness = openWorkspaceMutationWitness(root);
    fs.writeFileSync(path.join(root, "src", "added.mjs"), "export const added = true;\n");
    const verdict = closeWorkspaceMutationWitness(witness);
    assert.equal(verdict.clean, false);
    assert.ok(verdict.changedPathCount >= 1);
    assert.equal(verdict.changedBasenames.includes("added.mjs"), true);
  });

  it("detects a modified file even when its size is unchanged", () => {
    const root = makeWorkspace();
    const original = fs.readFileSync(path.join(root, "src", "index.mjs"), "utf8");
    const witness = openWorkspaceMutationWitness(root);
    fs.writeFileSync(path.join(root, "src", "index.mjs"), original.replace("1", "2"));
    const verdict = closeWorkspaceMutationWitness(witness);
    assert.equal(verdict.clean, false);
    assert.deepEqual([...verdict.changedBasenames], ["index.mjs"]);
  });

  it("detects a deleted file", () => {
    const root = makeWorkspace();
    const witness = openWorkspaceMutationWitness(root);
    fs.rmSync(path.join(root, "README.md"));
    const verdict = closeWorkspaceMutationWitness(witness);
    assert.equal(verdict.clean, false);
    assert.equal(verdict.changedBasenames.includes("README.md"), true);
  });

  it("detects a mode change and a file replaced by a symlink", () => {
    const root = makeWorkspace();
    const chmodWitness = openWorkspaceMutationWitness(root);
    fs.chmodSync(path.join(root, "README.md"), 0o600);
    assert.equal(closeWorkspaceMutationWitness(chmodWitness).clean, false);
    const linkWitness = openWorkspaceMutationWitness(root);
    fs.rmSync(path.join(root, "README.md"));
    fs.symlinkSync(path.join(root, "src", "index.mjs"), path.join(root, "README.md"));
    const verdict = closeWorkspaceMutationWitness(linkWitness);
    assert.equal(verdict.clean, false);
    assert.equal(verdict.changedBasenames.includes("README.md"), true);
  });

  it("detects a Git-visible change even when a turn committed it away", () => {
    const root = makeWorkspace({ git: true });
    const witness = openWorkspaceMutationWitness(root);
    assert.equal(witness.gitStatusDigest !== null, true, "the fixture must be a Git workspace");
    fs.writeFileSync(path.join(root, "src", "index.mjs"), "export const value = 99;\n");
    const run = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    run("add", "--all");
    run("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "a turn should never do this");
    const verdict = closeWorkspaceMutationWitness(witness);
    // The content change alone already fails it; the Git status comparison is the
    // independent second signal.
    assert.equal(verdict.clean, false);
    assert.equal(verdict.gitWorkspace, true);
  });

  it("witnesses a plain directory that is not a Git workspace", () => {
    const root = makeWorkspace();
    assert.equal(gitWorkspaceStatus(root), null);
    const verdict = closeWorkspaceMutationWitness(openWorkspaceMutationWitness(root));
    assert.equal(verdict.gitWorkspace, false);
    assert.equal(verdict.gitStatusChanged, false);
    assert.equal(verdict.clean, true);
  });

  it("refuses to open a witness on a missing workspace", () => {
    assert.throws(() => openWorkspaceMutationWitness(path.join(os.tmpdir(), "cc-witness-missing-xyz")));
    assert.throws(() => closeWorkspaceMutationWitness(null));
    assert.throws(() => closeWorkspaceMutationWitness({ root: 7 }));
  });
});

describe("workspace mutation witness: bounded, honest reporting", () => {
  it("reports basenames only, never a relative or absolute path", () => {
    const root = makeWorkspace();
    const witness = openWorkspaceMutationWitness(root);
    fs.mkdirSync(path.join(root, "src", "deep", "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "deep", "nested", "leaked.mjs"), "x\n");
    const verdict = closeWorkspaceMutationWitness(witness);
    assert.equal(verdict.clean, false);
    assert.equal(verdict.changedBasenames.includes("leaked.mjs"), true);
    const serialized = JSON.stringify(verdict);
    assert.equal(serialized.includes(root), false, "no absolute path");
    assert.equal(serialized.includes("src/deep"), false, "no relative path structure");
    for (const name of verdict.changedBasenames) {
      assert.equal(name.includes("/"), false, name);
      assert.ok(name.length <= MAX_WITNESS_BASENAME_CHARS);
    }
  });

  it("bounds the number and length of reported basenames", () => {
    const many = Array.from({ length: MAX_WITNESS_REPORTED_BASENAMES + 20 }, (unused, index) => `dir/file-${index}.txt`);
    const bounded = boundedWorkspaceBasenames(many);
    assert.equal(bounded.length, MAX_WITNESS_REPORTED_BASENAMES);
    const long = boundedWorkspaceBasenames([`dir/${"n".repeat(MAX_WITNESS_BASENAME_CHARS + 40)}.txt`]);
    assert.equal(long[0].length, MAX_WITNESS_BASENAME_CHARS);
    assert.ok(MAX_WITNESS_SNAPSHOT_PATHS >= 1024);
  });

  it("never claims OS containment, and states its enforcement honestly", () => {
    const root = makeWorkspace();
    const verdict = closeWorkspaceMutationWitness(openWorkspaceMutationWitness(root));
    assert.equal(verdict.clean, true);
    // 6.4: a clean witness is evidence about what happened, never a policy
    // upgrade. The route's authority stays behavioral, and the verdict says so.
    assert.equal(verdict.enforcement, "harness_policy");
    assert.equal(verdict.osContainment, false);
    const serialized = JSON.stringify(verdict);
    assert.equal(/sandbox|container|jail|chroot|isolated/i.test(serialized), false);
    assert.deepEqual(Object.keys(verdict).sort(), [
      "changedBasenames",
      "changedPathCount",
      "clean",
      "enforcement",
      "gitStatusChanged",
      "gitWorkspace",
      "osContainment",
      "snapshotOverflow",
      "version",
    ]);
  });

  it("fails closed when a snapshot bound is reached before every path is compared", () => {
    const root = makeWorkspace();
    const before = snapshotWorkspaceState(root);
    const truncated = { paths: before.paths, overflow: true };
    const verdict = closeWorkspaceMutationWitness({ root, snapshot: truncated, gitStatusDigest: null });
    assert.equal(verdict.snapshotOverflow, true);
    assert.equal(verdict.clean, false, "an incompletely compared workspace is not a clean workspace");
  });

  it("compares two snapshots without reading the filesystem again", () => {
    const root = makeWorkspace();
    const before = snapshotWorkspaceState(root);
    fs.writeFileSync(path.join(root, "src", "extra.mjs"), "x\n");
    const after = snapshotWorkspaceState(root);
    const changed = changedWorkspacePaths(before, after);
    assert.equal(changed.includes(path.join("src", "extra.mjs")), true);
    // Detection rests on the new path itself, not on a directory's metadata: a
    // directory's recorded type/size/mode need not change when a child is added,
    // and the witness deliberately records no mtime it would have to trust.
    assert.equal(changed.length >= 1, true);
    assert.deepEqual(changedWorkspacePaths(before, before), []);
    assert.deepEqual(changed, [...changed].sort(), "the diff is deterministic");
  });

  it("excludes .git bookkeeping from the path diff", () => {
    const root = makeWorkspace({ git: true });
    const snapshot = snapshotWorkspaceState(root);
    for (const relative of snapshot.paths.keys()) {
      assert.equal(relative === ".git" || relative.startsWith(`.git${path.sep}`), false, relative);
    }
  });
});

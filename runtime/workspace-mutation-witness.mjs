/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * The one owner of before/after workspace mutation evidence.
 *
 * A read-only route's authority is Harness policy plus a prompt, never an OS
 * boundary. That makes an independent witness the only thing that can say
 * whether a turn actually left the workspace alone, which is why this evidence
 * exists and why it is deliberately not derived from the Harness's own claims.
 *
 * The snapshot/diff/basename core here is exactly the mutation gate
 * `runtime/phase-a-leaf-smoke.mjs` already used; it moved into this module so
 * the Phase A smoke and the OpenCode Explorer acceptance flow share one
 * implementation instead of two copies that could drift.
 *
 * Two disclosure rules shape the report:
 *
 *   - only bounded *basenames* of changed paths are ever reported, never a
 *     relative or absolute path: a full path carries task-shaped structure and
 *     an absolute one carries operator configuration;
 *   - the verdict never claims containment. It states what changed and that
 *     enforcement was Harness policy, so a clean witness can never be read as
 *     proof of an OS sandbox that does not exist.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Bounds on one snapshot, so a large tree fails closed instead of unbounded. */
export const MAX_WITNESS_SNAPSHOT_PATHS = 4096;
export const MAX_WITNESS_REPORTED_BASENAMES = 16;
export const MAX_WITNESS_BASENAME_CHARS = 64;

/** The closed verdict schema version. */
export const WORKSPACE_MUTATION_WITNESS_VERSION = 1;

/**
 * Path, type, size, mode, and content digest of every path in a workspace
 * outside `.git`. A turn that holds no write authority may change none of them,
 * so any difference at all is a refusal.
 *
 * `.git` itself is excluded because its bookkeeping (index mtimes, logs, refs
 * touched by unrelated tooling) changes for reasons a turn did not cause; a
 * commit made by a turn is caught by the separate Git status comparison below.
 */
export function snapshotWorkspaceState(root) {
  const paths = new Map();
  let overflow = false;
  const visit = (relative) => {
    if (paths.size >= MAX_WITNESS_SNAPSHOT_PATHS) {
      overflow = true;
      return;
    }
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    const metadata = {
      type: stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file",
      size: stat.size,
      mode: stat.mode,
    };
    if (stat.isFile()) {
      metadata.sha256 = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    }
    paths.set(relative || ".", metadata);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!relative && entry.name === ".git") continue;
      visit(relative ? path.join(relative, entry.name) : entry.name);
    }
  };
  visit("");
  return { paths, overflow };
}

/**
 * Every path whose metadata differs between two snapshots. An added path is
 * present on one side only, a deleted path on the other, and a modified path
 * differs in digest, size, mode, or type -- all three are the same comparison.
 */
export function changedWorkspacePaths(before, after) {
  const union = new Set([...before.paths.keys(), ...after.paths.keys()]);
  return [...union]
    .filter((relative) =>
      JSON.stringify(before.paths.get(relative) ?? null) !== JSON.stringify(after.paths.get(relative) ?? null))
    .sort();
}

/**
 * Only the basename of a mutated path, bounded in count and length. A full
 * relative path can carry task-shaped structure; a basename is enough to say
 * what was touched.
 */
export function boundedWorkspaceBasenames(relatives) {
  const names = new Set();
  for (const relative of relatives) {
    if (names.size >= MAX_WITNESS_REPORTED_BASENAMES) break;
    names.add(path.basename(String(relative)).slice(0, MAX_WITNESS_BASENAME_CHARS));
  }
  return [...names].sort();
}

/**
 * The workspace's Git status text, or `null` when the directory is not a Git
 * workspace. Unlike the Phase A smoke's own strict helper this tolerates a
 * non-repository workspace: the Explorer's acceptance flow must still be able
 * to witness a plain directory.
 */
export function gitWorkspaceStatus(root) {
  const result = spawnSync("git", ["-C", root, "status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return String(result.stdout ?? "");
}

/**
 * Open one witness over a workspace: the "before" half of the evidence. The
 * returned value is opaque state for `closeWorkspaceMutationWitness()`, not a
 * report -- it holds full relative paths and must never be serialized.
 */
export function openWorkspaceMutationWitness(root) {
  const resolvedRoot = path.resolve(String(root ?? ""));
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error("A workspace mutation witness requires an existing workspace directory.");
  }
  return {
    root: resolvedRoot,
    snapshot: snapshotWorkspaceState(resolvedRoot),
    gitStatusDigest: digestOf(gitWorkspaceStatus(resolvedRoot)),
  };
}

function digestOf(text) {
  return text == null ? null : createHash("sha256").update(text).digest("hex");
}

/**
 * Close one witness and return the closed bounded verdict.
 *
 * `clean` is the only fact an acceptance gate needs, and it is conservative:
 * an overflowed snapshot is not clean, because a bound was reached before every
 * path could be compared. The verdict states the honest enforcement label so a
 * clean result is never mistaken for OS containment.
 */
export function closeWorkspaceMutationWitness(witness) {
  if (!witness || typeof witness !== "object" || typeof witness.root !== "string") {
    throw new Error("Closing a workspace mutation witness requires the state its open call returned.");
  }
  const after = snapshotWorkspaceState(witness.root);
  const changed = changedWorkspacePaths(witness.snapshot, after);
  const gitStatusDigest = digestOf(gitWorkspaceStatus(witness.root));
  const gitStatusChanged = witness.gitStatusDigest !== gitStatusDigest;
  const snapshotOverflow = witness.snapshot.overflow === true || after.overflow === true;
  return Object.freeze({
    version: WORKSPACE_MUTATION_WITNESS_VERSION,
    clean: changed.length === 0 && !gitStatusChanged && !snapshotOverflow,
    changedPathCount: changed.length,
    changedBasenames: Object.freeze(boundedWorkspaceBasenames(changed)),
    gitStatusChanged,
    gitWorkspace: gitStatusDigest !== null,
    snapshotOverflow,
    // Read-only is a Harness policy and a prompt, proven after the fact by this
    // witness. It is never a containment claim, and a clean witness never
    // upgrades the route's authority.
    enforcement: "harness_policy",
    osContainment: false,
  });
}

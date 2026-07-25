/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resolve the canonical workspace identity without requiring Git. Claude Code
 * itself accepts non-repository projects, so the runtime must not impose a
 * narrower contract than its host CLI.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function resolveWorkspaceRoot(cwd) {
  const resolved = path.resolve(cwd);
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: resolved,
    encoding: "utf8",
    windowsHide: true,
  });
  const candidate = git.status === 0 ? git.stdout.trim() : resolved;
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

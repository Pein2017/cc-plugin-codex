/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 9: a test run writes durable state into its own disposable root, never
 * into the namespace an operator's installed Plugin uses.
 *
 * This is the loud half of the mechanism in
 * `tests/runtime/fixtures/pinned-data-root.mjs`. That preload supplies the
 * default home; this fails the run if anything -- the preload not being loaded,
 * a suite clearing the variable, a future refactor reordering the resolution --
 * lets a test process resolve the real namespace again.
 *
 * The gap it closes was real and quiet: 2,316 state roots had accumulated in
 * the operator namespace from ordinary `npm run check` runs, because the roots
 * are directories that contain no files, so every sweep that looked for files
 * reported nothing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  resolveExpectedPluginDataRoot,
  resolvePluginDataRoot,
  resolvePluginStateRoot,
} from "../../runtime/paths.mjs";

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

describe("durable test state stays out of the operator namespace", () => {
  it("pins this process's data root to a disposable directory", () => {
    const injected = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME?.trim();
    assert.ok(
      injected,
      "the test runner must inject CODEX_HARNESSDOCK_RUNTIME_HOME; see " +
      "tests/runtime/fixtures/pinned-data-root.mjs and the `test` npm script",
    );
    const resolved = resolvePluginDataRoot();
    assert.equal(resolved, path.resolve(injected));
  });

  it("never resolves a data or state root inside the installed operator namespace", () => {
    const operatorRoot = resolveExpectedPluginDataRoot();
    for (const resolved of [resolvePluginDataRoot(), resolvePluginStateRoot()]) {
      assert.equal(
        isWithin(resolved, operatorRoot),
        false,
        `a test run resolved ${resolved}, which is inside the operator namespace ${operatorRoot}`,
      );
    }
  });

  it("writes its own state where it resolves it, and nowhere else", () => {
    const stateRoot = resolvePluginStateRoot();
    fs.mkdirSync(stateRoot, { recursive: true });
    const marker = path.join(stateRoot, `isolation-${process.pid}.marker`);
    fs.writeFileSync(marker, "written by the durable-state isolation test");
    try {
      assert.equal(fs.existsSync(marker), true);
      // The disposable root is under the OS temp directory, so a run that is
      // killed leaves litter only where litter is expected.
      assert.equal(isWithin(stateRoot, fs.realpathSync.native(os.tmpdir())), true);
    } finally {
      fs.rmSync(marker, { force: true });
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyPromotionPaths,
  pathRequiresCodexRestart,
} from "../../scripts/promotion-policy.mjs";

describe("local promotion path policy", () => {
  it("keeps compatible runtime implementation and project-only edits hot", () => {
    assert.equal(pathRequiresCodexRestart("runtime/job-supervisor.mjs"), false);
    assert.equal(pathRequiresCodexRestart("tests/runtime/example.test.mjs"), false);
    assert.deepEqual(classifyPromotionPaths([
      "runtime/job-supervisor.mjs",
      "README.md",
    ]), {
      activation: "hot_compatible",
      changedPathCount: 2,
      decisivePaths: [],
    });
  });

  it("requires restart for static, discovery, environment, and dependency surfaces", () => {
    const result = classifyPromotionPaths([
      "runtime/mcp-server.mjs",
      "plugins/cc-for-pein/skills/spawn-agent/SKILL.md",
      "config/runtime.env",
      "package-lock.json",
    ]);
    assert.equal(result.activation, "restart_required");
    assert.equal(result.changedPathCount, 4);
    assert.deepEqual(result.decisivePaths, [
      "config/runtime.env",
      "package-lock.json",
      "plugins/cc-for-pein/skills/spawn-agent/SKILL.md",
      "runtime/mcp-server.mjs",
    ]);
  });
});

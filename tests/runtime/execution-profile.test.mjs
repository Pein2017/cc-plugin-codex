import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  createExecutionProfile,
  validateExecutionProfileOptions,
} from "../../runtime/execution-profile.mjs";

const previousRuntimeHome = process.env.CC_RUNTIME_HOME;
const roots = [];
afterEach(() => {
  if (previousRuntimeHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = previousRuntimeHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

describe("execution profiles", () => {
  it("validates a complete profile without creating runtime sandbox state", () => {
    assert.deepEqual(
      validateExecutionProfileOptions({ profile: "safe", model: "sonnet", write: false }),
      {
        name: "safe",
        model: "claude-sonnet-5",
        effort: "high",
        dangerouslySkipPermissions: false,
      },
    );
    assert.throws(
      () => validateExecutionProfileOptions({
        profile: "terminal-parity",
        model: "opus",
        permissionMode: "auto",
      }),
      /cannot be combined/,
    );
  });

  it("defaults to full-access terminal parity while keeping model and effort explicit", () => {
    const profile = createExecutionProfile({
      model: "sonnet",
      write: true,
      env: { CLAUDE_CONFIG_DIR: "/project/.claude" },
    });
    assert.equal(profile.name, "terminal-parity");
    assert.deepEqual(Object.keys(profile.claudeOptions), ["env", "model", "dangerouslySkipPermissions"]);
    assert.equal(profile.claudeOptions.model, "claude-sonnet-5");
    assert.equal(profile.claudeOptions.effort, undefined);
    assert.equal(profile.claudeOptions.env.IS_SANDBOX, "1");
    assert.deepEqual(profile.receipt.addedOverrides, ["model", "dangerouslySkipPermissions"]);
    assert.equal(profile.receipt.inheritedClaudeConfiguration, true);
    assert.throws(
      () => createExecutionProfile({ profile: "terminal-parity", env: {} }),
      /explicit Sonnet, Opus, or test-only Haiku model/
    );
    const haiku = createExecutionProfile({
      profile: "terminal-parity",
      model: "haiku",
      env: {},
    });
    assert.equal(haiku.claudeOptions.model, "claude-haiku-4-5");
    assert.equal(haiku.claudeOptions.effort, undefined);
    assert.deepEqual(haiku.receipt.addedOverrides, ["model", "dangerouslySkipPermissions"]);

    const explicitLowHaiku = createExecutionProfile({
      profile: "terminal-parity",
      model: "haiku",
      effort: "low",
      env: {},
    });
    assert.equal(explicitLowHaiku.claudeOptions.effort, "low");
    assert.deepEqual(
      explicitLowHaiku.receipt.addedOverrides,
      ["model", "dangerouslySkipPermissions", "effort"],
    );
  });

  it("preserves caller-explicit tool selection but rejects permission-mode conflicts", () => {
    const profile = createExecutionProfile({
      profile: "terminal-parity",
      model: "opus",
      allowedTools: ["mcp__serena__get_symbols_overview"],
      env: {},
    });
    assert.deepEqual(profile.claudeOptions.allowedTools, ["mcp__serena__get_symbols_overview"]);
    assert.deepEqual(profile.receipt.addedOverrides.sort(), ["allowedTools", "dangerouslySkipPermissions", "model"]);
    assert.throws(
      () => createExecutionProfile({
        profile: "terminal-parity",
        model: "opus",
        permissionMode: "auto",
      }),
      /cannot be combined/
    );
  });

  it("models the explicit unrestricted native launcher without weakening safe", () => {
    const profile = createExecutionProfile({
      profile: "terminal-parity",
      model: "opus",
      dangerouslySkipPermissions: true,
      env: { CLAUDE_CONFIG_DIR: "/project/.claude", IS_SANDBOX: "0" },
    });
    assert.equal(profile.claudeOptions.dangerouslySkipPermissions, true);
    assert.equal(profile.claudeOptions.env.IS_SANDBOX, "1");
    assert.deepEqual(profile.receipt.addedOverrides, ["model", "dangerouslySkipPermissions"]);
    assert.throws(
      () => createExecutionProfile({ profile: "safe", model: "opus", dangerouslySkipPermissions: true }),
      /safe must remain sandboxed/
    );
    assert.throws(
      () => createExecutionProfile({
        profile: "terminal-parity",
        model: "opus",
        dangerouslySkipPermissions: true,
        permissionMode: "auto",
      }),
      /cannot be combined/
    );
  });

  it("makes safe read-only policy explicit and removable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-profile-"));
    roots.push(root);
    process.env.CC_RUNTIME_HOME = root;
    const profile = createExecutionProfile({ profile: "safe", model: "sonnet", write: false, env: {} });
    assert.equal(profile.claudeOptions.permissionMode, "dontAsk");
    assert.ok(profile.claudeOptions.allowedTools.includes("Read"));
    assert.ok(fs.existsSync(profile.claudeOptions.settingsFile));
    profile.cleanup();
    assert.equal(fs.existsSync(profile.claudeOptions.settingsFile), false);
  });
});

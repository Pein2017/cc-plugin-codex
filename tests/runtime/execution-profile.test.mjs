import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createExecutionProfile } from "../../runtime/execution-profile.mjs";

const previousRuntimeHome = process.env.CC_RUNTIME_HOME;
const roots = [];
afterEach(() => {
  if (previousRuntimeHome == null) delete process.env.CC_RUNTIME_HOME;
  else process.env.CC_RUNTIME_HOME = previousRuntimeHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

describe("execution profiles", () => {
  it("keeps terminal-parity free of implicit Claude overrides", () => {
    const profile = createExecutionProfile({
      profile: "terminal-parity",
      write: true,
      env: { CLAUDE_CONFIG_DIR: "/project/.claude" },
    });
    assert.deepEqual(Object.keys(profile.claudeOptions), ["env"]);
    assert.deepEqual(profile.receipt.addedOverrides, []);
    assert.equal(profile.receipt.inheritedClaudeConfiguration, true);
  });

  it("records caller-explicit headless permission overrides", () => {
    const profile = createExecutionProfile({
      profile: "terminal-parity",
      permissionMode: "auto",
      allowedTools: ["mcp__serena__get_symbols_overview"],
      env: {},
    });
    assert.equal(profile.claudeOptions.permissionMode, "auto");
    assert.deepEqual(profile.claudeOptions.allowedTools, ["mcp__serena__get_symbols_overview"]);
    assert.deepEqual(profile.receipt.addedOverrides.sort(), ["allowedTools", "permissionMode"]);
  });

  it("models the explicit unrestricted native launcher without weakening safe", () => {
    const profile = createExecutionProfile({
      profile: "terminal-parity",
      dangerouslySkipPermissions: true,
      env: { CLAUDE_CONFIG_DIR: "/project/.claude", IS_SANDBOX: "0" },
    });
    assert.equal(profile.claudeOptions.dangerouslySkipPermissions, true);
    assert.equal(profile.claudeOptions.env.IS_SANDBOX, "1");
    assert.deepEqual(profile.receipt.addedOverrides, ["dangerouslySkipPermissions"]);
    assert.throws(
      () => createExecutionProfile({ profile: "safe", dangerouslySkipPermissions: true }),
      /safe must remain sandboxed/
    );
    assert.throws(
      () => createExecutionProfile({
        profile: "terminal-parity",
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
    const profile = createExecutionProfile({ profile: "safe", write: false, env: {} });
    assert.equal(profile.claudeOptions.permissionMode, "dontAsk");
    assert.ok(profile.claudeOptions.allowedTools.includes("Read"));
    assert.ok(fs.existsSync(profile.claudeOptions.settingsFile));
    profile.cleanup();
    assert.equal(fs.existsSync(profile.claudeOptions.settingsFile), false);
  });
});

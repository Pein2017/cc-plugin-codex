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
        delegationMode: "leaf",
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
    assert.deepEqual(
      validateExecutionProfileOptions({ profile: "terminal-parity", model: "sonnet" }),
      {
        name: "terminal-parity",
        model: "claude-sonnet-5",
        effort: undefined,
        delegationMode: "leaf",
        dangerouslySkipPermissions: true,
      },
    );
    assert.equal(
      validateExecutionProfileOptions({
        profile: "terminal-parity",
        model: "sonnet",
        write: true,
      }).dangerouslySkipPermissions,
      true,
    );
  });

  it("always applies terminal-parity bypass while keeping model and effort explicit", () => {
    const profile = createExecutionProfile({
      model: "sonnet",
      write: true,
      env: { CLAUDE_CONFIG_DIR: "/project/.claude" },
    });
    assert.equal(profile.name, "terminal-parity");
    assert.deepEqual(Object.keys(profile.claudeOptions), [
      "env",
      "model",
      "appendSystemPrompt",
      "disallowedTools",
      "dangerouslySkipPermissions",
    ]);
    assert.equal(profile.claudeOptions.model, "claude-sonnet-5");
    assert.equal(profile.claudeOptions.effort, undefined);
    assert.equal(profile.claudeOptions.env.IS_SANDBOX, "1");
    assert.deepEqual(profile.receipt.addedOverrides, [
      "model",
      "appendSystemPrompt",
      "disallowedTools",
      "dangerouslySkipPermissions",
    ]);
    assert.equal(profile.receipt.inheritedClaudeConfiguration, true);
    assert.throws(
      () => createExecutionProfile({ profile: "terminal-parity", env: {} }),
      /explicit Haiku, Sonnet, Opus, or Fable model/
    );
    const haiku = createExecutionProfile({
      profile: "terminal-parity",
      model: "haiku",
      env: {},
    });
    assert.equal(haiku.claudeOptions.model, "claude-haiku-4-5");
    assert.equal(haiku.claudeOptions.effort, undefined);
    assert.equal(haiku.claudeOptions.dangerouslySkipPermissions, true);
    assert.deepEqual(haiku.receipt.addedOverrides, [
      "model",
      "appendSystemPrompt",
      "disallowedTools",
      "dangerouslySkipPermissions",
    ]);

    const explicitLowHaiku = createExecutionProfile({
      profile: "terminal-parity",
      model: "haiku",
      effort: "low",
      env: {},
    });
    assert.equal(explicitLowHaiku.claudeOptions.effort, "low");
    assert.deepEqual(
      explicitLowHaiku.receipt.addedOverrides,
      ["model", "appendSystemPrompt", "disallowedTools", "dangerouslySkipPermissions", "effort"],
    );

    const fable = createExecutionProfile({ profile: "safe", model: "fable", env: {} });
    assert.equal(fable.claudeOptions.model, "claude-fable-5");
    assert.equal(fable.claudeOptions.effort, "max");
    fable.cleanup();
  });

  it("ignores a terminal-parity allow-list while preserving internal safe tool selection", () => {
    const profile = createExecutionProfile({
      profile: "terminal-parity",
      model: "opus",
      allowedTools: ["mcp__serena__get_symbols_overview"],
      env: {},
    });
    assert.equal(profile.claudeOptions.allowedTools, undefined);
    assert.deepEqual(profile.receipt.addedOverrides.sort(), [
      "appendSystemPrompt",
      "dangerouslySkipPermissions",
      "disallowedTools",
      "model",
    ]);
    const safe = createExecutionProfile({
      profile: "safe",
      model: "opus",
      allowedTools: ["mcp__serena__get_symbols_overview"],
      env: {},
    });
    assert.deepEqual(safe.claudeOptions.allowedTools, ["mcp__serena__get_symbols_overview"]);
    safe.cleanup();
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
      write: true,
      dangerouslySkipPermissions: true,
      env: { CLAUDE_CONFIG_DIR: "/project/.claude", IS_SANDBOX: "0" },
    });
    assert.equal(profile.claudeOptions.dangerouslySkipPermissions, true);
    assert.equal(profile.claudeOptions.env.IS_SANDBOX, "1");
    assert.deepEqual(profile.receipt.addedOverrides, [
      "model",
      "appendSystemPrompt",
      "disallowedTools",
      "dangerouslySkipPermissions",
    ]);
    assert.throws(
      () => createExecutionProfile({
        profile: "safe",
        model: "opus",
        write: true,
        dangerouslySkipPermissions: true,
      }),
      /safe must remain sandboxed/
    );
    const explicitReadBypass = createExecutionProfile({
      profile: "terminal-parity",
      model: "opus",
      dangerouslySkipPermissions: true,
    });
    assert.equal(explicitReadBypass.claudeOptions.dangerouslySkipPermissions, true);
    assert.match(explicitReadBypass.claudeOptions.appendSystemPrompt, /read\/review only/i);
    assert.throws(
      () => createExecutionProfile({
        profile: "terminal-parity",
        model: "opus",
        write: true,
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

  it("enforces leaf depth and permits only explicit Fable orchestration", () => {
    const leaf = createExecutionProfile({
      profile: "terminal-parity",
      model: "opus",
      delegationMode: "leaf",
      env: {},
    });
    assert.match(leaf.claudeOptions.appendSystemPrompt, /delegated by Codex/i);
    assert.match(leaf.claudeOptions.appendSystemPrompt, /Act as a leaf/i);
    assert.match(leaf.claudeOptions.appendSystemPrompt, /read\/review only/i);
    assert.match(leaf.claudeOptions.appendSystemPrompt, /full CLI access avoids prompts/i);
    assert.match(leaf.claudeOptions.appendSystemPrompt, /blocked on a lead\/user decision/i);
    assert.deepEqual(leaf.claudeOptions.disallowedTools, ["Agent", "Workflow"]);

    const writingLeaf = createExecutionProfile({
      profile: "terminal-parity",
      model: "sonnet",
      write: true,
      env: {},
    });
    assert.match(writingLeaf.claudeOptions.appendSystemPrompt, /task-scoped workspace mutation/i);
    assert.doesNotMatch(writingLeaf.claudeOptions.appendSystemPrompt, /read\/review only/i);
    assert.deepEqual(writingLeaf.claudeOptions.disallowedTools, ["Agent", "Workflow"]);

    for (const tool of ["Agent", "Agent(explore)", "Agent(plan, explore)"]) {
      assert.throws(
        () => validateExecutionProfileOptions({ model: "opus", allowedTools: [tool] }),
        /cannot allow the native Agent tool/,
      );
    }
    assert.throws(
      () => validateExecutionProfileOptions({
        model: "opus",
        delegationMode: "claude_orchestrator",
      }),
      /requires exact model claude-fable-5/,
    );

    const orchestrator = createExecutionProfile({
      profile: "terminal-parity",
      model: "fable",
      delegationMode: "claude_orchestrator",
      env: {},
    });
    assert.match(orchestrator.claudeOptions.appendSystemPrompt, /one child generation/i);
    assert.match(orchestrator.claudeOptions.appendSystemPrompt, /join every child/i);
    assert.match(orchestrator.claudeOptions.appendSystemPrompt, /never use Workflow/i);
    assert.deepEqual(orchestrator.claudeOptions.disallowedTools, ["Workflow"]);
  });
});

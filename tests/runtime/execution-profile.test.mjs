import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  createExecutionProfile,
  validateExecutionProfileOptions,
} from "../../runtime/execution-profile.mjs";

const previousRuntimeHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
const roots = [];
afterEach(() => {
  if (previousRuntimeHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = previousRuntimeHome;
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
    process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = root;
    const profile = createExecutionProfile({ profile: "safe", model: "sonnet", write: false, env: {} });
    assert.equal(profile.claudeOptions.permissionMode, "dontAsk");
    assert.ok(profile.claudeOptions.allowedTools.includes("Read"));
    assert.ok(fs.existsSync(profile.claudeOptions.settingsFile));
    profile.cleanup();
    assert.equal(fs.existsSync(profile.claudeOptions.settingsFile), false);
  });

  it("composes the bounded native-team profile only for exact durable Opus or Fable leads", () => {
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
    assert.ok(leaf.claudeOptions.disallowedTools.includes("Agent"));
    assert.ok(leaf.claudeOptions.disallowedTools.includes("SendMessage"));
    assert.ok(leaf.claudeOptions.disallowedTools.includes("Workflow"));

    const writingLeaf = createExecutionProfile({
      profile: "terminal-parity",
      model: "sonnet",
      write: true,
      env: {},
    });
    assert.match(writingLeaf.claudeOptions.appendSystemPrompt, /task-scoped workspace mutation/i);
    assert.doesNotMatch(writingLeaf.claudeOptions.appendSystemPrompt, /read\/review only/i);
    assert.ok(writingLeaf.claudeOptions.disallowedTools.includes("Agent"));
    assert.ok(writingLeaf.claudeOptions.disallowedTools.includes("SendMessage"));
    assert.ok(writingLeaf.claudeOptions.disallowedTools.includes("Workflow"));

    const haikuLeaf = createExecutionProfile({
      profile: "terminal-parity",
      model: "claude-haiku-4-5",
      write: false,
      env: {},
    });
    assert.equal(haikuLeaf.claudeOptions.model, "claude-haiku-4-5");
    assert.throws(
      () => createExecutionProfile({
        profile: "terminal-parity",
        model: "claude-haiku-4-5",
        write: true,
        env: {},
      }),
      /Haiku is valid only as a write:false leaf scout/,
    );

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
      /requires exact model claude-opus-5 or claude-fable-5/,
    );

    for (const model of ["claude-opus-5", "claude-fable-5"]) {
      assert.throws(
        () => createExecutionProfile({
          profile: "terminal-parity",
          model,
          delegationMode: "claude_orchestrator",
          env: {},
        }),
        /durable jobId/,
      );
    }
    assert.throws(
      () => createExecutionProfile({
        profile: "terminal-parity",
        model: "claude-sonnet-5",
        delegationMode: "claude_orchestrator",
        jobId: "job-invalid-sonnet-lead",
        env: {},
      }),
      /requires exact model claude-opus-5 or claude-fable-5/,
    );

    const orchestrator = createExecutionProfile({
      profile: "terminal-parity",
      model: "claude-opus-5",
      delegationMode: "claude_orchestrator",
      jobId: "job-opus-native-team",
      env: { CLAUDE_CODE_SUBAGENT_MODEL: "claude-fable-5" },
    });
    assert.match(orchestrator.claudeOptions.appendSystemPrompt, /fresh experimental Native Agent Team/i);
    assert.match(orchestrator.claudeOptions.appendSystemPrompt, /behavioral cost and coordination budgets/i);
    assert.match(orchestrator.claudeOptions.appendSystemPrompt, /residual guard.*ordinary-subagent/i);
    assert.match(orchestrator.claudeOptions.appendSystemPrompt, /never use Workflow/i);
    assert.match(
      orchestrator.claudeOptions.appendSystemPrompt,
      /do not mutate task, workspace, repository, or external state except Claude native local-memory maintenance under \.claude\/agent-memory-local\/<member-type>\//i,
    );
    assert.equal(orchestrator.claudeOptions.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1");
    assert.equal(orchestrator.claudeOptions.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, "1");
    assert.equal(orchestrator.claudeOptions.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, "3");
    assert.equal(orchestrator.claudeOptions.env.CLAUDE_CODE_SUBAGENT_MODEL, undefined);
    assert.deepEqual(Object.keys(orchestrator.claudeOptions.agents), ["haiku-scout", "sonnet", "opus"]);
    const scout = orchestrator.claudeOptions.agents["haiku-scout"];
    assert.deepEqual(Object.keys(scout), ["description", "model", "memory", "disallowedTools", "prompt"]);
    assert.equal(scout.description, "Read-only bounded reconnaissance for the current Native Agent Team.");
    assert.equal(scout.model, "claude-haiku-4-5");
    assert.equal(scout.memory, "local");
    assert.ok(scout.disallowedTools.includes("Agent"));
    assert.match(scout.prompt, /pinned model claude-haiku-4-5/i);
    assert.equal(orchestrator.claudeOptions.agents.sonnet.model, "claude-sonnet-5");
    assert.equal(
      orchestrator.claudeOptions.agents.sonnet.description,
      "Bounded implementation, investigation, or review for the current Native Agent Team.",
    );
    assert.equal(orchestrator.claudeOptions.agents.opus.model, "claude-opus-5");
    assert.equal(
      orchestrator.claudeOptions.agents.opus.description,
      "Bounded implementation, investigation, or verification for the current Native Agent Team.",
    );
    assert.equal("effort" in orchestrator.claudeOptions.agents.opus, false);
    assert.equal("isolation" in orchestrator.claudeOptions.agents.opus, false);
    assert.ok(orchestrator.claudeOptions.disallowedTools.includes("Workflow"));
    assert.equal(orchestrator.claudeOptions.model, "claude-opus-5");
  });
});

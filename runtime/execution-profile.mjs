/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * One semantic owner for every Claude CLI override. `terminal-parity` inherits
 * the user's normal Claude envelope except for the plugin-wide supported-model
 * constraint; `safe` also adds an explicit sandbox/tool policy suitable for
 * delegated work.
 */
import {
  SANDBOX_READ_ONLY_TOOLS,
  cleanupSandboxSettings,
  createSandboxSettings,
  resolveDefaultEffort,
  resolveEffort,
  resolveModel,
} from "./claude-headless-adapter.mjs";

export const EXECUTION_PROFILES = new Set(["safe", "terminal-parity"]);
export const DELEGATION_MODES = new Set(["leaf", "claude_orchestrator"]);

const COMMON_DELEGATION_PROMPT = [
  "You are a bounded Claude Agent delegated by a Codex lead.",
  "Stay within the supplied task, workspace, and authority.",
  "Codex owns user-facing synthesis and final acceptance.",
  "Return one self-contained final result containing the evidence and conclusions the lead needs.",
].join(" ");

const READ_ONLY_AUTHORITY_PROMPT = [
  "Authority: read and review only.",
  "Full Claude CLI permissions are granted only to avoid headless permission prompts.",
  "Do not create, edit, delete, rename, move, or otherwise mutate workspace files, repository state, or external systems.",
].join(" ");

const WRITE_AUTHORITY_PROMPT = [
  "Authority: task-scoped workspace mutation is allowed.",
  "Change only what the supplied task requires and preserve unrelated user work.",
].join(" ");

const LEAF_DELEGATION_PROMPT = [
  COMMON_DELEGATION_PROMPT,
  "Act as a leaf Agent: do not delegate work or invoke the native Agent tool.",
].join(" ");

const CLAUDE_ORCHESTRATOR_PROMPT = [
  COMMON_DELEGATION_PROMPT,
  "You may use Claude Code native subagents for at most one child generation.",
  "Join every child you start and synthesize their work into your own final response.",
].join(" ");

export function normalizeDelegationMode(value) {
  const mode = String(value ?? "leaf").trim().toLowerCase();
  if (!DELEGATION_MODES.has(mode)) {
    throw new Error(`Unknown delegation mode ${value}. Use leaf or claude_orchestrator.`);
  }
  return mode;
}

function isNativeAgentTool(value) {
  return /^Agent(?:\(|$)/.test(String(value ?? "").trim());
}

function delegationPrompt(mode, write) {
  const rolePrompt = mode === "claude_orchestrator"
    ? CLAUDE_ORCHESTRATOR_PROMPT
    : LEAF_DELEGATION_PROMPT;
  return [rolePrompt, write ? WRITE_AUTHORITY_PROMPT : READ_ONLY_AUTHORITY_PROMPT].join(" ");
}

export function normalizeProfileName(value) {
  const name = String(value ?? "terminal-parity").trim().toLowerCase();
  if (!EXECUTION_PROFILES.has(name)) {
    throw new Error(`Unknown execution profile ${value}. Use safe or terminal-parity.`);
  }
  return name;
}

/**
 * Validate every caller-owned execution option without creating temporary
 * sandbox state. Public Agent activation and durable job preparation share
 * this pure seam so invalid options cannot become an asynchronous worker
 * failure after state has already been persisted.
 */
export function validateExecutionProfileOptions(options = {}) {
  const name = normalizeProfileName(options.profile);
  const requestedDangerousBypass = Boolean(options.dangerouslySkipPermissions);
  const requestedModel = String(options.model ?? "").trim();
  if (!requestedModel) {
    throw new Error(
      "Claude execution requires an explicit Haiku, Sonnet, Opus, or Fable model."
    );
  }
  const model = resolveModel(requestedModel);
  const delegationMode = normalizeDelegationMode(options.delegationMode);
  if (delegationMode === "claude_orchestrator" && model !== "claude-fable-5") {
    throw new Error("claude_orchestrator delegation requires exact model claude-fable-5.");
  }
  if (
    delegationMode === "leaf" &&
    Array.isArray(options.allowedTools) &&
    options.allowedTools.some(isNativeAgentTool)
  ) {
    throw new Error("Leaf delegation cannot allow the native Agent tool.");
  }

  if (requestedDangerousBypass && name !== "terminal-parity") {
    throw new Error(
      "--dangerously-skip-permissions requires --profile terminal-parity; safe must remain sandboxed."
    );
  }
  if (name === "terminal-parity" && options.permissionMode) {
    throw new Error(
      "--dangerously-skip-permissions cannot be combined with --permission-mode."
    );
  }

  const effort = name === "terminal-parity"
    ? resolveEffort(options.effort)
    : resolveEffort(resolveDefaultEffort(model, options.effort));
  const dangerouslySkipPermissions = name === "terminal-parity";
  return { name, model, effort, delegationMode, dangerouslySkipPermissions };
}

export function createExecutionProfile(options = {}) {
  const validated = validateExecutionProfileOptions(options);
  const { name, model, effort, delegationMode } = validated;
  const inheritedEnv = options.env ?? process.env;

  if (name === "terminal-parity") {
    const env = { ...inheritedEnv, IS_SANDBOX: "1" };
    const claudeOptions = {
      env,
      model,
      appendSystemPrompt: delegationPrompt(delegationMode, Boolean(options.write)),
    };
    if (delegationMode === "leaf") claudeOptions.disallowedTools = ["Agent"];
    claudeOptions.dangerouslySkipPermissions = true;
    if (effort) claudeOptions.effort = effort;
    if (Array.isArray(options.allowedTools) && options.allowedTools.length > 0) {
      claudeOptions.allowedTools = options.allowedTools;
    }
    return {
      name,
      claudeOptions,
      receipt: {
        name,
        inheritedClaudeConfiguration: true,
        addedOverrides: Object.keys(claudeOptions).filter((key) => key !== "env"),
      },
      cleanup() {},
    };
  }

  const env = inheritedEnv;
  const sandboxMode = options.write ? "workspace-write" : "read-only";
  const settingsFile = createSandboxSettings(sandboxMode);
  const runningAsRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const claudeOptions = {
    env,
    model,
    effort,
    appendSystemPrompt: delegationPrompt(delegationMode, Boolean(options.write)),
    settingsFile,
    permissionMode: options.permissionMode ?? (options.write
      ? runningAsRoot ? undefined : "bypassPermissions"
      : "dontAsk"),
  };
  if (delegationMode === "leaf") claudeOptions.disallowedTools = ["Agent"];
  if (Array.isArray(options.allowedTools) && options.allowedTools.length > 0) {
    claudeOptions.allowedTools = options.allowedTools;
  } else if (!options.write) {
    claudeOptions.allowedTools = delegationMode === "leaf"
      ? SANDBOX_READ_ONLY_TOOLS.filter((tool) => !isNativeAgentTool(tool))
      : SANDBOX_READ_ONLY_TOOLS;
  }

  return {
    name,
    claudeOptions,
    receipt: {
      name,
      inheritedClaudeConfiguration: true,
      sandboxMode,
      addedOverrides: [
        "model",
        "effort",
        "appendSystemPrompt",
        ...(delegationMode === "leaf" ? ["disallowedTools"] : []),
        "settings",
        "permission",
        ...(options.write ? [] : ["allowedTools"]),
      ],
    },
    cleanup() {
      cleanupSandboxSettings(settingsFile);
    },
  };
}

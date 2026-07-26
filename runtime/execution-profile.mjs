/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * One semantic owner for every Claude CLI override. `terminal-parity` inherits
 * the user's normal Claude envelope except for the plugin-wide two-model
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

export function normalizeProfileName(value) {
  const name = String(value ?? "terminal-parity").trim().toLowerCase();
  if (!EXECUTION_PROFILES.has(name)) {
    throw new Error(`Unknown execution profile ${value}. Use safe or terminal-parity.`);
  }
  return name;
}

export function createExecutionProfile(options = {}) {
  const name = normalizeProfileName(options.profile);
  const inheritedEnv = options.env ?? process.env;
  const dangerouslySkipPermissions = Boolean(options.dangerouslySkipPermissions);
  const requestedModel = String(options.model ?? "").trim();
  if (!requestedModel) {
    throw new Error("Claude execution requires an explicit Sonnet or Opus model.");
  }
  const model = resolveModel(requestedModel);

  if (dangerouslySkipPermissions && name !== "terminal-parity") {
    throw new Error(
      "--dangerously-skip-permissions requires --profile terminal-parity; safe must remain sandboxed."
    );
  }
  if (name === "terminal-parity" && options.permissionMode) {
    throw new Error(
      "--dangerously-skip-permissions cannot be combined with --permission-mode."
    );
  }

  if (name === "terminal-parity") {
    const env = { ...inheritedEnv, IS_SANDBOX: "1" };
    const claudeOptions = {
      env,
      model,
      dangerouslySkipPermissions: true,
    };
    if (options.effort) claudeOptions.effort = resolveEffort(options.effort);
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
  const defaultEffort = resolveDefaultEffort(model, options.effort);
  const effort = defaultEffort ? resolveEffort(defaultEffort) : undefined;
  const sandboxMode = options.write ? "workspace-write" : "read-only";
  const settingsFile = createSandboxSettings(sandboxMode);
  const runningAsRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const claudeOptions = {
    env,
    model,
    effort,
    settingsFile,
    permissionMode: options.permissionMode ?? (options.write
      ? runningAsRoot ? undefined : "bypassPermissions"
      : "dontAsk"),
  };
  if (Array.isArray(options.allowedTools) && options.allowedTools.length > 0) {
    claudeOptions.allowedTools = options.allowedTools;
  } else if (!options.write) {
    claudeOptions.allowedTools = SANDBOX_READ_ONLY_TOOLS;
  }

  return {
    name,
    claudeOptions,
    receipt: {
      name,
      inheritedClaudeConfiguration: true,
      sandboxMode,
      addedOverrides: ["model", "effort", "settings", "permission", ...(options.write ? [] : ["allowedTools"])],
    },
    cleanup() {
      cleanupSandboxSettings(settingsFile);
    },
  };
}

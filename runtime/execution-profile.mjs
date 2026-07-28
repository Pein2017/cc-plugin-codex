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
  const write = Boolean(options.write);
  const requestedDangerousBypass = Boolean(options.dangerouslySkipPermissions);
  const requestedModel = String(options.model ?? "").trim();
  if (!requestedModel) {
    throw new Error(
      "Claude execution requires an explicit Haiku, Sonnet, Opus, or Fable model."
    );
  }
  const model = resolveModel(requestedModel);

  if (requestedDangerousBypass && name !== "terminal-parity") {
    throw new Error(
      "--dangerously-skip-permissions requires --profile terminal-parity; safe must remain sandboxed."
    );
  }
  if (requestedDangerousBypass && !write) {
    throw new Error(
      "--dangerously-skip-permissions requires explicit write access."
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
  const dangerouslySkipPermissions = name === "terminal-parity" && write;
  return { name, model, effort, dangerouslySkipPermissions };
}

export function createExecutionProfile(options = {}) {
  const validated = validateExecutionProfileOptions(options);
  const { name, model, effort } = validated;
  const inheritedEnv = options.env ?? process.env;

  if (name === "terminal-parity") {
    const env = { ...inheritedEnv, IS_SANDBOX: "1" };
    const claudeOptions = {
      env,
      model,
    };
    if (validated.dangerouslySkipPermissions) {
      claudeOptions.dangerouslySkipPermissions = true;
    }
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

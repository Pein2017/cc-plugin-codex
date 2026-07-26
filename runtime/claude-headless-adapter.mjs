/**
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Claude Code CLI wrapper — replaces Codex app-server + broker pattern.
 * Spawns `claude -p` subprocess per invocation.
 */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizePathSlashes, resolvePluginRuntimeRoot } from "./paths.mjs";
import {
  getProcessIdentity,
  isProcessAlive,
  terminateProcessTree,
  validateProcessIdentity,
} from "./process-control.mjs";

const CLAUDE_PACKAGE_EXE_PARTS = [
  "node_modules",
  "@anthropic-ai",
  "claude-code",
  "bin",
  "claude.exe",
];

/** @visibleForTesting */
export function resolveClaudeBin(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homedir = options.homedir ?? os.homedir();
  const existsSync = options.existsSync ?? fs.existsSync;
  const override = String(env.CC_CLAUDE_BIN ?? "").trim();

  if (override) {
    return override;
  }
  if (platform !== "win32") {
    return "claude";
  }

  const pathApi = path.win32;
  const searchRoots = [];
  const pathValue = env.PATH ?? env.Path ?? env.path ?? "";
  for (const entry of String(pathValue).split(pathApi.delimiter)) {
    const normalized = entry.trim().replace(/^"|"$/g, "");
    if (normalized) searchRoots.push(normalized);
  }
  if (env.npm_config_prefix) searchRoots.push(String(env.npm_config_prefix));
  if (env.APPDATA) searchRoots.push(pathApi.join(String(env.APPDATA), "npm"));
  searchRoots.push(pathApi.join(homedir, "AppData", "Roaming", "npm"));

  const seenRoots = new Set();
  for (const root of searchRoots) {
    const resolvedRoot = pathApi.resolve(root);
    const rootKey = resolvedRoot.toLowerCase();
    if (seenRoots.has(rootKey)) continue;
    seenRoots.add(rootKey);

    const candidates = [
      pathApi.join(resolvedRoot, "claude.exe"),
      pathApi.join(resolvedRoot, ...CLAUDE_PACKAGE_EXE_PARTS),
    ];
    for (const candidate of candidates) {
      try {
        if (existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // Continue to the next candidate, then fall back to normal PATH lookup.
      }
    }
  }
  return "claude";
}

/** Resolve the exact executable selected by PATH for receipts and spawning. */
export function resolveClaudeExecutable(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const command = resolveClaudeBin({ ...options, env, platform });
  if (path.isAbsolute(command)) return command;
  const pathApi = platform === "win32" ? path.win32 : path;
  const pathValue = env.PATH ?? env.Path ?? env.path ?? "";
  const extensions = platform === "win32"
    ? String(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const entry of String(pathValue).split(pathApi.delimiter)) {
    const directory = entry.trim().replace(/^"|"$/g, "");
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = pathApi.resolve(directory, `${command}${extension}`);
      try {
        fs.accessSync(candidate, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
        return candidate;
      } catch {}
    }
  }
  return command;
}

export const MAX_STREAM_PARSER_UNKNOWN_EVENTS = 50;
export const MAX_STREAM_PARSER_PARSE_ERRORS = 50;
export const MAX_STREAM_PARSER_TOOL_USES = 256;
export const MAX_STREAM_PARSER_TOUCHED_FILES = 256;
export const MAX_STREAM_PARSER_TERMINAL_EVENTS = 16;
export const MAX_STREAM_PARSER_HOOK_RECEIPTS = 64;
export const MAX_STDERR_BYTES = 64 * 1024;
export const SANDBOX_TEMP_DIR = normalizePathSlashes(path.resolve(os.tmpdir()));

function pushBoundedTail(list, value, maxEntries) {
  list.push(value);
  if (list.length > maxEntries) {
    list.splice(0, list.length - maxEntries);
  }
}

function pushUniqueBoundedTail(list, value, maxEntries) {
  if (!value || list.includes(value)) {
    return;
  }
  pushBoundedTail(list, value, maxEntries);
}

function sliceTextTailByBytes(text, maxBytes) {
  const normalized = typeof text === "string" ? text : String(text ?? "");
  if (!normalized || maxBytes <= 0) {
    return "";
  }
  if (Buffer.byteLength(normalized, "utf8") <= maxBytes) {
    return normalized;
  }

  let low = 0;
  let high = normalized.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (Buffer.byteLength(normalized.slice(mid), "utf8") > maxBytes) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  let start = low;
  let retained = normalized.slice(start);
  while (start < normalized.length && Buffer.byteLength(retained, "utf8") > maxBytes) {
    start += 1;
    retained = normalized.slice(start);
  }
  return retained;
}

function appendTextTail(existing, chunk, maxBytes) {
  const next = `${existing ?? ""}${chunk ?? ""}`;
  return sliceTextTailByBytes(next, maxBytes);
}

// ---------------------------------------------------------------------------
// Availability & Auth
// ---------------------------------------------------------------------------

export function getClaudeAvailability(cwd, options = {}) {
  const env = options.env ?? process.env;
  const claudeBin = options.claudeBin ?? resolveClaudeExecutable({ env });
  try {
    const result = spawnSync(claudeBin, ["--version"], {
      cwd,
      env,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (result.status !== 0) throw new Error("non-zero exit");
    return {
      available: true,
      detail: (result.stdout ?? "").trim(),
      executable: claudeBin,
    };
  } catch {
    return {
      available: false,
      detail: "claude CLI not found in PATH",
      executable: claudeBin,
    };
  }
}

export function getClaudeAuthStatus(cwd, options = {}) {
  const env = options.env ?? process.env;
  const claudeBin = options.claudeBin ?? resolveClaudeExecutable({ env });
  if (env.ANTHROPIC_API_KEY) {
    return { available: true, loggedIn: true, detail: "API key configured" };
  }
  try {
    const result = spawnSync(claudeBin, ["auth", "status"], {
      cwd,
      env,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (result.status !== 0) throw new Error("not authenticated");
    return { available: true, loggedIn: true, detail: "authenticated" };
  } catch {
    return {
      available: true,
      loggedIn: false,
      detail: "not authenticated — run `claude auth login`",
    };
  }
}

// ---------------------------------------------------------------------------
// Stream Parser — fail-safe with chunk-boundary buffering
// ---------------------------------------------------------------------------

export class StreamParser {
  constructor() {
    this.buffer = "";
    this.state = {
      sessionId: null,
      finalMessage: "",
      structuredOutput: null,
      receivedTerminalEvent: false,
      unknownEvents: [],
      parseErrors: [],
      unresolvedParseErrors: 0,
      toolUses: [],
      touchedFiles: [],
      terminalEvents: [],
      runtimeReceipt: null,
      hookReceipts: [],
      lastByteAt: null,
    };
  }

  /** Feed a raw stdout chunk. Returns parsed events. */
  feed(chunk) {
    if (chunk) this.state.lastByteAt = new Date().toISOString();
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop(); // keep incomplete trailing line
    return lines.map((l) => this._parseLine(l)).filter(Boolean);
  }

  /** Flush remaining buffer at stream end. */
  flush() {
    if (this.buffer.trim()) {
      const result = this._parseLine(this.buffer);
      this.buffer = "";
      return result ? [result] : [];
    }
    return [];
  }

  _parseLine(line) {
    if (!line.trim()) return null;
    try {
      const event = JSON.parse(line);
      // Extract session_id from any event
      if (event.session_id && !this.state.sessionId) {
        this.state.sessionId = event.session_id;
      }
      switch (event.type) {
        case "stream_event":
          return this._handleStreamEvent(event);
        case "system":
          return this._handleSystemEvent(event);
        case "result":
          this.state.receivedTerminalEvent = true;
          pushBoundedTail(
            this.state.terminalEvents,
            event,
            MAX_STREAM_PARSER_TERMINAL_EVENTS
          );
          if (event.result) {
            this.state.finalMessage = mergeTerminalResultText(
              this.state.finalMessage,
              event.result
            );
          }
          if (Object.prototype.hasOwnProperty.call(event, "structured_output")) {
            this.state.structuredOutput = event.structured_output ?? null;
          }
          if (event.session_id) this.state.sessionId = event.session_id;
          return { kind: "result", data: event };
        case "user": {
          const text = Array.isArray(event.message?.content)
            ? event.message.content
                .filter((part) => part?.type === "text" && typeof part.text === "string")
                .map((part) => part.text)
                .join("\n")
            : "";
          if (!text) return null;
          return {
            kind: "user_replay",
            text,
            message: "Steering message acknowledged",
            phase: "running",
            threadId: this.state.sessionId,
          };
        }
        default:
          pushBoundedTail(this.state.unknownEvents, {
            type: event.type,
            ts: Date.now(),
          }, MAX_STREAM_PARSER_UNKNOWN_EVENTS);
          return null;
      }
    } catch (err) {
      this.state.unresolvedParseErrors++;
      pushBoundedTail(this.state.parseErrors, {
        line: line.slice(0, 200),
        error: err.message,
      }, MAX_STREAM_PARSER_PARSE_ERRORS);
      return null;
    }
  }

  _handleStreamEvent(event) {
    const inner = event.event;
    const delta = inner?.delta;
    if (delta?.type === "text_delta" && delta.text) {
      this.state.finalMessage += delta.text;
      return {
        kind: "text",
        text: delta.text,
        message: delta.text,
        phase: "running",
        threadId: this.state.sessionId,
      };
    }

    if (inner?.type === "content_block_delta") {
      const blockDelta = inner.delta;
      if (blockDelta?.type === "text_delta" && blockDelta.text) {
        this.state.finalMessage += blockDelta.text;
        return {
          kind: "text",
          text: blockDelta.text,
          message: blockDelta.text,
          phase: "running",
          threadId: this.state.sessionId,
        };
      }
      if (blockDelta?.type === "thinking_delta" && blockDelta.thinking) {
        return {
          kind: "thinking",
          message: blockDelta.thinking,
          phase: "thinking",
          threadId: this.state.sessionId,
        };
      }
    }

    // Tool use events
    if (inner?.type === "content_block_start") {
      const cb = inner.content_block;
      if (cb?.type === "tool_use") {
        pushBoundedTail(
          this.state.toolUses,
          { tool: cb.name, input: cb.input },
          MAX_STREAM_PARSER_TOOL_USES
        );
        if (cb.name === "Write" || cb.name === "Edit") {
          pushUniqueBoundedTail(
            this.state.touchedFiles,
            cb.input?.file_path ?? cb.input?.path ?? null,
            MAX_STREAM_PARSER_TOUCHED_FILES
          );
        }
        return {
          kind: "tool_use",
          tool: cb.name,
          input: cb.input,
          message: `Using tool: ${cb.name}`,
          phase: "tool",
          threadId: this.state.sessionId,
        };
      }
    }
    return null;
  }

  _handleSystemEvent(event) {
    if (event.subtype === "init") {
      this.state.runtimeReceipt = {
        claudeCodeVersion: event.claude_code_version ?? null,
        model: event.model ?? null,
        permissionMode: event.permissionMode ?? event.permission_mode ?? null,
        mcpServers: Array.isArray(event.mcp_servers) ? event.mcp_servers : [],
        plugins: Array.isArray(event.plugins) ? event.plugins : [],
      };
      return {
        kind: "system",
        subtype: "init",
        data: event,
        message: "Claude Code session initialized",
        phase: "running",
        threadId: this.state.sessionId,
      };
    }
    if (event.subtype === "hook_response") {
      pushBoundedTail(
        this.state.hookReceipts,
        {
          hookName: event.hook_name ?? null,
          hookEvent: event.hook_event ?? null,
          outcome: event.outcome ?? null,
          exitCode: event.exit_code ?? null,
        },
        MAX_STREAM_PARSER_HOOK_RECEIPTS
      );
      return {
        kind: "system",
        subtype: "hook_response",
        data: event,
        message: `Hook completed: ${event.hook_name ?? event.hook_event ?? "unknown"}`,
        phase: "hook",
        threadId: this.state.sessionId,
      };
    }
    if (event.subtype === "api_retry") {
      return {
        kind: "system",
        subtype: "api_retry",
        data: event,
        message: "API retry in progress",
        phase: "retry",
        threadId: this.state.sessionId,
      };
    }
    return null;
  }
}

function mergeTerminalResultText(existingText, terminalText) {
  const existing = typeof existingText === "string" ? existingText : "";
  const terminal = typeof terminalText === "string" ? terminalText : "";

  if (!terminal) {
    // Structured-output and tool-only turns can finish with an empty text result.
    return existing;
  }
  if (!existing) {
    return terminal;
  }

  // We observed one real failure mode where the terminal payload only contained
  // a truncated tail of the streamed answer. Preserve the longer streamed copy
  // only for that strict suffix case; otherwise the terminal result is the
  // authoritative final answer according to the streaming contract.
  if (existing.endsWith(terminal) && existing.length > terminal.length) {
    return existing;
  }

  return terminal;
}

// ---------------------------------------------------------------------------
// Turn Completion Validation
// ---------------------------------------------------------------------------

export function validateTurnCompletion(state, exitCode) {
  if (exitCode !== 0) {
    return { status: "failed", exitCode };
  }
  if (state.unresolvedParseErrors > 0) {
    return {
      status: "unknown",
      warning: `${state.unresolvedParseErrors} unrecovered parse errors`,
    };
  }
  if (!state.receivedTerminalEvent) {
    return {
      status: "unknown",
      warning: "No terminal result event received despite exit code 0",
    };
  }
  const lastTerminal = Array.isArray(state.terminalEvents)
    ? state.terminalEvents.at(-1)
    : null;
  if (
    lastTerminal &&
    (lastTerminal.is_error === true ||
      (lastTerminal.subtype && lastTerminal.subtype !== "success"))
  ) {
    return {
      status: "failed",
      warning: `Claude terminal result reported ${lastTerminal.subtype ?? "an error"}`,
    };
  }
  if (state.unknownEvents.length > 0) {
    // Log but don't fail — protocol drift detection
  }
  return { status: "completed" };
}

export function classifyClaudeFailure(result = {}) {
  if (result.status === "completed") {
    return { kind: null, resumable: false, reason: null };
  }

  const terminalEvents = Array.isArray(result.terminalEvents)
    ? result.terminalEvents
    : [];
  const terminalFailureText = terminalEvents.flatMap((event) => {
    const values = [];
    if (typeof event?.error === "string") values.push(event.error);
    if (Array.isArray(event?.errors)) {
      for (const error of event.errors) {
        if (typeof error === "string") values.push(error);
        else if (typeof error?.message === "string") values.push(error.message);
      }
    }
    if (event?.is_error === true && typeof event?.result === "string") {
      values.push(event.result);
    }
    return values;
  });
  const text = [
    result.finalMessage,
    result.stderr,
    result.warning,
    ...terminalFailureText,
  ]
    .filter(Boolean)
    .join("\n");
  if (/\b(authentication|not authenticated|unauthorized|forbidden|invalid api key|oauth|permission denied)\b/i.test(text)) {
    return { kind: "auth_or_permission", resumable: false, reason: text };
  }
  if (/\b(context window|maximum context|prompt is too long|request (?:is )?invalid|invalid request|malformed request|unprocessable)\b/i.test(text)) {
    return { kind: "context_or_request_invalid", resumable: false, reason: text };
  }

  const callerBudgetLimit = /\b(?:maximum|max)\s+budget\b|error_max_budget_usd|--max-budget-usd/i.test(text);
  const accountCapacityScope = "(?:subscription|quota|credits?|weekly|monthly|allowance|billing[- ]period)";
  const exhaustionSignal = "(?:hit|reached|exceeded|exhausted|depleted|used[ -]up|no remaining|insufficient)";
  const explicitAccountLimit = !callerBudgetLimit && (
    new RegExp(`\\b${accountCapacityScope}\\b[^\\n]{0,100}\\b${exhaustionSignal}\\b`, "i").test(text) ||
    new RegExp(`\\b${exhaustionSignal}\\b[^\\n]{0,100}\\b${accountCapacityScope}\\b`, "i").test(text) ||
    /\busage\s+(?:limit|quota|allowance)\b[^\n]{0,60}\b(?:reached|exceeded|exhausted|depleted|used[ -]up)\b/i.test(text) ||
    /\b(?:reached|exceeded|exhausted|depleted|used[ -]up)\b[^\n]{0,60}\busage\s+(?:limit|quota|allowance)\b/i.test(text) ||
    /\b(?:insufficient|no|zero)\s+(?:remaining\s+)?credits?\b/i.test(text) ||
    /\byou(?:'ve| have)?\s+(?:hit|reached|exceeded)\s+(?:your\s+)?(?:limit|quota)\b/i.test(text)
  );
  if (explicitAccountLimit) {
    return {
      kind: "usage_or_subscription_limit",
      resumable: false,
      reason: text,
    };
  }

  const transportFailure = /connection closed mid-response|socket (?:closed|reset|hang up)|\bECONNRESET\b|\bEPIPE\b|stream(?:ing)? (?:idle )?timeout|timed out while streaming|\bHTTP\s*(?:408|429|5\d\d)\b/i.test(text);
  if (transportFailure && result.sessionId) {
    return {
      kind: "transport_closed_resumable",
      resumable: true,
      reason: text,
    };
  }

  const lastTerminal = terminalEvents.at(-1);
  if (
    (lastTerminal?.subtype === "error_during_execution" &&
      (result.exitCode === 0 || result.exitCode === 130 || result.exitCode === 143)) ||
    result.signal === "SIGINT" ||
    result.signal === "SIGTERM" ||
    result.exitCode === 130 ||
    result.exitCode === 143
  ) {
    return {
      kind: "cancelled_or_interrupted",
      resumable: false,
      reason: lastTerminal?.subtype ?? result.signal ?? `exit ${result.exitCode}`,
    };
  }

  if (transportFailure) {
    return { kind: "protocol_unknown", resumable: false, reason: text };
  }
  if (result.status === "unknown") {
    return { kind: "protocol_unknown", resumable: false, reason: text || null };
  }
  return { kind: "fatal", resumable: false, reason: text || null };
}

export function encodeStreamUserMessage(text) {
  return `${JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: String(text ?? "") }],
    },
  })}\n`;
}

function redactProxyEndpoint(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return raw.replace(/\/\/[^/@\s]+@/g, "//[redacted]@");
  }
}

function buildHostRuntimeReceipt(options, env, claudeBin) {
  return {
    claudeBin,
    claudeConfigDir: env.CLAUDE_CONFIG_DIR ?? null,
    requestedModel: options.model ?? null,
    requestedEffort: options.effort ?? null,
    permissionMode: options.permissionMode ?? null,
    dangerouslySkipPermissions: Boolean(options.dangerouslySkipPermissions),
    isSandbox: env.IS_SANDBOX === "1",
    allowedTools: Array.isArray(options.allowedTools) ? options.allowedTools : null,
    proxyEndpoints: {
      http: redactProxyEndpoint(env.HTTP_PROXY ?? env.http_proxy),
      https: redactProxyEndpoint(env.HTTPS_PROXY ?? env.https_proxy),
      all: redactProxyEndpoint(env.ALL_PROXY ?? env.all_proxy),
    },
  };
}

// ---------------------------------------------------------------------------
// Sandbox Tool Sets — approximate Codex sandbox modes via allowedTools.
// Codex enforces sandbox at OS level (seatbelt/landlock); Claude Code lacks
// OS-level sandboxing, so we restrict the tool whitelist instead.
// ---------------------------------------------------------------------------

export const SANDBOX_READ_ONLY_BASH_TOOLS = [
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git blame:*)",
  "Bash(git rev-parse:*)",
  "Bash(git branch:*)",
  "Bash(git ls-files:*)",
  "Bash(git merge-base:*)",
  "Bash(git describe:*)",
  "Bash(git shortlog:*)",
  "Bash(git cat-file:*)",
  "Bash(git tag --list:*)",
  "Bash(git stash list:*)",
  "Bash(git config --get:*)",
];

/** read-only: file reading + read-only git + web + read-only agents. No writes, MCP, or skills. */
export const SANDBOX_READ_ONLY_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  ...SANDBOX_READ_ONLY_BASH_TOOLS,
  "WebSearch",
  "WebFetch",
  "Agent(explore,plan)",
];

// ---------------------------------------------------------------------------
// Sandbox Settings — OS-level isolation via Claude Code's sandbox feature.
// Written to a temp file and passed via --settings.
// ---------------------------------------------------------------------------

/**
 * Sandbox presets matching Codex sandbox modes.
 *
 * read-only:       no file writes outside the OS temp dir. Network is allowed so
 *                  that `WebFetch`, `WebSearch`, and the Claude CLI's API path keep
 *                  working; the review allowlist excludes Bash entirely, so there
 *                  is no shell surface to exfiltrate or mutate state through.
 * workspace-write: Bash can write to cwd + OS temp dir only, no network from Bash.
 *                  All tools allowed (no allowedTools restriction).
 */
export const SANDBOX_SETTINGS = {
  "read-only": {
    sandbox: {
      enabled: true,
      // No Bash in the review allowlist, but keep this flag conservative so that
      // any sandbox-aware tool still has to opt in explicitly.
      autoAllowBashIfSandboxed: false,
      filesystem: {
        allowWrite: [SANDBOX_TEMP_DIR],
      },
    },
  },
  "workspace-write": {
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      filesystem: {
        allowWrite: [".", SANDBOX_TEMP_DIR],
      },
      network: {
        allowedDomains: [],
      },
    },
  },
};

/**
 * Write sandbox settings to a temp file. Returns the file path.
 * Caller is responsible for cleanup via cleanupSandboxSettings().
 */
export function createSandboxSettings(mode) {
  const settings = SANDBOX_SETTINGS[mode];
  if (!settings) return null;

  const sandboxDir = path.join(resolvePluginRuntimeRoot(), "sandbox");
  fs.mkdirSync(sandboxDir, { recursive: true, mode: 0o700 });
  const tmpFile = path.join(
    sandboxDir,
    `cc-sandbox-${process.pid}-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.json`
  );
  fs.writeFileSync(tmpFile, JSON.stringify(settings), {
    encoding: "utf8",
    mode: 0o600,
  });
  return tmpFile;
}

export function cleanupSandboxSettings(filePath) {
  if (filePath) {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Stale tmp sweepers — reclaim files left behind by SIGKILL/crashes.
// ---------------------------------------------------------------------------

function pruneStaleTempFiles(subdir, options = {}) {
  const prefix = options.prefix;
  const maxAgeMs = options.maxAgeMs ?? 6 * 60 * 60 * 1000;
  const dir = path.join(resolvePluginRuntimeRoot(), subdir);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (prefix && !entry.name.startsWith(prefix)) continue;
    const full = path.join(dir, entry.name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (now - stat.mtimeMs < maxAgeMs) continue;
    try {
      fs.unlinkSync(full);
    } catch {
      // Best effort: leave on disk rather than crash callers.
    }
  }
}

/**
 * Sweep sandbox-settings JSON files left behind by crashes. Call this at the
 * start of any flow that creates sandbox settings so they do not accumulate.
 */
export function pruneStaleSandboxSettings(options = {}) {
  pruneStaleTempFiles("sandbox", { prefix: "cc-sandbox-", ...options });
}

// ---------------------------------------------------------------------------
// Model & Effort Mapping
// ---------------------------------------------------------------------------

export const MODEL_ALIASES = new Map([
  ["opus", "claude-opus-5"],
  ["claude-opus-5", "claude-opus-5"],
  ["sonnet", "claude-sonnet-5"],
  ["claude-sonnet-5", "claude-sonnet-5"],
  ["haiku", "claude-haiku-4-5"],
  ["claude-haiku-4-5", "claude-haiku-4-5"],
]);

export const EFFORT_ALIASES = {
  none: "low",
  minimal: "low",
};

export const VALID_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export const DEFAULT_EFFORT_BY_MODEL = new Map([
  ["opus", "xhigh"],
  ["claude-opus-5", "xhigh"],
  ["sonnet", "high"],
  ["claude-sonnet-5", "high"],
  ["haiku", "low"],
  ["claude-haiku-4-5", "low"],
]);

export function resolveDefaultEffort(model, effort) {
  if (effort != null && String(effort).trim() !== "") {
    return effort;
  }
  const key = String(model ?? "").trim().toLowerCase();
  return DEFAULT_EFFORT_BY_MODEL.get(key);
}

export function resolveModel(model) {
  if (!model) return undefined;
  const normalized = String(model).trim().toLowerCase();
  const resolved = MODEL_ALIASES.get(normalized);
  if (resolved) return resolved;
  throw new Error(
    `Unsupported Claude model "${model}". Use sonnet/claude-sonnet-5, opus/claude-opus-5, or test-only haiku/claude-haiku-4-5.`
  );
}

export function resolveEffort(effort) {
  if (!effort) return undefined;
  const normalized = String(effort).trim().toLowerCase();
  if (!normalized) return undefined;
  const resolved = EFFORT_ALIASES[normalized] ?? normalized;
  if (VALID_EFFORTS.has(resolved)) {
    return resolved;
  }
  throw new Error(
    `Unsupported effort "${effort}". Use one of: ${[...VALID_EFFORTS].join(", ")}.`
  );
}

// ---------------------------------------------------------------------------
// Core Execution
// ---------------------------------------------------------------------------

/**
 * Build CLI argument array for `claude -p`.
 * The prompt is intentionally excluded and is written to stdin by runClaudeTurn
 * so Windows process creation never has to carry a repository-sized prompt.
 */
/** @visibleForTesting */
export function buildArgs(prompt, options = {}) {
  const args = ["-p"];
  // No --bare: it breaks OAuth auth. Isolation is achieved via --allowedTools.

  if (options.outputFormat === "stream-json") {
    args.push(
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages"
    );
  } else {
    args.push("--output-format", options.outputFormat ?? "json");
  }

  if (options.inputFormat === "stream-json") {
    args.push("--input-format", "stream-json");
    if (options.replayUserMessages !== false) {
      args.push("--replay-user-messages");
    }
  }
  if (options.includeHookEvents) {
    args.push("--include-hook-events");
  }

  if (options.noSessionPersistence) {
    args.push("--no-session-persistence");
  }
  if (options.sessionName && !options.sessionId && !options.resumeSessionId) {
    const sessionName = String(options.sessionName).trim();
    if (!sessionName || sessionName.includes("\0")) {
      throw new Error("Claude session name must be non-empty text without NUL bytes.");
    }
    args.push("--name", sessionName);
  }
  if (options.model) {
    args.push("--model", resolveModel(options.model));
  }
  if (options.effort) {
    args.push("--effort", resolveEffort(options.effort));
  }
  if (options.sessionId) {
    args.push("--session-id", options.sessionId);
  }
  if (options.resumeSessionId) {
    args.push("--resume", options.resumeSessionId);
  }
  if (options.allowedTools) {
    for (const tool of options.allowedTools) {
      args.push("--allowedTools", tool);
    }
  }
  if (options.maxTurns) {
    args.push("--max-turns", String(options.maxTurns));
  }
  if (options.jsonSchema) {
    args.push("--json-schema", JSON.stringify(options.jsonSchema));
  }
  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }
  if (options.permissionMode) {
    args.push("--permission-mode", options.permissionMode);
  }
  if (options.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  if (options.settingsFile) {
    args.push("--settings", options.settingsFile);
  }
  if (options.mcpConfigFile) {
    args.push("--mcp-config", options.mcpConfigFile);
  }
  if (options.strictMcpConfig) {
    args.push("--strict-mcp-config");
  }

  return args;
}

/**
 * Execute a Claude Code turn with streaming progress.
 * Returns { status, sessionId, finalMessage, toolUses, touchedFiles, stderr, pid, pidIdentity }
 */
export async function runClaudeTurn(cwd, prompt, options = {}) {
  const args = buildArgs(prompt, {
    outputFormat: "stream-json",
    ...options,
  });

  return new Promise((resolve) => {
    const childEnv = options.env ?? process.env;
    const claudeBin = options.claudeBin ?? resolveClaudeExecutable({ env: childEnv });
    const streamingInput = options.inputFormat === "stream-json";
    const proc = spawn(claudeBin, args, {
      cwd,
      env: childEnv,
      detached: true, // new process group for safe cancellation
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdinError = null;
    let stdinClosed = false;
    let inputPumpInFlight = null;
    let inputTimer = null;
    let settled = false;
    const sentInputs = [];
    const parser = new StreamParser();
    let stderr = "";

    proc.stdin.on("error", (error) => {
      // ChildProcess still emits its normal close/error event. Retain the pipe
      // failure so a child cannot be reported as successful without its prompt.
      stdinError = error;
    });

    const closeInput = () => {
      if (stdinClosed || proc.stdin.destroyed) return;
      stdinClosed = true;
      proc.stdin.end();
    };

    const writeStreamInput = (input) => new Promise((resolveWrite) => {
      if (stdinClosed || proc.stdin.destroyed || !proc.stdin.writable) {
        resolveWrite(false);
        return;
      }
      const text = String(input?.text ?? "");
      try {
        proc.stdin.write(encodeStreamUserMessage(text), "utf8", (error) => {
          if (error) {
            stdinError = error;
            resolveWrite(false);
            return;
          }
          const receipt = { ...input, text };
          sentInputs.push(receipt);
          options.onInputDispatched?.(receipt);
          resolveWrite(true);
        });
      } catch (error) {
        stdinError = error;
        resolveWrite(false);
      }
    });

    const pumpInput = async () => {
      if (!streamingInput || !options.pollInput || stdinClosed) return 0;
      if (inputPumpInFlight) return inputPumpInFlight;
      inputPumpInFlight = (async () => {
        const pending = await options.pollInput();
        let dispatched = 0;
        for (const input of Array.isArray(pending) ? pending : []) {
          if (await writeStreamInput(input)) dispatched += 1;
        }
        return dispatched;
      })();
      try {
        return await inputPumpInFlight;
      } finally {
        inputPumpInFlight = null;
      }
    };

    let pidIdentity = null;
    const getProcessIdentityImpl = options.getProcessIdentity ?? getProcessIdentity;
    try {
      pidIdentity = getProcessIdentityImpl(proc.pid);
    } catch {
      // A process identity is mandatory for the launch boundary. The child is
      // terminated below without sending any task input.
    }

    const hasValidReceipt = Number.isFinite(proc.pid) &&
      Boolean(String(pidIdentity ?? "").trim());

    const terminateUnacceptedChild = () => {
      let terminated = false;
      if (hasValidReceipt) {
        try {
          const terminate = options.terminateProcessTree ?? terminateProcessTree;
          terminated = terminate(proc.pid, pidIdentity)?.delivered === true;
        } catch {
          // The direct child handle below is safe while this adapter still
          // owns the newly-spawned process and provides a best-effort fallback.
        }
      }
      if (!terminated && !proc.killed) {
        try { proc.kill("SIGTERM"); } catch {}
      }
    };

    const rejectChildBeforeInput = (error) => {
      stdinError = error instanceof Error ? error : new Error(String(error));
      terminateUnacceptedChild();
      if (!proc.stdin.destroyed) {
        try { proc.stdin.destroy(); } catch {}
      }
    };

    const acceptChildBeforeInput = async () => {
      if (!hasValidReceipt) {
        rejectChildBeforeInput(
          new Error("Claude child launch requires a valid PID identity before prompt delivery.")
        );
        return false;
      }
      try {
        const accepted = options.onSpawn
          ? await options.onSpawn({ pid: proc.pid, pidIdentity })
          : true;
        if (accepted !== true) {
          rejectChildBeforeInput(new Error("Claude child launch was not durably accepted."));
          return false;
        }
        return true;
      } catch (error) {
        rejectChildBeforeInput(error);
        return false;
      }
    };

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk) => {
      stderr = appendTextTail(stderr, chunk, MAX_STDERR_BYTES);
      parser.state.lastByteAt = new Date().toISOString();
    });

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      const events = parser.feed(chunk);
      for (const evt of events) {
        if (evt.kind === "user_replay") {
          const inputIndex = sentInputs.findIndex((input) => input.text === evt.text);
          if (inputIndex >= 0) {
            const [acknowledged] = sentInputs.splice(inputIndex, 1);
            options.onInputAcknowledged?.(acknowledged);
          }
        }
        if (options.onProgress) {
          options.onProgress(evt);
        }
        if (streamingInput && evt.kind === "result") {
          void (async () => {
            try {
              const pumpedInputs = await pumpInput();
              const shouldClose = options.onTerminal
                ? await options.onTerminal({
                    event: evt.data,
                    state: parser.state,
                    pumpedInputs,
                  })
                : true;
              if (shouldClose !== false) closeInput();
            } catch (error) {
              stdinError = error;
              closeInput();
            }
          })();
        }
      }
    });

    proc.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (inputTimer) clearInterval(inputTimer);
      // Flush remaining buffer
      const remaining = parser.flush();
      for (const evt of remaining) {
        if (options.onProgress) options.onProgress(evt);
      }

      if (stdinError) {
        stderr = appendTextTail(
          stderr,
          `\nFailed to write Claude prompt to stdin: ${stdinError.message}`,
          MAX_STDERR_BYTES
        );
      }
      const validation = stdinError
        ? { status: "failed", warning: "Claude prompt delivery through stdin failed." }
        : validateTurnCompletion(parser.state, code ?? 1);
      const baseResult = {
        status: validation.status,
        warning: validation.warning,
        exitCode: code,
        signal,
        sessionId: parser.state.sessionId,
        finalMessage: parser.state.finalMessage,
        structuredOutput: parser.state.structuredOutput,
        toolUses: parser.state.toolUses,
        touchedFiles: parser.state.touchedFiles,
        terminalEvents: parser.state.terminalEvents,
        runtimeReceipt: {
          ...buildHostRuntimeReceipt(options, childEnv, claudeBin),
          ...(parser.state.runtimeReceipt ?? {}),
          hookReceipts: parser.state.hookReceipts,
        },
        lastByteAt: parser.state.lastByteAt,
        stderr,
        pid: proc.pid,
        pidIdentity,
      };
      const failure = classifyClaudeFailure(baseResult);
      resolve({
        ...baseResult,
        failureClass: failure.kind,
        failureReason: failure.reason,
        resumable: failure.resumable,
      });
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (inputTimer) clearInterval(inputTimer);
      resolve({
        status: "failed",
        exitCode: -1,
        sessionId: null,
        finalMessage: "",
        structuredOutput: null,
        toolUses: [],
        touchedFiles: [],
        terminalEvents: [],
        runtimeReceipt: buildHostRuntimeReceipt(options, childEnv, claudeBin),
        lastByteAt: null,
        stderr: err.message,
        pid: proc.pid,
        pidIdentity,
        failureClass: "fatal",
        failureReason: err.message,
        resumable: false,
      });
    });

    // Keeping prompts out of argv avoids Windows' command-line length limit.
    // More importantly, no stdin write or input-pump timer may begin before
    // the runner durably accepts this exact child receipt.
    void (async () => {
      if (!await acceptChildBeforeInput() || settled) return;
      try {
        if (streamingInput) {
          proc.stdin.write(encodeStreamUserMessage(prompt), "utf8");
        } else {
          stdinClosed = true;
          proc.stdin.end(String(prompt ?? ""), "utf8");
        }
      } catch (error) {
        stdinError = error;
        proc.stdin.destroy();
        return;
      }

      if (streamingInput && options.pollInput) {
        const pollIntervalMs = Math.max(25, Number(options.inputPollIntervalMs) || 200);
        inputTimer = setInterval(() => {
          void pumpInput().catch((error) => {
            stdinError = error;
            closeInput();
          });
        }, pollIntervalMs);
      }
    })();

    // Unref only for background workers — foreground callers need the process to keep Node alive
    if (options.background) {
      proc.unref();
    }
  });
}

// ---------------------------------------------------------------------------
// Cancellation — process-group based, identity-verified
// ---------------------------------------------------------------------------

/**
 * Interrupt a running Claude Code process without escalating to SIGKILL.
 * Claude persists the current session before exiting, so callers can resume
 * the exact session and retain partial output.
 */
export async function interruptClaudeProcess(pid, pidIdentity, options = {}) {
  const platform = options.platform ?? process.platform;
  if (!pidIdentity) {
    return {
      interrupted: false,
      note: "Refusing to signal a process without a deterministic identity.",
      controlFailure: "missing_identity",
    };
  }
  if (!validateProcessIdentity(pid, pidIdentity, options)) {
    return {
      interrupted: false,
      note: "Refusing to signal a process whose identity no longer matches.",
      controlFailure: "identity_mismatch",
    };
  }

  if (platform === "win32") {
    return {
      interrupted: false,
      note: "Graceful SIGINT is unavailable for a detached native Windows process; internal bounded process-tree cleanup is required.",
    };
  }

  try {
    process.kill(-pid, "SIGINT");
  } catch {
    return { interrupted: true, note: "Process not found" };
  }

  const dead = await waitForProcessGroup(pid, 5000);
  if (dead) return { interrupted: true };
  return {
    interrupted: false,
    note: `Process group ${pid} did not exit after SIGINT; it was not force-killed`,
  };
}

/**
 * Cancel a running Claude Code process.
 * Uses process group kill with PID identity verification.
 */
export async function cancelClaudeProcess(pid, pidIdentity, options = {}) {
  const platform = options.platform ?? process.platform;
  if (!pidIdentity) {
    return {
      cancelled: false,
      note: "Refusing to terminate a process without a deterministic identity.",
      controlFailure: "missing_identity",
    };
  }
  if (!validateProcessIdentity(pid, pidIdentity, options)) {
    return {
      cancelled: false,
      note: "Refusing to terminate a process whose identity no longer matches.",
      controlFailure: "identity_mismatch",
    };
  }

  if (platform === "win32") {
    const receipt = terminateProcessTree(pid, pidIdentity, options);
    if (!receipt.delivered) {
      return {
        cancelled: false,
        note: `Process-tree termination was not delivered (${receipt.reason ?? "not_found"}).`,
        controlFailure: receipt.reason ?? "not_delivered",
      };
    }
    const dead = await waitForProcessExit(pid, 5000, options);
    return dead
      ? { cancelled: true }
      : { cancelled: false, note: `Process tree ${pid} still alive after taskkill` };
  }

  // SIGTERM to entire process group
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return { cancelled: true, note: "Process not found" };
  }

  // Wait for process group to die
  const dead = await waitForProcessGroup(pid, 5000);
  if (dead) {
    return { cancelled: true };
  }

  // Escalate to SIGKILL
  if (!validateProcessIdentity(pid, pidIdentity, options)) {
    return {
      cancelled: false,
      note: "Process identity was lost during SIGTERM wait; refusing SIGKILL.",
      controlFailure: "identity_mismatch",
    };
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {}

  const killedDead = await waitForProcessGroup(pid, 3000);
  if (killedDead) {
    return { cancelled: true };
  }

  return {
    cancelled: false,
    note: `Process group ${pid} still alive after SIGKILL`,
  };
}

function isProcessGroupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs, options = {}) {
  const alive = options.isProcessAliveImpl ?? isProcessAlive;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!alive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !alive(pid);
}

async function waitForProcessGroup(pgid, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessGroupAlive(pgid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isProcessGroupAlive(pgid);
}

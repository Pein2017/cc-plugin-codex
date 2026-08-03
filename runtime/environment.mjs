/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic environment layering without shell evaluation.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ENV_FILE = path.join(PLUGIN_ROOT, "config", "runtime.env");
const DEFAULT_CLAUDE_CONFIG_DIR = "/data/CoordExp/.claude";
const SUPPORTED_KEYS = new Set([
  "CLAUDE_NATIVE_CONFIG_DIR",
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
  "CONDA_EXE",
  "PATH",
  "http_proxy", "https_proxy", "all_proxy",
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
  "no_proxy", "NO_PROXY",
  "CC_CLAUDE_BIN",
  "CC_RUNTIME_CHECKOUT",
  "CC_CLAUDE_RECONNECT_ATTEMPTS",
  "CC_CLAUDE_RECONNECT_BASE_DELAY_MS",
]);

function parseEnvFile(filePath) {
  const values = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid env syntax at ${filePath}:${index + 1}.`);
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function existing(filePath) {
  return filePath && fs.existsSync(filePath) ? path.resolve(filePath) : null;
}

function findAncestorEnvFile(startPath) {
  let current = path.resolve(startPath);
  while (true) {
    const candidate = existing(path.join(current, ".codex", ".env"));
    if (candidate) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function redactProxy(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return raw.replace(/\/\/[^/@\s]+@/g, "//[redacted]@");
  }
}

function nonEmpty(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function resolveRuntimeEnvironment(options = {}) {
  const inherited = { ...(options.env ?? process.env) };
  const codexHome = inherited.CODEX_HOME
    ? path.resolve(inherited.CODEX_HOME)
    : path.join(os.homedir(), ".codex");
  const projectEnv = codexHome ? existing(path.join(codexHome, ".env")) : null;
  const workspaceEnv = findAncestorEnvFile(options.cwd ?? process.cwd());
  const defaultEnv = existing(DEFAULT_ENV_FILE);
  const explicitPath = options.envFile ?? inherited.CC_RUNTIME_ENV_FILE ?? null;
  const explicitEnv = explicitPath ? existing(path.resolve(options.cwd ?? process.cwd(), explicitPath)) : null;
  if (explicitPath && !explicitEnv) throw new Error(`Runtime env file not found: ${explicitPath}`);

  const selectedEnv = explicitEnv ?? projectEnv ?? workspaceEnv ?? defaultEnv;
  const sources = selectedEnv ? [selectedEnv] : [];
  const env = {
    ...inherited,
    ...(selectedEnv ? parseEnvFile(selectedEnv) : {}),
  };
  const effectiveClaudeConfigDir = nonEmpty(env.CLAUDE_NATIVE_CONFIG_DIR)
    ?? nonEmpty(env.CLAUDE_CONFIG_DIR)
    ?? DEFAULT_CLAUDE_CONFIG_DIR;
  env.CLAUDE_CONFIG_DIR = path.resolve(effectiveClaudeConfigDir);
  if (selectedEnv) env.CC_RUNTIME_ENV_FILE = selectedEnv;

  return {
    env,
    receipt: {
      sources,
      runtimeCheckout: env.CC_RUNTIME_CHECKOUT ?? null,
      claudeConfigDir: env.CLAUDE_CONFIG_DIR ?? null,
      proxyEndpoints: {
        http: redactProxy(env.HTTP_PROXY ?? env.http_proxy),
        https: redactProxy(env.HTTPS_PROXY ?? env.https_proxy),
        all: redactProxy(env.ALL_PROXY ?? env.all_proxy),
      },
      noProxy: env.NO_PROXY ?? env.no_proxy ?? null,
    },
  };
}

export { DEFAULT_CLAUDE_CONFIG_DIR, DEFAULT_ENV_FILE, SUPPORTED_KEYS };

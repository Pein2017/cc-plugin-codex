/** SPDX-License-Identifier: Apache-2.0 */

const RESTART_EXACT = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "package.json",
  "package-lock.json",
  "runtime/mcp-api.mjs",
  "runtime/mcp-call-worker.mjs",
  "runtime/mcp-server.mjs",
  "runtime/promotion-gate.mjs",
  "runtime/version.mjs",
]);

const RESTART_PREFIXES = Object.freeze([
  ".agents/",
  ".codex/",
  "config/",
  "plugins/",
]);

export function pathRequiresCodexRestart(filePath) {
  const normalized = String(filePath ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
  return RESTART_EXACT.has(normalized)
    || RESTART_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function classifyPromotionPaths(filePaths) {
  const paths = [...new Set(filePaths.map((value) => String(value).trim()).filter(Boolean))].sort();
  const decisivePaths = paths.filter(pathRequiresCodexRestart);
  return {
    activation: decisivePaths.length > 0 ? "restart_required" : "hot_compatible",
    changedPathCount: paths.length,
    decisivePaths: decisivePaths.slice(0, 50),
  };
}

/** SPDX-License-Identifier: Apache-2.0 */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_MS = 25;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch {}
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return null;
  }
}

function markerOwner(markerPath) {
  try {
    const value = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    return Number.isInteger(value?.pid) ? value.pid : null;
  } catch {
    return null;
  }
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function promotionGatePaths(gateDirectory) {
  const root = path.resolve(gateDirectory);
  return {
    root,
    lock: path.join(root, "promotion.lock"),
    loaders: path.join(root, "loaders"),
  };
}

export function resolveGitCommonDirectory(sourceRoot) {
  const dotGit = path.join(path.resolve(sourceRoot), ".git");
  const stat = fs.statSync(dotGit);
  if (stat.isDirectory()) return fs.realpathSync.native(dotGit);
  if (!stat.isFile()) throw new Error(`Unsupported Git metadata at ${dotGit}.`);
  const match = /^gitdir:\s*(.+)\s*$/i.exec(fs.readFileSync(dotGit, "utf8"));
  if (!match) throw new Error(`Invalid Git worktree metadata at ${dotGit}.`);
  const worktreeGitDirectory = fs.realpathSync.native(path.resolve(path.dirname(dotGit), match[1]));
  const commonFile = path.join(worktreeGitDirectory, "commondir");
  if (!fs.existsSync(commonFile)) return worktreeGitDirectory;
  const relativeCommon = fs.readFileSync(commonFile, "utf8").trim();
  if (!relativeCommon) throw new Error(`Invalid Git common-directory metadata at ${commonFile}.`);
  return fs.realpathSync.native(path.resolve(worktreeGitDirectory, relativeCommon));
}

export function removeRuntimeLoaderMarker(markerPath) {
  if (!markerPath) return false;
  return safeUnlink(path.resolve(markerPath));
}

export async function withRuntimeLoadGate(options) {
  const {
    gateDirectory,
    markerPath,
    load,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollMs = DEFAULT_POLL_MS,
  } = options;
  if (typeof load !== "function") throw new TypeError("Runtime load gate requires load().");
  const paths = promotionGatePaths(gateDirectory);
  const canonicalMarker = path.resolve(markerPath);
  if (path.dirname(canonicalMarker) !== paths.loaders) {
    throw new Error("Runtime loader marker must be inside the promotion gate loaders directory.");
  }
  ensurePrivateDirectory(paths.loaders);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    while (fs.existsSync(paths.lock)) {
      if (Date.now() >= deadline) {
        throw Object.assign(new Error("Timed out waiting for local runtime promotion to finish."), {
          code: "HARNESSDOCK_PROMOTION_GATE_TIMEOUT",
        });
      }
      await delay(pollMs);
    }

    try {
      fs.writeFileSync(
        canonicalMarker,
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      safeUnlink(canonicalMarker);
      continue;
    }

    if (fs.existsSync(paths.lock)) {
      safeUnlink(canonicalMarker);
      continue;
    }

    try {
      return await load();
    } finally {
      safeUnlink(canonicalMarker);
    }
  }
}

function removeProvablyStaleLoaders(paths) {
  if (!fs.existsSync(paths.loaders)) return [];
  const remaining = [];
  for (const entry of fs.readdirSync(paths.loaders, { withFileTypes: true })) {
    if (!entry.isFile()) {
      remaining.push(entry.name);
      continue;
    }
    const markerPath = path.join(paths.loaders, entry.name);
    const owner = markerOwner(markerPath);
    if (processExists(owner) === false) {
      safeUnlink(markerPath);
      continue;
    }
    remaining.push(entry.name);
  }
  return remaining;
}

function clearProvablyStalePromotionLock(lockPath) {
  if (!fs.existsSync(lockPath)) return;
  const owner = markerOwner(lockPath);
  if (processExists(owner) === false) safeUnlink(lockPath);
}

export async function acquirePromotionGate(options) {
  const {
    gateDirectory,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollMs = DEFAULT_POLL_MS,
  } = options;
  const paths = promotionGatePaths(gateDirectory);
  ensurePrivateDirectory(paths.loaders);
  clearProvablyStalePromotionLock(paths.lock);
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(
      paths.lock,
      `${JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })}\n`,
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw Object.assign(new Error("Another local runtime promotion already owns the promotion gate."), {
        code: "HARNESSDOCK_PROMOTION_IN_PROGRESS",
      });
    }
    throw error;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(fs.readFileSync(paths.lock, "utf8"));
      if (current?.token === token) safeUnlink(paths.lock);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };

  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remaining = removeProvablyStaleLoaders(paths);
      if (remaining.length === 0) return { release, paths };
      if (Date.now() >= deadline) {
        throw Object.assign(
          new Error(`Timed out waiting for ${remaining.length} live or unproven runtime loader(s).`),
          { code: "HARNESSDOCK_PROMOTION_LOADERS_ACTIVE" },
        );
      }
      await delay(pollMs);
    }
  } catch (error) {
    release();
    throw error;
  }
}

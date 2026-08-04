/**
 * Ephemeral filesystem hints for durable waiters.
 *
 * This module deliberately knows nothing about jobs or completion inboxes.
 * Callers remain responsible for reading and validating durable facts after
 * every wake; fs.watch is only a hint and never a lifecycle source.
 */
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_RECOVERY_INTERVAL_MS = 10_000;
export const DEFAULT_FALLBACK_INTERVAL_MS = 5_000;

function abortError() {
  const error = new Error("CC Agent wait observation was cancelled by the caller.");
  error.name = "AbortError";
  return error;
}

function isWithinRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

/**
 * Return one existing directory for each desired path. Missing paths are
 * represented by their nearest existing ancestor, but never above root.
 */
export function resolveExistingWatchDirectories(desiredPaths, stateRoot, deps = {}) {
  const stat = deps.statSync ?? fs.statSync;
  const root = path.resolve(stateRoot);
  const result = new Set();
  for (const value of desiredPaths ?? []) {
    if (typeof value !== "string" || !value.trim()) continue;
    let candidate = path.resolve(value);
    if (!isWithinRoot(candidate, root)) continue;
    while (isWithinRoot(candidate, root)) {
      try {
        if (stat(candidate).isDirectory()) {
          result.add(candidate);
          break;
        }
      } catch {}
      if (candidate === root) break;
      candidate = path.dirname(candidate);
    }
  }
  return [...result];
}

/**
 * Wait for one ephemeral activity hint, a bounded recovery boundary, a
 * deadline, or abort. Every watcher and timer is closed before settlement.
 */
export function waitForDurableActivity(options = {}) {
  const signal = options.signal ?? null;
  const deadline = Number(options.deadline);
  const now = options.now ?? (() => Date.now());
  const watch = options.watch ?? fs.watch;
  const setTimer = options.setTimeout ?? setTimeout;
  const clearTimer = options.clearTimeout ?? clearTimeout;
  const recoveryIntervalMs = Math.max(
    0,
    Number(options.recoveryIntervalMs ?? DEFAULT_RECOVERY_INTERVAL_MS),
  );
  const fallbackIntervalMs = Math.max(
    0,
    Number(options.fallbackIntervalMs ?? DEFAULT_FALLBACK_INTERVAL_MS),
  );
  const directories = resolveExistingWatchDirectories(
    options.desiredPaths,
    options.stateRoot,
    { statSync: options.statSync },
  );
  const diagnostics = {
    watcherCount: 0,
    watcherErrors: 0,
    wakeReason: null,
    recoveryIntervalMs: null,
    watchedDirectories: directories,
  };

  return new Promise((resolve, reject) => {
    const watchers = [];
    let timer = null;
    let settled = false;
    let usableWatchers = 0;
    const cleanup = () => {
      if (timer != null) {
        clearTimer(timer);
        timer = null;
      }
      while (watchers.length) {
        try { watchers.pop()?.close?.(); } catch {}
      }
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const finish = (reason) => {
      if (settled) return;
      settled = true;
      diagnostics.wakeReason = reason;
      cleanup();
      resolve(diagnostics);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    for (const directory of directories) {
      let watcher = null;
      try {
        watcher = watch(directory, { persistent: false }, () => finish("watcher"));
        // A deterministic adapter (or an unusual filesystem shim) may invoke
        // the callback during registration, before the handle can be tracked.
        if (settled) {
          try { watcher?.close?.(); } catch {}
          continue;
        }
        watchers.push(watcher);
        usableWatchers += 1;
        diagnostics.watcherCount += 1;
        watcher?.once?.("error", () => {
          diagnostics.watcherErrors += 1;
          usableWatchers = Math.max(0, usableWatchers - 1);
          // Keep a usable sibling on its 10s recovery bound. If all watchers
          // fail, replace that bound with the 5s fallback rather than
          // immediately re-registering in a hot loop.
          if (usableWatchers === 0 && timer != null) {
            clearTimer(timer);
            timer = setTimer(() => finish("fallback"), Math.min(
              fallbackIntervalMs,
              Math.max(0, deadline - now()),
            ));
            if (settled) {
              clearTimer(timer);
              timer = null;
            }
            diagnostics.recoveryIntervalMs = fallbackIntervalMs;
          }
        });
      } catch {
        if (watcher) {
          try { watcher.close?.(); } catch {}
          const index = watchers.indexOf(watcher);
          if (index >= 0) watchers.splice(index, 1);
          usableWatchers = Math.max(0, usableWatchers - 1);
        }
        diagnostics.watcherErrors += 1;
      }
    }
    if (settled) return;
    if (typeof options.afterRegister === "function") {
      try {
        if (options.afterRegister() === true) {
          finish("post-registration");
          return;
        }
      } catch (error) {
        settled = true;
        cleanup();
        reject(error);
        return;
      }
    }
    if (settled) return;
    const remaining = Math.max(0, deadline - now());
    if (remaining === 0) {
      finish("deadline");
      return;
    }
    const interval = Math.min(
      usableWatchers > 0 ? recoveryIntervalMs : fallbackIntervalMs,
      remaining,
    );
    diagnostics.recoveryIntervalMs = usableWatchers > 0
      ? recoveryIntervalMs
      : fallbackIntervalMs;
    timer = setTimer(() => finish(usableWatchers > 0 ? "recovery" : "fallback"), interval);
    if (settled) {
      clearTimer(timer);
      timer = null;
    }
  });
}

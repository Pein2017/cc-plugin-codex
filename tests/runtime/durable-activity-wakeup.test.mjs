import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createInternalAgentRuntime } from "../../runtime/internal-runtime.mjs";
import { appendCompletionEvent } from "../../runtime/completion-inbox.mjs";
import {
  resolveExistingWatchDirectories,
  waitForDurableActivity,
} from "../../runtime/durable-activity-wakeup.mjs";

const roots = [];
const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-wakeup-runtime-home-"));
const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-wakeup-codex-home-"));
after(() => fs.rmSync(runtimeHome, { recursive: true, force: true }));
after(() => fs.rmSync(codexHome, { recursive: true, force: true }));
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-wakeup-"));
  roots.push(root);
  const stateRoot = path.join(root, "state");
  fs.mkdirSync(stateRoot, { recursive: true });
  return { root, stateRoot };
}

function runtimeFixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cc-wakeup-runtime-${label}-`));
  roots.push(root);
  const workspace = path.join(root, "workspace");
  const claudeConfig = path.join(root, "claude");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfig);
  const ownerRootId = `wakeup-${label}`;
  const runtime = createInternalAgentRuntime({
    cwd: workspace,
    env: {
      CODEX_HOME: codexHome,
      CODEX_HARNESSDOCK_RUNTIME_HOME: runtimeHome,
      CODEX_THREAD_ID: ownerRootId,
      CLAUDE_CONFIG_DIR: claudeConfig,
      CODEX_HARNESSDOCK_RUNTIME_CHECKOUT: "",
      CODEX_HARNESSDOCK_RUNTIME_SOURCE_ROOT: "",
    },
  });
  return { runtime, workspace, ownerRootId };
}

function fakeWatchers() {
  const active = new Set();
  const watch = () => {
    const watcher = new EventEmitter();
    watcher.closed = false;
    watcher.close = () => {
      watcher.closed = true;
      active.delete(watcher);
    };
    active.add(watcher);
    return watcher;
  };
  return { active, watch };
}

describe("durable activity wakeup", () => {
  it("resolves missing paths to the nearest owned ancestor without creating paths", () => {
    const { stateRoot } = fixture();
    const desired = path.join(stateRoot, "workspace", "inbox", "owner");
    assert.deepEqual(resolveExistingWatchDirectories([desired], stateRoot), [stateRoot]);
    assert.equal(fs.existsSync(desired), false);
    assert.deepEqual(resolveExistingWatchDirectories([path.join(stateRoot, "..", "foreign")], stateRoot), []);
  });

  it("closes watcher and timer resources on abort", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    const { active, watch } = fakeWatchers();
    const controller = new AbortController();
    let cleared = 0;
    const pending = waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 10_000,
      watch,
      setTimeout: () => 99,
      clearTimeout: () => { cleared += 1; },
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(active.size, 0);
    assert.equal(cleared, 1);
  });

  it("closes a watcher whose adapter reports an event during registration", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    let closed = 0;
    const result = await waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 100,
      watch: (_path, _options, callback) => {
        const watcher = new EventEmitter();
        watcher.close = () => { closed += 1; };
        callback("rename", "job.json");
        return watcher;
      },
      setTimeout: () => 1,
      clearTimeout: () => {},
    });
    assert.equal(result.wakeReason, "watcher");
    assert.equal(closed, 1);
  });

  it("closes registration handles when the mandatory second observation wins the race", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    const { active, watch } = fakeWatchers();
    const result = await waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 1_000,
      watch,
      afterRegister: () => true,
    });
    assert.equal(result.wakeReason, "post-registration");
    assert.equal(active.size, 0);
  });

  it("uses fallback when every watcher setup fails and clamps to the deadline", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    const delays = [];
    const result = await waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 100,
      watch: () => { throw new Error("unsupported"); },
      setTimeout: (callback, delay) => {
        delays.push(delay);
        callback();
        return 1;
      },
      clearTimeout: () => {},
      fallbackIntervalMs: 5_000,
    });
    assert.equal(result.wakeReason, "fallback");
    assert.equal(result.watcherCount, 0);
    assert.equal(result.watcherErrors, 1);
    assert.ok(delays[0] <= 100);
  });

  it("closes a watcher when error-handler registration fails", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    let closed = 0;
    const result = await waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 100,
      watch: () => ({
        once() { throw new Error("broken adapter"); },
        close() { closed += 1; },
      }),
      setTimeout: (callback) => { callback(); return 1; },
      clearTimeout: () => {},
      fallbackIntervalMs: 0,
    });
    assert.equal(result.wakeReason, "fallback");
    assert.equal(closed, 1);
  });

  it("uses one bounded recovery wake and clamps it to the deadline", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    const delays = [];
    const result = await waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 100,
      watch: fakeWatchers().watch,
      recoveryIntervalMs: 10_000,
      setTimeout: (callback, delay) => {
        delays.push(delay);
        callback();
        return 1;
      },
      clearTimeout: () => {},
    });
    assert.equal(result.wakeReason, "recovery");
    assert.ok(delays[0] <= 100);
  });

  it("switches an all-watcher error to one bounded fallback without a hot retry", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    const watcher = new EventEmitter();
    watcher.close = () => {};
    const timers = [];
    const resultPromise = waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 1_000,
      watch: () => watcher,
      setTimeout: (callback, delay) => {
        const timer = { callback, delay, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout: (timer) => { if (timer) timer.cleared = true; },
      fallbackIntervalMs: 5,
    });
    watcher.emit("error", new Error("dropped watcher"));
    assert.equal(timers.filter((timer) => !timer.cleared).length, 1);
    const fallback = timers.find((timer) => !timer.cleared);
    assert.equal(fallback.delay, 5);
    fallback.callback();
    const result = await resultPromise;
    assert.equal(result.wakeReason, "fallback");
  });

  it("settles once when a watcher coalesces multiple callbacks", async () => {
    const { stateRoot } = fixture();
    const directory = path.join(stateRoot, "jobs");
    fs.mkdirSync(directory);
    let callback;
    let closed = 0;
    const resultPromise = waitForDurableActivity({
      desiredPaths: [directory],
      stateRoot,
      deadline: Date.now() + 1_000,
      watch: (_path, _options, onEvent) => {
        callback = onEvent;
        return { once() {}, close() { closed += 1; } };
      },
    });
    callback();
    callback();
    const result = await resultPromise;
    assert.equal(result.wakeReason, "watcher");
    assert.equal(closed, 1);
  });

  it("keeps a quiet InternalAgentRuntime wait to bounded observations", async () => {
    const { runtime } = runtimeFixture("quiet");
    const reads = [];
    runtime.waitDependencies.onRead = (kind) => reads.push(kind);
    const waited = await runtime.wait(null, { timeoutMs: 40 });
    assert.equal(waited.waitTimedOut, true);
    assert.ok(reads.length <= 3, `unexpected durable read amplification: ${reads.length}`);
    assert.equal(
      fs.existsSync(path.join(runtimeHome, "state")),
      false,
      "quiet wait must not materialize plugin state merely to observe it",
    );
  });

  it("rereads a durable completion after a filesystem wake", async () => {
    const { runtime, workspace, ownerRootId } = runtimeFixture("completion");
    fs.mkdirSync(path.join(runtimeHome, "state"), { recursive: true });
    const wakeReasons = [];
    runtime.waitDependencies.onWake = (diagnostics) => wakeReasons.push(diagnostics.wakeReason);
    const pending = runtime.wait(null, { timeoutMs: 2_000 });
    setTimeout(() => {
      appendCompletionEvent(workspace, ownerRootId, {
        jobId: "job-wakeup-completion",
        agentId: "agent-wakeup-completion",
        terminalStatus: "completed",
        summary: "filesystem wake completion",
        finalMessage: "filesystem wake completion",
        resumability: { classification: "resumable", claudeSessionId: "session-wakeup-completion" },
        detailedResultAvailable: false,
        resultPointer: null,
      });
    }, 25);
    const waited = await pending;
    assert.equal(waited.waitTimedOut, false);
    assert.equal(waited.update.kind, "completion");
    assert.ok(wakeReasons.includes("watcher") || wakeReasons.includes("post-registration"));
  });

  it("wakes from a real Linux atomic rename before the recovery interval", async (t) => {
    if (process.platform !== "linux") {
      t.skip("filesystem event gate is Linux-only");
      return;
    }
    const { stateRoot } = fixture();
    const inbox = path.join(stateRoot, "completion-inboxes", "owner");
    fs.mkdirSync(inbox, { recursive: true });
    const target = path.join(inbox, "inbox.json");
    const temporary = path.join(inbox, "inbox.json.tmp");
    const pending = waitForDurableActivity({
      desiredPaths: [inbox],
      stateRoot,
      deadline: Date.now() + 2_000,
      recoveryIntervalMs: 60_000,
    });
    setTimeout(() => {
      fs.writeFileSync(temporary, "durable\n");
      fs.renameSync(temporary, target);
    }, 25);
    const result = await pending;
    assert.equal(result.wakeReason, "watcher");
    assert.equal(fs.readFileSync(target, "utf8"), "durable\n");
    assert.equal(result.recoveryIntervalMs, 60_000);
  });
});

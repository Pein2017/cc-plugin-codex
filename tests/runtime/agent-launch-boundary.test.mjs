import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import { readJobFile, writeJobFile } from "../../runtime/job-store.mjs";

const roots = /** @type {string[]} */ ([]);
const sharedRuntimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-launch-runtime-home-"));

after(() => fs.rmSync(sharedRuntimeHome, { recursive: true, force: true }));
afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-launch-boundary-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, "claude");
  const envFile = path.join(root, "runtime.env");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  roots.push(root);
  const runtime = createAgentRuntime({
    cwd: workspace,
    envFile,
    env: {
      CODEX_THREAD_ID: "root-agent-launch-boundary",
      CC_RUNTIME_HOME: sharedRuntimeHome,
      CLAUDE_CONFIG_DIR: claudeConfigDir,
    },
  });
  return { runtime, workspace };
}

function readiness(runtime) {
  return {
    ready: true,
    availability: { available: true },
    auth: { loggedIn: true },
    cwd: runtime.jobs.cwd,
    claudeConfigDir: runtime.jobs.env.CLAUDE_CONFIG_DIR ?? null,
    sourceRoot: runtime.jobs.sourceRoot,
  };
}

function waitMs(milliseconds) {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, milliseconds);
}

describe("Agent durable launch boundary", () => {
  it("keeps slow readiness outside activation, then attaches a prepared fact before worker launch", async () => {
    const { runtime, workspace } = setup();
    const events = /** @type {string[]} */ ([]);
    const baseStore = runtime.store;
    const jobs = /** @type {any} */ (runtime.jobs);
    const baseAttach = jobs.attachPreparedStart.bind(jobs);
    let observedJobId = null;

    jobs.assertReady = () => {
      events.push("ready:start");
      assert.equal(baseStore.listAgents().some((agent) => agent.activeJobId), false);
      waitMs(2_100);
      assert.equal(baseStore.listAgents().some((agent) => agent.activeJobId), false);
      events.push("ready:end");
      return readiness(runtime);
    };
    runtime.store = {
      ...baseStore,
      reserveActivation(target, jobId, options) {
        const prepared = readJobFile(workspace, jobId);
        assert.equal(prepared.agentId, undefined);
        assert.equal(prepared.phase, "activation_prepared");
        assert.equal(prepared.workerPid, process.pid);
        events.push("reserve");
        return baseStore.reserveActivation(target, jobId, options);
      },
    };
    jobs.attachPreparedStart = (prepared, agentId) => {
      events.push("attach");
      return baseAttach(prepared, agentId);
    };
    jobs.launchPreparedStart = async (prepared, task) => {
      const attached = readJobFile(workspace, prepared.jobId);
      assert.equal(attached.agentId, prepared.agentId);
      assert.equal(attached.phase, "activation_prepared");
      assert.equal(task, "launch after readiness");
      events.push("launch");
      observedJobId = prepared.jobId;
      return { jobId: prepared.jobId, agentId: prepared.agentId, status: "queued" };
    };

    const result = await runtime.spawnAgent({
      task_name: "boundary",
      message: "launch after readiness",
      fork_turns: "none",
    });

    assert.equal(result.turn.jobId, observedJobId);
    assert.deepEqual(events, ["ready:start", "ready:end", "reserve", "attach", "launch"]);
    assert.equal(readJobFile(workspace, observedJobId).agentId, result.agent.agentId);
    assert.equal(runtime.jobs.abortPreparedStart({ jobId: observedJobId }), true);
  });

  it("keeps a racing mailbox message when initial job preparation fails", async () => {
    const { runtime } = setup();
    const jobs = /** @type {any} */ (runtime.jobs);
    jobs.assertReady = () => readiness(runtime);
    jobs.prepareStart = () => {
      const agent = runtime.store.resolveTarget("prepare_race");
      const sent = runtime.sendMessage({ target: agent.agentId, message: "message during prepare" });
      assert.equal(sent.delivery, "queued_no_turn");
      throw new Error("injected prepare failure");
    };

    await assert.rejects(
      runtime.spawnAgent({
        task_name: "prepare_race",
        message: "initial prompt",
        fork_turns: "none",
      }),
      /injected prepare failure/
    );

    const agent = runtime.store.resolveTarget("prepare_race");
    assert.equal(agent.status, "pending_init");
    assert.equal(agent.activeJobId, null);
    const messages = runtime.store.listMessages(agent.agentId);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].state, "queued");
    assert.equal(messages[0].text, "message during prepare");
  });

  it("keeps a losing prepared record unbound and prevents it from projecting onto the Agent", () => {
    const { runtime, workspace } = setup();
    const agent = runtime.store.createAgent({ task_name: "loser" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    const prepared = runtime.jobs.prepareStart("losing concurrent follow-up", {
      readinessReceipt: readiness(runtime),
      jobId: "prepared-loser",
      agentId: agent.agentId,
    });
    const stored = readJobFile(workspace, prepared.jobId);
    assert.ok(stored);
    assert.equal(stored.agentId, undefined);
    assert.equal(stored.phase, "activation_prepared");

    writeJobFile(workspace, prepared.jobId, {
      ...stored,
      status: "failed",
      phase: "failed",
      completedAt: new Date().toISOString(),
    });
    runtime.reconcile();
    const afterReconcile = runtime.store.readAgent(agent.agentId);
    assert.ok(afterReconcile);
    assert.equal(afterReconcile.status, "completed");
  });

  it("uses a live unbound prepared fact as a barrier, then rolls back a reaped pre-attach reservation", () => {
    const { runtime, workspace } = setup();
    const agent = runtime.store.createAgent({ task_name: "crash_window" });
    runtime.store.updateAgent(agent.agentId, (current) => ({ ...current, status: "completed" }));
    const prepared = runtime.jobs.prepareStart("crash between reserve and attach", {
      readinessReceipt: readiness(runtime),
      jobId: "prepared-crash-window",
      agentId: agent.agentId,
    });
    const reservation = runtime.store.reserveActivation(agent.agentId, prepared.jobId);
    assert.equal(reservation.reserved, true);

    // Age past the reaper grace window. The launcher identity is this live
    // process, so the unbound durable fact must still prevent a rollback.
    const staleAt = new Date(Date.now() - 5_000).toISOString();
    const stored = readJobFile(workspace, prepared.jobId);
    writeJobFile(workspace, prepared.jobId, {
      ...stored,
      createdAt: staleAt,
      updatedAt: staleAt,
    });
    assert.deepEqual(runtime.reconcile(), []);
    const whileLauncherLives = runtime.store.readAgent(agent.agentId);
    assert.ok(whileLauncherLives);
    assert.equal(whileLauncherLives.status, "running");
    assert.equal(whileLauncherLives.activeJobId, prepared.jobId);

    // This models the reaper's terminal fact after that launcher hard-crashes
    // before attach. It remains unbound and must not finalize the Agent.
    writeJobFile(workspace, prepared.jobId, {
      ...readJobFile(workspace, prepared.jobId),
      status: "failed",
      phase: "failed",
      completedAt: new Date().toISOString(),
      workerPid: null,
      workerPidIdentity: null,
    });
    assert.deepEqual(runtime.reconcile(), []);
    const recovered = runtime.store.readAgent(agent.agentId);
    assert.ok(recovered);
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.activeJobId, null);
    assert.equal(recovered.lastTerminalJobId, undefined);
  });

  it("preserves pending initial messages after a pre-attach crash and reactivates them as an initial turn", async () => {
    const { runtime, workspace } = setup();
    const agent = runtime.store.createAgent({ task_name: "initial_crash" });
    const prepared = runtime.jobs.prepareStart("initial prompt", {
      readinessReceipt: readiness(runtime),
      jobId: "prepared-initial-crash",
      agentId: agent.agentId,
    });
    const activation = runtime.store.reserveActivation(agent.agentId, prepared.jobId, { initial: true });
    assert.equal(activation.reserved, true);

    const sent = runtime.sendMessage({ target: agent.agentId, message: "keep this pending input" });
    assert.equal(sent.delivery, "activation_pending");
    runtime.store.markMessageDispatched(agent.agentId, sent.message.messageId, {
      jobId: prepared.jobId,
      receipt: { delivery: "stale_prelaunch_receipt", steeringSequence: 1 },
    });

    writeJobFile(workspace, prepared.jobId, {
      ...readJobFile(workspace, prepared.jobId),
      status: "failed",
      phase: "failed",
      completedAt: new Date().toISOString(),
      workerPid: null,
      workerPidIdentity: null,
    });
    assert.deepEqual(runtime.reconcile(), []);

    const recovered = runtime.store.readAgent(agent.agentId);
    assert.ok(recovered);
    assert.equal(recovered.status, "pending_init");
    assert.equal(recovered.activeJobId, null);
    const recoveredMessages = runtime.store.listMessages(agent.agentId);
    assert.equal(recoveredMessages.length, 1);
    assert.equal(recoveredMessages[0].state, "queued");
    assert.equal(recoveredMessages[0].assignedJobId, null);
    assert.equal(recoveredMessages[0].receipt, undefined);

    const baseStore = runtime.store;
    const jobs = /** @type {any} */ (runtime.jobs);
    const baseReserve = baseStore.reserveActivation.bind(baseStore);
    let reserveOptions = null;
    let launchedPrompt = null;
    runtime.store = {
      ...baseStore,
      reserveActivation(target, jobId, options) {
        reserveOptions = options;
        return baseReserve(target, jobId, options);
      },
    };
    jobs.assertReady = () => readiness(runtime);
    jobs.launchPreparedStart = async (nextPrepared, prompt) => {
      launchedPrompt = prompt;
      return { jobId: nextPrepared.jobId, agentId: nextPrepared.agentId, status: "queued" };
    };

    const followup = await runtime.followupTask({
      target: agent.agentId,
      message: "follow-up after recovery",
    });
    assert.equal(reserveOptions?.initial, true);
    assert.equal(followup.activated, true);
    assert.equal(launchedPrompt, "keep this pending input\n\nfollow-up after recovery");
  });
});

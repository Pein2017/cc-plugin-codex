import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import {
  readJobFile,
  transitionJob,
  writeJobFile,
} from "../../runtime/job-store.mjs";

const roots = [];
const originalRuntimeHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
const sharedRuntimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-task-5-5-runtime-home-"));

afterEach(() => {
  if (originalRuntimeHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = originalRuntimeHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = sharedRuntimeHome;

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-task-5-5-interrupt-"));
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, "claude");
  const envFile = path.join(root, "runtime.env");
  const ownerRootId = `task-5-5-root-${roots.length}`;
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = sharedRuntimeHome;
  roots.push(root);

  const runtime = createAgentRuntime({
    cwd: workspace,
    envFile,
    env: {
      CODEX_THREAD_ID: ownerRootId,
      CODEX_HARNESSDOCK_RUNTIME_HOME: sharedRuntimeHome,
      CLAUDE_CONFIG_DIR: claudeConfigDir,
    },
  });
  const agent = runtime.store.createAgent({
    task_name: `task_5_5_interrupt_${roots.length}`,
    selectedModel: "claude-sonnet-5",
  });
  const jobId = `task-5-5-job-${roots.length}`;
  runtime.store.reserveActivation(agent.agentId, jobId, { initial: true });
  const timestamp = new Date().toISOString();
  writeJobFile(workspace, jobId, {
    id: jobId,
    workspaceRoot: workspace,
    ownerRootId,
    agentId: agent.agentId,
    status: "running",
    phase: "running_attempt",
    preClaudeLaunch: false,
    acceptingSteering: true,
    harnessId: runtime.jobs.driver.harnessId,
    driverVersion: runtime.jobs.driver.driverVersion,
    harnessCapabilities: runtime.jobs.driver.capabilities,
    pid: 4242,
    pidIdentity: "test-process-identity",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return { runtime, workspace, agentId: agent.agentId, jobId };
}

function installProcessControlDouble(runtime, { interruptReceipt }) {
  const calls = { interrupt: [], cancel: [] };
  const driver = runtime.jobs.driver;
  runtime.jobs.driver = {
    ...driver,
    interruptTurn: async (input) => {
      calls.interrupt.push(input);
      return typeof interruptReceipt === "function" ? interruptReceipt() : interruptReceipt;
    },
    cancelTurn: async (input) => {
      calls.cancel.push(input);
      return { cancelled: true, note: "test forced cancellation" };
    },
  };
  return calls;
}

describe("Task 5.5: interruption remains request-only", { concurrency: false }, () => {
  it("does not auto-cancel after a graceful interrupt rejection", async () => {
    const context = setup();
    const calls = installProcessControlDouble(context.runtime, {
      interruptReceipt: {
        interrupted: false,
        note: "native interrupt request rejected",
      },
    });

    const receipt = await context.runtime.interruptAgent({ target: context.agentId });

    assert.equal(receipt.status, "still_working");
    assert.equal(calls.interrupt.length, 1);
    assert.deepEqual(calls.interrupt[0], { pid: 4242, pidIdentity: "test-process-identity" });
    assert.equal(calls.cancel.length, 0);
    const job = readJobFile(context.workspace, context.jobId);
    assert.equal(job.status, "running");
    assert.equal(job.completedAt, undefined);
    assert.notEqual(job.phase, "forced_interruption_unflushed");
  });

  it("keeps a turn active when the interrupt driver fails", async () => {
    const context = setup();
    const calls = installProcessControlDouble(context.runtime, {
      interruptReceipt: () => {
        throw new Error("native interrupt transport failed");
      },
    });

    const receipt = await context.runtime.interruptAgent({ target: context.agentId });

    assert.equal(receipt.status, "still_working");
    assert.equal(calls.interrupt.length, 1);
    assert.equal(calls.cancel.length, 0);
    const job = readJobFile(context.workspace, context.jobId);
    assert.equal(job.status, "running");
    assert.equal(job.phase, "interrupt_failed");
    assert.equal(job.completedAt, undefined);
    assert.notEqual(job.phase, "forced_interruption_unflushed");
  });

  it("returns promptly after request acceptance without synthesizing terminal interruption", async () => {
    const context = setup();
    const calls = installProcessControlDouble(context.runtime, {
      interruptReceipt: { interrupted: true, note: "native request accepted" },
    });
    const startedAt = Date.now();

    const receipt = await context.runtime.interruptAgent({ target: context.agentId });
    const elapsed = Date.now() - startedAt;

    assert.equal(receipt.status, "still_working");
    assert.equal(calls.interrupt.length, 1);
    assert.equal(calls.cancel.length, 0);
    assert.ok(elapsed < 1_000, `request-only interrupt took ${elapsed}ms`);
    const job = readJobFile(context.workspace, context.jobId);
    assert.equal(job.status, "interrupting");
    assert.equal(job.completedAt, undefined);
    assert.equal(job.result, undefined);
    assert.notEqual(job.phase, "forced_interruption_unflushed");
  });

  it("still reconciles an independently committed terminal interruption", async () => {
    const context = setup();
    installProcessControlDouble(context.runtime, {
      interruptReceipt: { interrupted: true, note: "native request accepted" },
    });

    const receipt = await context.runtime.interruptAgent({ target: context.agentId });
    assert.equal(receipt.status, "still_working");
    transitionJob(context.workspace, context.jobId, ["interrupting"], "interrupted", {
      phase: "interrupted",
      completedAt: new Date().toISOString(),
      acceptingSteering: false,
      result: {
        status: "interrupted",
        sessionId: "independent-worker-session",
        failureClass: "cancelled_or_interrupted",
        resumable: true,
      },
    });

    context.runtime.reconcile();
    const job = readJobFile(context.workspace, context.jobId);
    assert.equal(job.status, "interrupted");
    assert.ok(job.completedAt);
    const projection = context.runtime.listAgents().agents;
    assert.equal(projection.length, 1);
    assert.equal(projection[0].agent_status, "interrupted");
  });
});

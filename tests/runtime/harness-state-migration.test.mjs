import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createAgentStore } from "../../runtime/agent-store.mjs";
import {
  CLAUDE_CODE_CAPABILITIES,
  CLAUDE_CODE_DRIVER_VERSION,
  CLAUDE_CODE_HARNESS_ID,
} from "../../runtime/claude-code-driver.mjs";
import { harnessSessionKey } from "../../runtime/harness-contract.mjs";
import {
  releaseSessionLease,
  reserveSessionLease,
  writeJobFile,
} from "../../runtime/job-store.mjs";

const HARNESS = {
  harnessId: CLAUDE_CODE_HARNESS_ID,
  driverVersion: CLAUDE_CODE_DRIVER_VERSION,
  capabilities: CLAUDE_CODE_CAPABILITIES,
};

const roots = [];
const priorRuntimeHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
  if (priorRuntimeHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = priorRuntimeHome;
});

function setup(ownerRootId = "codex-root-harness-migration") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-harness-migration-"));
  roots.push(root);
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, "claude");
  fs.mkdirSync(workspace);
  fs.mkdirSync(claudeConfigDir);
  process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = path.join(root, "runtime-home");
  return {
    root,
    workspace,
    claudeConfigDir,
    ownerRootId,
    store: createAgentStore({ cwd: workspace, ownerRootId, claudeConfigDir, harness: HARNESS }),
  };
}

function registryFile(root) {
  const pending = [process.env.CODEX_HARNESSDOCK_RUNTIME_HOME];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.name === "registry.json") return candidate;
    }
  }
  throw new Error(`No Agent registry was created under ${root}.`);
}

function rewriteAgent(root, agentId, mutate) {
  const filePath = registryFile(root);
  const registry = JSON.parse(fs.readFileSync(filePath, "utf8"));
  registry.agents[agentId] = mutate(registry.agents[agentId]);
  fs.writeFileSync(filePath, JSON.stringify(registry));
  return registry.agents[agentId];
}

/** Rewrite an Agent as the version-1 record a pre-Harness runtime would own. */
function downgrade(root, agentId, patch = {}) {
  return rewriteAgent(root, agentId, (stored) => {
    const {
      harnessId: _harnessId,
      driverVersion: _driverVersion,
      capabilities: _capabilities,
      selectedEffort: _selectedEffort,
      nativeSessionRef,
      ...legacy
    } = stored;
    return {
      ...legacy,
      version: 1,
      ...(nativeSessionRef
        ? {
            claudeSessionId: nativeSessionRef.nativeSessionId,
            claudeConfigDir: nativeSessionRef.instanceKey,
          }
        : {}),
      ...patch,
    };
  });
}

function terminalJob(agent, id, overrides = {}) {
  return {
    id,
    agentId: agent.agentId,
    status: "completed",
    threadId: "native-session-1",
    harnessStateVersion: 2,
    harnessId: CLAUDE_CODE_HARNESS_ID,
    driverVersion: CLAUDE_CODE_DRIVER_VERSION,
    harnessCapabilities: CLAUDE_CODE_CAPABILITIES,
    harnessRoute: { harnessId: CLAUDE_CODE_HARNESS_ID, model: "claude-opus-5", effort: "xhigh" },
    recoverability: {
      resumable: true,
      mode: "exact_session",
      exactSessionId: "native-session-1",
      reason: "completed_exact_session",
    },
    ...overrides,
  };
}

describe("Harness-neutral durable state migration", () => {
  it("writes new Agents as version 2 with an immutable Harness route", () => {
    const { store } = setup();
    const agent = store.createAgent({
      task_name: "v2_agent",
      selectedModel: "claude-opus-5",
      selectedEffort: "xhigh",
      delegationMode: "leaf",
    });
    assert.equal(agent.version, 2);
    assert.equal(agent.harnessId, "claude-code");
    assert.equal(agent.driverVersion, CLAUDE_CODE_DRIVER_VERSION);
    assert.deepEqual(agent.capabilities, CLAUDE_CODE_CAPABILITIES);
    assert.deepEqual(agent.route, {
      harnessId: "claude-code",
      model: "claude-opus-5",
      delegationMode: "leaf",
    });
    assert.equal(Object.hasOwn(agent.route, "effort"), false);
    assert.equal(agent.nativeSessionRef, null);

    assert.throws(
      () => store.updateAgent(agent.agentId, (current) => ({ ...current, selectedModel: "claude-haiku-4-5" })),
      /must not change immutable field selectedModel/,
    );
    assert.throws(
      () => store.updateAgent(agent.agentId, (current) => ({ ...current, harnessId: "future-harness" })),
      /must not change immutable field harnessId/,
    );
    assert.throws(
      () => store.updateAgent(agent.agentId, (current) => ({ ...current, driverVersion: "claude-code@future" })),
      /must not change immutable field driverVersion/,
    );
    assert.throws(
      () => store.updateAgent(agent.agentId, (current) => ({
        ...current,
        capabilities: { ...current.capabilities, continuation: "fresh_only" },
      })),
      /must not change immutable field capabilities/,
    );
    assert.throws(
      () => store.createAgent({
        task_name: "forged_contract",
        selectedModel: "claude-opus-5",
        driverVersion: "claude-code@forged",
      }),
      /does not accept driverVersion/,
    );
  });

  it("interprets a valid version-1 record as Claude Code without rewriting it", () => {
    const { root, store } = setup();
    const created = store.createAgent({ task_name: "legacy_reader", selectedModel: "claude-sonnet-5" });
    store.reserveActivation(created.agentId, "job-legacy-1", { initial: true });
    store.bindSession(created.agentId, "legacy-session", { jobId: "job-legacy-1" });
    downgrade(root, created.agentId, { status: "completed", activeJobId: null, latestJobId: "job-legacy-1" });

    const read = store.readAgent(created.agentId);
    assert.equal(read.version, 1);
    assert.equal(read.harnessId, "claude-code");
    assert.equal(read.driverVersion, null);
    assert.equal(read.capabilities, null);
    assert.deepEqual(read.nativeSessionRef, {
      harnessId: "claude-code",
      instanceKey: read.claudeConfigDir,
      nativeSessionId: "legacy-session",
    });
    assert.equal(read.claudeSessionId, "legacy-session");
    assert.deepEqual(read.route, {
      harnessId: "claude-code",
      model: "claude-sonnet-5",
      delegationMode: "leaf",
    });

    // An unrelated durable write must leave the legacy record's schema alone.
    store.enqueueMessage(created.agentId, "still legacy");
    assert.equal(store.readAgent(created.agentId).version, 1);
  });

  it("never normalizes an active or ownership-uncertain version-1 record", () => {
    const { root, store } = setup();
    const active = store.createAgent({ task_name: "active_legacy", selectedModel: "claude-opus-5" });
    store.reserveActivation(active.agentId, "job-active-legacy", { initial: true });
    downgrade(root, active.agentId);
    assert.equal(store.readAgent(active.agentId).activeJobId, "job-active-legacy");

    // A terminal receipt for some *other* job arrives while the legacy worker
    // still owns the active turn: the record stays version 1.
    const stale = store.finalizeFromJob(terminalJob(active, "job-unrelated", { threadId: null, recoverability: null }));
    assert.equal(stale.reason, "stale_terminal_recorded");
    assert.equal(store.readAgent(active.agentId).version, 1);
    assert.equal(store.readAgent(active.agentId).activeJobId, "job-active-legacy");

    // Ownership-uncertain: the legacy model was never proven, so the record
    // must keep its mutable version-1 shape for later backfill.
    const unproven = store.createAgent({ task_name: "unproven_legacy", selectedModel: "claude-opus-5" });
    store.reserveActivation(unproven.agentId, "job-unproven", { initial: true });
    downgrade(root, unproven.agentId, { selectedModel: null });
    store.finalizeFromJob(terminalJob(unproven, "job-unproven"));
    assert.equal(store.readAgent(unproven.agentId).version, 1);
  });

  it("normalizes a terminal unowned version-1 record on its next safe write", () => {
    const { root, store } = setup();
    const agent = store.createAgent({ task_name: "terminal_legacy", selectedModel: "claude-opus-5" });
    store.reserveActivation(agent.agentId, "job-terminal-legacy", { initial: true });
    store.bindSession(agent.agentId, "native-session-1", { jobId: "job-terminal-legacy" });
    store.enqueueMessage(agent.agentId, "queued before migration");
    const legacy = downgrade(root, agent.agentId);
    assert.equal(legacy.version, 1);
    const beforeMailbox = store.readAgent(agent.agentId).mailbox.nextSequence;

    const finalized = store.finalizeFromJob(terminalJob(agent, "job-terminal-legacy"));
    assert.equal(finalized.reconciled, true);
    const migrated = store.readAgent(agent.agentId);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.agentId, agent.agentId);
    assert.equal(migrated.path, agent.path);
    assert.equal(migrated.rootThreadId, agent.rootThreadId);
    assert.equal(migrated.harnessId, "claude-code");
    assert.equal(migrated.driverVersion, CLAUDE_CODE_DRIVER_VERSION);
    assert.deepEqual(migrated.capabilities, CLAUDE_CODE_CAPABILITIES);
    assert.equal(migrated.selectedModel, "claude-opus-5");
    assert.equal(Object.hasOwn(migrated.route, "effort"), false);
    assert.deepEqual(migrated.nativeSessionRef, {
      harnessId: "claude-code",
      instanceKey: migrated.claudeConfigDir,
      nativeSessionId: "native-session-1",
    });
    assert.equal(migrated.continuation.mode, "exact_session");
    assert.equal(migrated.mailbox.nextSequence, beforeMailbox);
    assert.equal(store.listMessages(agent.agentId).length, 1);
  });

  it("keeps a version-1 record when its terminal job carries no Harness evidence", () => {
    const { root, store } = setup();
    const agent = store.createAgent({ task_name: "v1_job", selectedModel: "claude-opus-5" });
    store.reserveActivation(agent.agentId, "job-v1", { initial: true });
    downgrade(root, agent.agentId);
    const {
      harnessId: _harnessId,
      driverVersion: _driverVersion,
      harnessCapabilities: _capabilities,
      harnessStateVersion: _stateVersion,
      ...legacyJob
    } = terminalJob(agent, "job-v1");
    store.finalizeFromJob(legacyJob);
    assert.equal(store.readAgent(agent.agentId).version, 1);
    assert.equal(store.readAgent(agent.agentId).claudeSessionId, "native-session-1");
  });

  it("rejects an unknown record version instead of interpreting it", () => {
    const { root, store } = setup();
    const agent = store.createAgent({ task_name: "future", selectedModel: "claude-opus-5" });
    rewriteAgent(root, agent.agentId, (stored) => ({ ...stored, version: 3 }));
    assert.throws(() => store.listAgents(), /Unsupported Agent record version: 3/);
  });

  it("rejects a native session reference owned by a different Harness", () => {
    const { root, store } = setup();
    const agent = store.createAgent({ task_name: "foreign_session", selectedModel: "claude-opus-5" });
    rewriteAgent(root, agent.agentId, (stored) => ({
      ...stored,
      nativeSessionRef: {
        harnessId: "future-harness",
        instanceKey: "tenant:alpha",
        nativeSessionId: "foreign-session",
      },
    }));
    assert.throws(
      () => store.readAgent(agent.agentId),
      /native session belongs to Harness future-harness, not claude-code/,
    );
  });

  it("preserves the prior native session reference when a resumed turn drifts", () => {
    const { store } = setup();
    const agent = store.createAgent({ task_name: "drift", selectedModel: "claude-opus-5" });
    store.reserveActivation(agent.agentId, "job-drift-1", { initial: true });
    store.bindSession(agent.agentId, "native-session-1", { jobId: "job-drift-1" });
    store.finalizeFromJob(terminalJob(agent, "job-drift-1"));

    store.reserveActivation(agent.agentId, "job-drift-2");
    const drifted = store.finalizeFromJob(terminalJob(agent, "job-drift-2", {
      threadId: "other-session",
      recoverability: {
        resumable: true,
        mode: "exact_session",
        exactSessionId: "other-session",
        reason: "completed_exact_session",
      },
    }));
    assert.equal(drifted.agent.status, "errored");
    assert.equal(drifted.agent.continuation.mode, "blocked");
    assert.equal(drifted.agent.continuation.evidence.reason, "session_drift");
    assert.deepEqual(store.readAgent(agent.agentId).nativeSessionRef, {
      harnessId: "claude-code",
      instanceKey: drifted.agent.claudeConfigDir,
      nativeSessionId: "native-session-1",
    });
  });

  it("reconciles the same terminal receipt idempotently and retains Agent metadata", () => {
    const { store } = setup();
    const agent = store.createAgent({
      task_name: "retention",
      selectedModel: "claude-opus-5",
      selectedEffort: "xhigh",
    });
    store.reserveActivation(agent.agentId, "job-retention", { initial: true });
    store.bindSession(agent.agentId, "native-session-1", { jobId: "job-retention" });
    const first = store.finalizeFromJob(terminalJob(agent, "job-retention"));
    assert.equal(first.reconciled, true);
    const second = store.finalizeFromJob(terminalJob(agent, "job-retention"));
    assert.equal(second.reconciled, false);
    assert.equal(second.reason, "already_finalized");
    assert.equal(
      store.readAgent(agent.agentId).latestCompletionSequence,
      first.agent.latestCompletionSequence,
    );

    // Detailed job receipts can be pruned; identity, route, Driver contract,
    // and the native session reference outlive them.
    const retained = store.readAgent(agent.agentId);
    assert.deepEqual(retained.route, {
      harnessId: "claude-code",
      model: "claude-opus-5",
      delegationMode: "leaf",
    });
    assert.deepEqual(retained.capabilities, CLAUDE_CODE_CAPABILITIES);
    assert.equal(retained.nativeSessionRef.nativeSessionId, "native-session-1");
    assert.equal(retained.continuation.mode, "exact_session");
  });

  it("canonicalizes a Claude instance key so one native session has one binding", () => {
    const { root, workspace, claudeConfigDir, ownerRootId, store } = setup();
    const linkedConfigDir = path.join(root, "claude-link");
    fs.symlinkSync(claudeConfigDir, linkedConfigDir);

    const agent = store.createAgent({ task_name: "symlinked", selectedModel: "claude-opus-5" });
    store.reserveActivation(agent.agentId, "job-symlink", { initial: true });
    // A legacy job receipt records a non-canonical config path; binding through
    // it must not create a second identity for the same native session.
    const bound = store.bindSession(agent.agentId, "linked-session", {
      jobId: "job-symlink",
      instanceKey: linkedConfigDir,
    });
    const canonicalConfigDir = fs.realpathSync.native(claudeConfigDir);
    assert.equal(bound.binding.instanceKey, canonicalConfigDir);
    assert.equal(
      bound.binding.key,
      harnessSessionKey({
        harnessId: "claude-code",
        instanceKey: canonicalConfigDir,
        nativeSessionId: "linked-session",
      }),
    );
    assert.equal(store.readAgent(agent.agentId).nativeSessionRef.instanceKey, canonicalConfigDir);

    // Another root reaching the same session through the canonical path is
    // still refused by the existing cross-root ownership guard.
    const other = createAgentStore({
      cwd: path.join(root, "workspace"),
      ownerRootId: `${ownerRootId}-other`,
      claudeConfigDir,
      harness: HARNESS,
    });
    const foreign = other.createAgent({ task_name: "foreign", selectedModel: "claude-opus-5" });
    other.reserveActivation(foreign.agentId, "job-foreign-symlink", { initial: true });
    assert.throws(
      () => other.bindSession(foreign.agentId, "linked-session", { jobId: "job-foreign-symlink" }),
      /already bound to a different logical root or Agent/,
    );
    assert.ok(workspace);
  });

  it("preserves a non-Claude Agent store instance key as Driver-owned opaque text", () => {
    const { root, workspace } = setup();
    const store = createAgentStore({
      cwd: workspace,
      ownerRootId: "codex-root-opaque-agent-instance",
      harness: {
        harnessId: "future-harness",
        instanceKey: "tenant:alpha",
        driverVersion: "future-harness@1",
        capabilities: CLAUDE_CODE_CAPABILITIES,
      },
    });
    const agent = store.createAgent({ task_name: "opaque_instance", selectedModel: "test-model" });
    store.reserveActivation(agent.agentId, "job-opaque-instance", { initial: true });
    const bound = store.bindSession(agent.agentId, "native-session", {
      jobId: "job-opaque-instance",
    });

    assert.equal(bound.binding.instanceKey, "tenant:alpha");
    assert.equal(store.readAgent(agent.agentId).nativeSessionRef.instanceKey, "tenant:alpha");
    assert.equal(
      bound.binding.key,
      harnessSessionKey({
        harnessId: "future-harness",
        instanceKey: "tenant:alpha",
        nativeSessionId: "native-session",
      }),
    );
    assert.equal(fs.existsSync(path.join(root, "tenant:alpha")), false);
  });

  it("never records an exact-resume pointer for a Driver without exact continuation", () => {
    const { root, store } = setup();
    const agent = store.createAgent({ task_name: "fresh_only", selectedModel: "claude-opus-5" });
    rewriteAgent(root, agent.agentId, (stored) => ({
      ...stored,
      capabilities: { ...CLAUDE_CODE_CAPABILITIES, continuation: "fresh_only" },
    }));
    store.reserveActivation(agent.agentId, "job-fresh-only", { initial: true });
    const finalized = store.finalizeFromJob(terminalJob(agent, "job-fresh-only"));
    assert.equal(finalized.agent.status, "completed");
    assert.equal(finalized.agent.continuation.mode, "safe_fresh");
    assert.equal(finalized.agent.continuation.evidence.reason, "driver_continuation_fresh_only");
    assert.equal(finalized.agent.continuation.evidence.acceptedContinuation, "fresh_only");
  });

  it("keys native session leases by Harness, instance, and session without colliding", () => {
    const { workspace, claudeConfigDir } = setup();
    const claudeInstance = { harnessId: "claude-code", instanceKey: claudeConfigDir };
    writeJobFile(workspace, "cc-lease-1", {
      id: "cc-lease-1",
      workspaceRoot: workspace,
      status: "running",
    });

    const lease = reserveSessionLease(workspace, claudeInstance, "shared-session", "cc-lease-1");
    assert.equal(lease.version, 2);
    assert.equal(lease.harnessId, "claude-code");
    assert.equal(lease.nativeSessionId, "shared-session");
    // A version-1 caller passing only the config directory resolves the same
    // lease rather than creating a second, stealable one.
    assert.equal(
      reserveSessionLease(workspace, claudeConfigDir, "shared-session", "cc-lease-1").key,
      lease.key,
    );
    assert.equal(
      lease.key,
      harnessSessionKey({
        harnessId: "claude-code",
        instanceKey: lease.instanceKey,
        nativeSessionId: "shared-session",
      }),
    );
    assert.notEqual(
      harnessSessionKey({
        harnessId: "future-harness",
        instanceKey: lease.instanceKey,
        nativeSessionId: "shared-session",
      }),
      lease.key,
    );
    writeJobFile(workspace, "cc-lease-future", {
      id: "cc-lease-future",
      workspaceRoot: workspace,
      status: "running",
    });
    const futureInstance = { harnessId: "future-harness", instanceKey: lease.instanceKey };
    const futureLease = reserveSessionLease(
      workspace,
      futureInstance,
      "shared-session",
      "cc-lease-future",
    );
    assert.notEqual(futureLease.key, lease.key);
    assert.equal(futureLease.harnessId, "future-harness");
    assert.throws(
      () => reserveSessionLease(workspace, claudeInstance, "shared-session", "cc-lease-2"),
      /already owned by active job cc-lease-1/,
    );
    assert.equal(releaseSessionLease(claudeInstance, "shared-session", "cc-lease-1"), true);
    assert.equal(releaseSessionLease(futureInstance, "shared-session", "cc-lease-future"), true);
    assert.equal(
      reserveSessionLease(workspace, claudeInstance, "shared-session", "cc-lease-2").jobId,
      "cc-lease-2",
    );
    releaseSessionLease(claudeInstance, "shared-session", "cc-lease-2");
  });

  it("preserves non-Claude Driver instance keys verbatim", () => {
    const { workspace } = setup();
    const instance = { harnessId: "future-harness", instanceKey: "tenant:alpha" };
    writeJobFile(workspace, "generic-lease", {
      id: "generic-lease",
      workspaceRoot: workspace,
      status: "running",
    });
    const lease = reserveSessionLease(workspace, instance, "session-1", "generic-lease");
    assert.equal(lease.harnessId, "future-harness");
    assert.equal(lease.instanceKey, "tenant:alpha");
    releaseSessionLease(instance, "session-1", "generic-lease");
  });

  it("refuses a native session lease that belongs to another Harness", () => {
    const { workspace, claudeConfigDir } = setup();
    const leaseFile = path.join(
      process.env.CODEX_HARNESSDOCK_RUNTIME_HOME,
      "state",
      "session-leases",
      `${harnessSessionKey({
        harnessId: "claude-code",
        instanceKey: fs.realpathSync.native(claudeConfigDir),
        nativeSessionId: "foreign-session",
      })}.json`,
    );
    fs.mkdirSync(path.dirname(leaseFile), { recursive: true });
    fs.writeFileSync(leaseFile, JSON.stringify({
      version: 2,
      harnessId: "future-harness",
      instanceKey: fs.realpathSync.native(claudeConfigDir),
      nativeSessionId: "foreign-session",
      sessionId: "foreign-session",
      jobId: "future-job",
      workspaceRoot: workspace,
    }));
    assert.throws(
      () => reserveSessionLease(
        workspace,
        { harnessId: "claude-code", instanceKey: claudeConfigDir },
        "foreign-session",
        "cc-lease-9",
      ),
      /owned by Harness future-harness, not claude-code/,
    );

    fs.writeFileSync(leaseFile, JSON.stringify({ version: 99, jobId: "future-job" }));
    assert.throws(
      () => reserveSessionLease(
        workspace,
        { harnessId: "claude-code", instanceKey: claudeConfigDir },
        "foreign-session",
        "cc-lease-9",
      ),
      /Unsupported native session lease version: 99/,
    );
  });
});

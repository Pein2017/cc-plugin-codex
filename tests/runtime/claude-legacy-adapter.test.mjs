/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * The legacy Claude adapter is the only place where "no Harness was recorded"
 * may still mean Claude Code. These tests fix that meaning to the two record
 * versions whose semantics were historically fixed, and prove the adapter can
 * never convert a legacy Agent into version three or another Harness.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  CLAUDE_LEGACY_AGENT_VERSIONS,
  CLAUDE_LEGACY_HARNESS_ID,
  applyLegacyClaudeSessionRef,
  assertLegacyAgentRecord,
  assertNoVersionThreeConversion,
  canonicalClaudeInstanceKey,
  canonicalInstanceKeyForHarness,
  interpretLegacySessionBinding,
  isLegacyAgentRecord,
  legacyClaudeHistoryBinding,
  legacyClaudeSessionProjection,
  legacyHarnessId,
  legacyNativeSessionRef,
  legacyRouteProjection,
  legacySelectedModel,
  legacyTurnAuthority,
  legacyValidationRoute,
  legacyValidationTopology,
  migrateLegacyTerminalRecord,
} from "../../runtime/claude-legacy-adapter.mjs";
import {
  CLAUDE_CODE_CAPABILITIES,
  CLAUDE_CODE_DRIVER_VERSION,
} from "../../runtime/claude-code-driver.mjs";
import { validateVersionThreeRoute } from "../../runtime/durable-state-v3.mjs";

import { versionThreeRoute } from "./fixtures/version-three-state.mjs";

const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-legacy-adapter-"));
  roots.push(root);
  return root;
}

function legacyRecord(overrides = {}) {
  return {
    version: 1,
    agentId: "agent-legacy-1",
    name: "legacy",
    normalizedName: "legacy",
    path: "/root/legacy",
    rootThreadId: "codex-root-legacy",
    workspaceRoot: "/tmp/workspace",
    selectedModel: "claude-opus-5",
    delegationMode: "leaf",
    claudeSessionId: "legacy-session",
    claudeConfigDir: "/tmp/claude",
    status: "completed",
    activeJobId: null,
    latestJobId: "job-legacy-1",
    continuation: { mode: "exact_session", evidence: { reason: "completed_exact_session" } },
    mailbox: { version: 1, nextSequence: 1, messages: [] },
    ...overrides,
  };
}

function neutralRecord(overrides = {}) {
  const { claudeSessionId: _session, claudeConfigDir: _config, ...base } = legacyRecord();
  return {
    ...base,
    version: 2,
    agentId: "agent-neutral-1",
    harnessId: CLAUDE_LEGACY_HARNESS_ID,
    driverVersion: CLAUDE_CODE_DRIVER_VERSION,
    capabilities: CLAUDE_CODE_CAPABILITIES,
    nativeSessionRef: {
      harnessId: CLAUDE_LEGACY_HARNESS_ID,
      instanceKey: "/tmp/claude",
      nativeSessionId: "legacy-session",
    },
    ...overrides,
  };
}

function versionThreeRecord(overrides = {}) {
  return {
    version: 3,
    agentId: "agent-v3-1",
    name: "future",
    normalizedName: "future",
    path: "/root/future",
    rootThreadId: "codex-root-legacy",
    workspaceRoot: "/tmp/workspace",
    route: versionThreeRoute(),
    status: "pending_init",
    activeJobId: null,
    latestJobId: null,
    nativeSessionRef: null,
    continuation: { mode: "safe_fresh", evidence: { reason: "new_agent_no_session" } },
    mailbox: { version: 1, nextSequence: 1, messages: [] },
    ...overrides,
  };
}

describe("Legacy Claude identity projection", () => {
  it("projects Claude Code only for the two record versions whose meaning was fixed", () => {
    assert.deepEqual([...CLAUDE_LEGACY_AGENT_VERSIONS], [1, 2]);
    assert.equal(CLAUDE_LEGACY_HARNESS_ID, "claude-code");
    assert.equal(isLegacyAgentRecord(legacyRecord()), true);
    assert.equal(isLegacyAgentRecord(neutralRecord()), true);
    assert.equal(isLegacyAgentRecord(versionThreeRecord()), false);
    assert.equal(isLegacyAgentRecord({ version: 4 }), false);
    assert.equal(isLegacyAgentRecord(null), false);

    assert.equal(legacyHarnessId(legacyRecord()), "claude-code");
    assert.equal(legacyHarnessId(neutralRecord()), "claude-code");
    // A version-two record that names another Harness is not Claude Code and
    // must never be re-projected onto it.
    assert.equal(legacyHarnessId(neutralRecord({ harnessId: "fake-service" })), "fake-service");
    assert.throws(() => legacyHarnessId(versionThreeRecord()), /version-three|not a legacy/i);
    assert.throws(() => assertLegacyAgentRecord(versionThreeRecord()), /version-three|not a legacy/i);
  });

  it("preserves exact selected-model evidence and infers nothing", () => {
    assert.equal(legacySelectedModel(legacyRecord()), "claude-opus-5");
    assert.equal(legacySelectedModel(legacyRecord({ selectedModel: null })), null);
    // Neither the session, the config directory, the Agent name, nor the
    // Harness default may become model evidence.
    assert.equal(
      legacySelectedModel(legacyRecord({
        selectedModel: null,
        claudeSessionId: "claude-opus-5-session",
        name: "claude-sonnet-5",
      })),
      null,
    );
    assert.equal(legacySelectedModel(neutralRecord({ selectedModel: "claude-haiku-4-5" })), "claude-haiku-4-5");
    assert.throws(() => legacySelectedModel(versionThreeRecord()), /version-three|not a legacy/i);
  });

  it("interprets version-one Claude session fields as one neutral reference", () => {
    assert.deepEqual(legacyNativeSessionRef(legacyRecord()), {
      harnessId: "claude-code",
      instanceKey: "/tmp/claude",
      nativeSessionId: "legacy-session",
    });
    assert.equal(legacyNativeSessionRef(legacyRecord({ claudeSessionId: null })), null);
    assert.deepEqual(legacyNativeSessionRef(neutralRecord()), neutralRecord().nativeSessionRef);
    assert.deepEqual(
      legacyClaudeSessionProjection(legacyNativeSessionRef(legacyRecord())),
      { claudeSessionId: "legacy-session", claudeConfigDir: "/tmp/claude" },
    );
    // Another Harness never receives a Claude-shaped compatibility projection.
    assert.deepEqual(
      legacyClaudeSessionProjection({
        harnessId: "fake-service",
        instanceKey: "tenant-alpha",
        nativeSessionId: "native-session-1",
      }),
      { claudeSessionId: null, claudeConfigDir: null },
    );
    assert.deepEqual(legacyClaudeSessionProjection(null), { claudeSessionId: null, claudeConfigDir: null });
  });

  it("canonicalizes a Claude config directory and leaves other instances verbatim", () => {
    const root = tempRoot();
    const configDir = path.join(root, "claude");
    fs.mkdirSync(configDir);
    const linked = path.join(root, "claude-link");
    fs.symlinkSync(configDir, linked);
    const canonical = fs.realpathSync.native(configDir);

    assert.equal(canonicalClaudeInstanceKey(linked), canonical);
    assert.equal(canonicalClaudeInstanceKey(null), canonicalClaudeInstanceKey(path.join(os.homedir(), ".claude")));
    assert.equal(canonicalInstanceKeyForHarness("claude-code", linked), canonical);
    assert.equal(canonicalInstanceKeyForHarness("fake-service", "tenant-alpha"), "tenant-alpha");
    assert.throws(() => canonicalInstanceKeyForHarness("fake-service", null), /instance key/);
  });

  it("keeps history, auth, and session binding bound to the legacy Claude instance", () => {
    assert.deepEqual(legacyClaudeHistoryBinding(legacyRecord()), {
      sessionId: "legacy-session",
      configDir: "/tmp/claude",
    });
    assert.deepEqual(legacyClaudeHistoryBinding(neutralRecord()), {
      sessionId: "legacy-session",
      configDir: "/tmp/claude",
    });
    assert.equal(legacyClaudeHistoryBinding(legacyRecord({ claudeSessionId: null })), null);
    assert.equal(
      legacyClaudeHistoryBinding(neutralRecord({
        harnessId: "fake-service",
        nativeSessionRef: {
          harnessId: "fake-service",
          instanceKey: "tenant-alpha",
          nativeSessionId: "native-session-1",
        },
      })),
      null,
    );
    assert.throws(() => legacyClaudeHistoryBinding(versionThreeRecord()), /version-three|not a legacy/i);

    assert.deepEqual(
      interpretLegacySessionBinding({
        version: 1,
        claudeConfigDir: "/tmp/claude",
        claudeSessionId: "legacy-session",
        rootThreadId: "codex-root-legacy",
        agentId: "agent-legacy-1",
      }),
      {
        version: 1,
        claudeConfigDir: "/tmp/claude",
        claudeSessionId: "legacy-session",
        rootThreadId: "codex-root-legacy",
        agentId: "agent-legacy-1",
        harnessId: "claude-code",
        instanceKey: "/tmp/claude",
        nativeSessionId: "legacy-session",
      },
    );
    const neutralBinding = {
      version: 2,
      harnessId: "fake-service",
      instanceKey: "tenant-alpha",
      nativeSessionId: "native-session-1",
      rootThreadId: "codex-root-legacy",
      agentId: "agent-neutral-1",
    };
    assert.deepEqual(interpretLegacySessionBinding(neutralBinding), neutralBinding);

    const bound = applyLegacyClaudeSessionRef(legacyRecord({ claudeSessionId: null, claudeConfigDir: null }), {
      harnessId: "claude-code",
      instanceKey: "/tmp/claude",
      nativeSessionId: "bound-session",
    });
    assert.equal(bound.version, 1);
    assert.equal(bound.claudeSessionId, "bound-session");
    assert.equal(bound.claudeConfigDir, "/tmp/claude");
    assert.equal(Object.hasOwn(bound, "nativeSessionRef"), false);
    assert.throws(
      () => applyLegacyClaudeSessionRef(legacyRecord(), {
        harnessId: "fake-service",
        instanceKey: "tenant-alpha",
        nativeSessionId: "native-session-1",
      }),
      /predates Harness state/,
    );
  });
});

describe("Legacy Claude authority and topology stay historical", () => {
  it("maps claude_orchestrator to native_orchestrator only as a validation projection", () => {
    const orchestrator = legacyRecord({ delegationMode: "claude_orchestrator" });
    assert.equal(legacyValidationTopology(orchestrator), "native_orchestrator");
    assert.equal(legacyValidationTopology(legacyRecord()), "leaf");
    // The durable record keeps its own vocabulary; the projection never
    // rewrites it.
    assert.equal(orchestrator.delegationMode, "claude_orchestrator");
    assert.deepEqual(legacyRouteProjection(orchestrator), {
      harnessId: "claude-code",
      model: "claude-opus-5",
      delegationMode: "claude_orchestrator",
    });

    const projection = legacyValidationRoute(orchestrator);
    assert.equal(projection.topology, "native_orchestrator");
    assert.equal(projection.harnessId, "claude-code");
    assert.equal(projection.model, "claude-opus-5");
    assert.equal(projection.durable, false);
    assert.equal(Object.isFrozen(projection), true);
    // A validation projection is not a version-three route and cannot become
    // one: it carries no Driver version, capability snapshot, or authority.
    assert.throws(() => validateVersionThreeRoute(projection), /Version-three route/);
    assert.throws(() => assertNoVersionThreeConversion(orchestrator), /cannot be converted/);
    assert.throws(() => assertNoVersionThreeConversion(neutralRecord()), /cannot be converted/);
  });

  it("reports historical per-turn write intent as mutable turn evidence", () => {
    assert.deepEqual(legacyTurnAuthority({ request: { write: true } }), {
      authority: "behavioral_write",
      scope: "historical_per_turn",
      immutable: false,
    });
    assert.deepEqual(legacyTurnAuthority({ request: { write: false } }), {
      authority: "behavioral_read_only",
      scope: "historical_per_turn",
      immutable: false,
    });
    assert.deepEqual(legacyTurnAuthority({}), {
      authority: "unknown",
      scope: "historical_per_turn",
      immutable: false,
    });
    assert.deepEqual(legacyTurnAuthority(null), {
      authority: "unknown",
      scope: "historical_per_turn",
      immutable: false,
    });
  });
});

describe("Legacy terminal normalization", () => {
  const terminalJob = {
    id: "job-legacy-1",
    agentId: "agent-legacy-1",
    status: "completed",
    harnessId: "claude-code",
    driverVersion: CLAUDE_CODE_DRIVER_VERSION,
    harnessCapabilities: CLAUDE_CODE_CAPABILITIES,
  };

  it("normalizes only a terminal, unowned, model-proven version-one record", () => {
    const migrated = migrateLegacyTerminalRecord(legacyRecord(), terminalJob);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.harnessId, "claude-code");
    assert.equal(migrated.driverVersion, CLAUDE_CODE_DRIVER_VERSION);
    assert.deepEqual(migrated.capabilities, CLAUDE_CODE_CAPABILITIES);
    assert.deepEqual(migrated.nativeSessionRef, {
      harnessId: "claude-code",
      instanceKey: "/tmp/claude",
      nativeSessionId: "legacy-session",
    });
    assert.equal(Object.hasOwn(migrated, "claudeSessionId"), false);
    assert.equal(Object.hasOwn(migrated, "claudeConfigDir"), false);

    // Active ownership, unproven model, missing Driver evidence, and foreign
    // Harness evidence each keep the record exactly as it was.
    const active = legacyRecord({ activeJobId: "job-legacy-1" });
    assert.equal(migrateLegacyTerminalRecord(active, terminalJob), active);
    const unproven = legacyRecord({ selectedModel: null });
    assert.equal(migrateLegacyTerminalRecord(unproven, terminalJob), unproven);
    const record = legacyRecord();
    assert.equal(migrateLegacyTerminalRecord(record, { ...terminalJob, harnessCapabilities: null }), record);
    assert.equal(migrateLegacyTerminalRecord(record, { ...terminalJob, driverVersion: null }), record);
    assert.equal(migrateLegacyTerminalRecord(record, { ...terminalJob, harnessId: "fake-service" }), record);
    assert.equal(
      migrateLegacyTerminalRecord(record, { ...terminalJob, harnessCapabilities: { continuation: "sometimes" } }),
      record,
    );
  });

  it("refuses a receipt that is not this Agent's terminal, same-root job", () => {
    const record = legacyRecord();
    assert.throws(
      () => migrateLegacyTerminalRecord(record, { ...terminalJob, status: "running" }),
      /terminal/,
    );
    assert.throws(
      () => migrateLegacyTerminalRecord(record, { ...terminalJob, agentId: "agent-other" }),
      /another Agent|agent/i,
    );
    assert.throws(
      () => migrateLegacyTerminalRecord(record, { ...terminalJob, ownerRootId: "codex-root-other" }),
      /root/i,
    );
    // The legitimate caller — a terminal receipt for this Agent, either without
    // an owner root or with the matching one — still migrates.
    assert.equal(migrateLegacyTerminalRecord(record, terminalJob).version, 2);
    assert.equal(
      migrateLegacyTerminalRecord(record, { ...terminalJob, ownerRootId: record.rootThreadId }).version,
      2,
    );
  });

  it("never normalizes a version-two or version-three record", () => {
    const neutral = neutralRecord();
    assert.equal(
      migrateLegacyTerminalRecord(neutral, { ...terminalJob, agentId: neutral.agentId }),
      neutral,
    );
    const future = versionThreeRecord();
    assert.throws(
      () => migrateLegacyTerminalRecord(future, { ...terminalJob, agentId: future.agentId }),
      /version-three|not a legacy/i,
    );
  });
});

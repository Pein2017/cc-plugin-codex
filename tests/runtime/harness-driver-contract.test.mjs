import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";
import { createInternalClaudeRuntime } from "../../runtime/internal-runtime.mjs";
import { readJobFile } from "../../runtime/job-store.mjs";

import {
  CLAUDE_CODE_CAPABILITIES,
  CLAUDE_CODE_DRIVER_VERSION,
  CLAUDE_CODE_HARNESS_ID,
  createClaudeCodeDriver,
} from "../../runtime/claude-code-driver.mjs";
import {
  HARNESS_CAPABILITY_NAMES,
  HARNESS_CAPABILITY_VALUES,
  assertHarnessCapability,
  validateHarnessCapabilities,
} from "../../runtime/harness-capabilities.mjs";
import {
  HARNESS_DRIVER_CONTRACT_VERSION,
  HARNESS_DRIVER_OPERATIONS,
  boundedDriverReceipt,
  canonicalNativeSessionRef,
  harnessSessionKey,
  validateHarnessDriver,
  validateHarnessTurnResult,
} from "../../runtime/harness-contract.mjs";
import {
  ADMITTED_HARNESS_IDS,
  DEFAULT_HARNESS_ID,
  assertNoAmbientHarnessSelector,
  assertNoHarnessImplementationSelector,
  resolveHarnessDriver,
} from "../../runtime/harness-registry.mjs";
import {
  HARNESS_TURN_FAILURE_CLASSES,
  HARNESS_TURN_FAILURE_SCOPES,
} from "../../runtime/harness-failure-classes.mjs";

const driver = createClaudeCodeDriver();
const scratchRoots = [];
const sharedRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc-harness-driver-shared-"));
const sharedRuntimeHome = path.join(sharedRuntimeRoot, "runtime-home");
const testEnvFile = path.join(sharedRuntimeRoot, "runtime.env");
fs.writeFileSync(testEnvFile, "");

after(() => {
  while (scratchRoots.length) fs.rmSync(scratchRoots.pop(), { recursive: true, force: true });
  fs.rmSync(sharedRuntimeRoot, { recursive: true, force: true });
});

function terminalResult(overrides = {}) {
  return {
    harnessId: CLAUDE_CODE_HARNESS_ID,
    driverVersion: CLAUDE_CODE_DRIVER_VERSION,
    contractVersion: HARNESS_DRIVER_CONTRACT_VERSION,
    status: "completed",
    exitStatus: 0,
    nativeSession: {
      harnessId: CLAUDE_CODE_HARNESS_ID,
      instanceKey: "/tmp/instance",
      nativeSessionId: "session-1",
    },
    sessionExactness: "exact",
    failure: { class: null, reason: null, detail: null, resumable: false, requiresAttention: false },
    finalMessage: "done",
    finalMessageAbsenceReason: null,
    process: { spawnAccepted: true, identityProven: true },
    receipts: { toolUses: [], touchedFiles: [], attempts: [], recoveryAttempts: 0 },
    ...overrides,
  };
}

describe("Harness Driver contract", () => {
  it("publishes one closed capability vocabulary and fails on anything outside it", () => {
    assert.deepEqual(HARNESS_CAPABILITY_NAMES, [
      "activeInput",
      "authorityEnforcement",
      "automaticRecovery",
      "continuation",
      "history",
      "interrupt",
      "leafEnforcement",
      "nativeOrchestration",
    ]);
    assert.deepEqual(HARNESS_CAPABILITY_VALUES.interrupt, [
      "graceful_flush_proven",
      "best_effort_signal",
      "unsupported",
    ]);

    const snapshot = validateHarnessCapabilities(CLAUDE_CODE_CAPABILITIES);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.throws(
      () => validateHarnessCapabilities({ ...CLAUDE_CODE_CAPABILITIES, continuation: "maybe" }),
      /unsupported continuation value/,
    );
    assert.throws(
      () => validateHarnessCapabilities({ ...CLAUDE_CODE_CAPABILITIES, telepathy: "yes" }),
      /unknown capability: telepathy/,
    );
    const { history: _history, ...missing } = CLAUDE_CODE_CAPABILITIES;
    assert.throws(() => validateHarnessCapabilities(missing), /unsupported history value/);
  });

  it("refuses an operation the persisted snapshot does not admit", () => {
    const initialOnly = { ...CLAUDE_CODE_CAPABILITIES, activeInput: "initial_only" };
    assert.throws(
      () => assertHarnessCapability(initialOnly, "activeInput", ["acknowledged_active_stream"], "no live input"),
      /no live input \(activeInput=initial_only\)/,
    );
    assert.equal(
      assertHarnessCapability(CLAUDE_CODE_CAPABILITIES, "activeInput", ["acknowledged_active_stream"], "unused"),
      "acknowledged_active_stream",
    );
  });

  it("admits exactly the checkout-owned Claude Code Driver", () => {
    assert.deepEqual(ADMITTED_HARNESS_IDS, ["claude-code"]);
    assert.equal(DEFAULT_HARNESS_ID, "claude-code");
    const resolved = resolveHarnessDriver(DEFAULT_HARNESS_ID, { env: {} });
    assert.equal(resolved.harnessId, "claude-code");
    assert.equal(resolved.driverVersion, CLAUDE_CODE_DRIVER_VERSION);
    assert.equal(resolved.contractVersion, HARNESS_DRIVER_CONTRACT_VERSION);
    assert.throws(() => resolveHarnessDriver("other-exec"), /Unknown Harness other-exec/);
    assert.throws(() => resolveHarnessDriver("Other Exec"), /Invalid Harness ID/);
  });

  it("rejects caller and ambient attempts to select a Driver implementation", () => {
    for (const key of [
      "harness_driver",
      "driver_module",
      "claude_bin",
      "claude_config_dir",
      "env_file",
      "capability_override",
    ]) {
      assert.throws(
        () => assertNoHarnessImplementationSelector({ [key]: "/somewhere" }, "spawn_agent"),
        new RegExp(`spawn_agent does not accept ${key}`),
      );
    }
    assert.throws(
      () => assertNoHarnessImplementationSelector({ harness: "other-exec" }, "spawn_agent"),
      /spawn_agent does not accept harness/,
    );
    assert.doesNotThrow(() => assertNoHarnessImplementationSelector({ model: "opus" }, "spawn_agent"));
    for (const key of ["CC_HARNESS_ID", "CC_HARNESS_DRIVER_MODULE", "CC_HARNESS_CAPABILITIES"]) {
      assert.throws(
        () => assertNoAmbientHarnessSelector({ [key]: "x" }),
        new RegExp(`${key} cannot select a Harness Driver implementation`),
      );
      assert.throws(() => resolveHarnessDriver("claude-code", { env: { [key]: "x" } }));
    }
    assert.doesNotThrow(() => assertNoAmbientHarnessSelector({ CC_CLAUDE_BIN: "/usr/bin/claude" }));
  });

  it("validates a Driver module before it can own a turn", () => {
    assert.equal(validateHarnessDriver(driver), driver);
    assert.throws(
      () => validateHarnessDriver({ ...driver, contractVersion: 99 }),
      /implements contract 99/,
    );
    const { startTurn: _startTurn, ...incomplete } = driver;
    assert.throws(() => validateHarnessDriver(incomplete), /does not implement startTurn/);
    const { describeUnreadiness: _describeUnreadiness, ...noUnreadinessDescription } = driver;
    assert.throws(
      () => validateHarnessDriver(noUnreadinessDescription),
      /does not implement describeUnreadiness/,
    );
    const { validatePreparedPreflight: _validatePrepared, ...noPreparedValidation } = driver;
    assert.throws(
      () => validateHarnessDriver(noPreparedValidation),
      /does not implement validatePreparedPreflight/,
    );
    const { revalidatePreparedPreflight: _revalidatePrepared, ...noPreparedRevalidation } = driver;
    assert.throws(
      () => validateHarnessDriver(noPreparedRevalidation),
      /does not implement revalidatePreparedPreflight/,
    );
    const { readAssistantHistory: _history, ...noHistory } = driver;
    assert.throws(
      () => validateHarnessDriver(noHistory),
      /claims assistant history without implementing it/,
    );
  });

  it("normalizes one complete turn result and refuses an incomplete one", () => {
    assert.ok(validateHarnessTurnResult(terminalResult(), driver));
    assert.throws(
      () => validateHarnessTurnResult(terminalResult({ status: "failed", exitStatus: 0 }), driver),
      /status and exit status are inconsistent/,
    );
    assert.throws(
      () => validateHarnessTurnResult(terminalResult({
        status: "failed",
        exitStatus: 1,
        failure: { class: null, reason: "failed", resumable: false },
      }), driver),
      /must classify its failure/,
    );
    assert.throws(
      () => validateHarnessTurnResult(terminalResult({ finalMessage: { text: "not normalized" } }), driver),
      /final message must be text/,
    );
    assert.throws(
      () => validateHarnessTurnResult(terminalResult({ harnessId: "other-exec" }), driver),
      /declares other-exec; expected claude-code/,
    );
    assert.throws(
      () => validateHarnessTurnResult(terminalResult({ status: "pending" }), driver),
      /Unsupported Harness turn status/,
    );
    assert.throws(
      () => validateHarnessTurnResult(
        terminalResult({ sessionExactness: "exact", nativeSession: null }),
        driver,
      ),
      /Exact native session evidence requires a native session reference/,
    );
    assert.throws(
      () => validateHarnessTurnResult(terminalResult({
        nativeSession: {
          harnessId: "other-exec",
          instanceKey: "opaque-instance",
          nativeSessionId: "session-1",
        },
      }), driver),
      /native session belongs to Harness other-exec/,
    );
    assert.throws(
      () => validateHarnessTurnResult(
        terminalResult({ finalMessage: null, finalMessageAbsenceReason: null }),
        driver,
      ),
      /final outer-assistant message or an explicit absence reason/,
    );
    assert.throws(
      () => validateHarnessTurnResult(
        terminalResult({ failure: { class: "fatal", reason: "x", resumable: false } }),
        driver,
      ),
      /completed Harness turn must not classify a failure/,
    );
    // A failed turn with no assistant text is valid when it says why.
    assert.ok(validateHarnessTurnResult(terminalResult({
      status: "failed",
      exitStatus: 1,
      sessionExactness: "unproven",
      nativeSession: null,
      failure: {
        class: "usage_or_subscription_limit",
        reason: "quota exhausted",
        resumable: false,
        requiresAttention: false,
      },
      finalMessage: null,
      finalMessageAbsenceReason: "usage_or_subscription_limit",
    }), driver));
  });

  it("closes the turn-failure vocabulary: every admitted class is accepted, a foreign class is rejected", () => {
    for (const failureClass of HARNESS_TURN_FAILURE_CLASSES) {
      assert.ok(validateHarnessTurnResult(terminalResult({
        status: "failed",
        exitStatus: 1,
        sessionExactness: "unproven",
        nativeSession: null,
        failure: { class: failureClass, reason: "x", resumable: false },
        finalMessage: null,
        finalMessageAbsenceReason: failureClass,
      }), driver), `${failureClass} must be admitted`);
    }
    assert.throws(
      () => validateHarnessTurnResult(terminalResult({
        status: "failed",
        exitStatus: 1,
        failure: { class: "not_an_admitted_class", reason: "x", resumable: false },
        finalMessage: null,
        finalMessageAbsenceReason: "not_an_admitted_class",
      }), driver),
      /is not an admitted turn-failure class/,
    );
  });

  it("rejects a supervisor-owned fact claimed as a Driver turn-failure class", () => {
    for (const supervisorFact of [
      "worker_launch_failed",
      "worker_handoff_failed",
      "worker_reaped",
      "session_binding_conflict",
      "forced_interruption_unflushed",
      "harness_incompatible",
    ]) {
      assert.throws(
        () => validateHarnessTurnResult(terminalResult({
          status: "failed",
          exitStatus: 1,
          failure: { class: supervisorFact, reason: "x", resumable: false },
          finalMessage: null,
          finalMessageAbsenceReason: supervisorFact,
        }), driver),
        /is not an admitted turn-failure class/,
        `${supervisorFact} is a supervisor-owned fact and must not be admitted as a Driver class`,
      );
    }
  });

  it("declares an explicit blocking scope for every admitted class, closed over harness/agent", () => {
    assert.equal(HARNESS_TURN_FAILURE_SCOPES.auth_or_permission, "harness");
    assert.equal(HARNESS_TURN_FAILURE_SCOPES.usage_or_subscription_limit, "harness");
    assert.equal(HARNESS_TURN_FAILURE_SCOPES.protocol_session_drift, "agent");
    for (const scope of Object.values(HARNESS_TURN_FAILURE_SCOPES)) {
      assert.ok(scope === "harness" || scope === "agent");
    }
  });

  it("runs the production supervisor boundary from normalized fields without reading native receipts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-harness-generic-turn-"));
    scratchRoots.push(root);
    const workspace = path.join(root, "workspace");
    const claudeConfigDir = path.join(root, "claude");
    fs.mkdirSync(workspace);
    fs.mkdirSync(claudeConfigDir);
    const runtime = createInternalClaudeRuntime({
      cwd: workspace,
      envFile: testEnvFile,
      env: {
        CODEX_THREAD_ID: "root-harness-generic-turn",
        CC_RUNTIME_HOME: sharedRuntimeHome,
        CC_RUNTIME_CHECKOUT: "",
        CLAUDE_CONFIG_DIR: claudeConfigDir,
      },
    });
    const capabilities = Object.freeze({
      ...CLAUDE_CODE_CAPABILITIES,
      activeInput: "initial_only",
      continuation: "fresh_only",
      history: "unavailable",
      interrupt: "unsupported",
      automaticRecovery: "none",
      nativeOrchestration: "disabled",
    });
    const launchContext = Object.freeze({ opaque: "test-launch-context" });
    const fakeDriver = validateHarnessDriver(Object.freeze({
      harnessId: "test-harness",
      driverVersion: "test-harness@1",
      contractVersion: HARNESS_DRIVER_CONTRACT_VERSION,
      capabilities,
      preflight: () => ({ ready: true, instanceKey: "tenant:alpha" }),
      describeUnreadiness: () => null,
      validatePreparedPreflight: (receipt) => receipt,
      revalidatePreparedPreflight: () => launchContext,
      validateRoute: (route) => route,
      resolveInstanceKey: () => "tenant:alpha",
      async startTurn(args) {
        assert.equal(args.launchContext, launchContext);
        assert.equal(Object.hasOwn(args, "executable"), false);
        assert.equal(Object.hasOwn(args, "launchCompatibility"), false);
        return {
          harnessId: "test-harness",
          driverVersion: "test-harness@1",
          contractVersion: HARNESS_DRIVER_CONTRACT_VERSION,
          status: "completed",
          exitStatus: 0,
          nativeSession: {
            harnessId: "test-harness",
            instanceKey: "tenant:alpha",
            nativeSessionId: "native-session-1",
          },
          sessionExactness: "unproven",
          failure: {
            class: null,
            reason: null,
            detail: null,
            resumable: false,
            requiresAttention: false,
          },
          finalMessage: "generic final message",
          finalMessageAbsenceReason: null,
          process: { spawnAccepted: true, identityProven: true },
          receipts: {
            toolUses: [],
            touchedFiles: [],
            attempts: [],
            recoveryAttempts: 0,
            steering: null,
          },
          runtime: { providerVersion: "test-1" },
          nativeReceipt: { mustRemainOpaque: true },
          driverReceipt: boundedDriverReceipt("test-harness", "test-harness@1", {
            privateEvidence: true,
          }),
        };
      },
      assignInput: () => ({ delivered: false }),
      interruptTurn: () => false,
      cancelTurn: () => false,
    }));
    runtime.driver = fakeDriver;
    runtime.harnessInstance = Object.freeze({ harnessId: "test-harness", instanceKey: "tenant:alpha" });

    const execution = await runtime.execute({
      id: "generic-turn-job",
      summary: "generic turn",
      harnessStateVersion: 2,
      harnessId: "test-harness",
      driverVersion: "test-harness@1",
      harnessCapabilities: capabilities,
      request: { prompt: "do the work", model: "test-model", effort: "high" },
    }, null, null, launchContext);

    assert.equal(execution.threadId, "native-session-1");
    assert.equal(execution.payload.rawOutput, "generic final message");
    assert.equal(execution.payload.runtimeReceipt.providerVersion, "test-1");
    assert.equal(Object.hasOwn(execution.payload, "mustRemainOpaque"), false);
  });

  it("keeps native session identity compatible for Claude and disjoint across Harnesses", () => {
    const reference = canonicalNativeSessionRef({
      harnessId: CLAUDE_CODE_HARNESS_ID,
      instanceKey: "/data/.claude",
      nativeSessionId: "abc-123",
    });
    // Version-1 runtimes derive sha256("<config dir>\0<session>"). Pin that
    // formula literally: the version-2 key must stay byte-identical so an old
    // runtime still observes the lease instead of stealing the live session.
    const legacy = createHash("sha256").update("/data/.claude\0abc-123").digest("hex");
    assert.equal(harnessSessionKey(reference), legacy);
    assert.notEqual(
      harnessSessionKey({ ...reference, harnessId: "other-exec" }),
      legacy,
    );
    assert.notEqual(
      harnessSessionKey({ ...reference, instanceKey: "/other/.claude" }),
      legacy,
    );
    assert.throws(
      () => canonicalNativeSessionRef({ ...reference, nativeSessionId: "../escape" }),
      /Invalid native session ID/,
    );
  });

  it("bounds opaque Driver receipts", () => {
    const small = boundedDriverReceipt(CLAUDE_CODE_HARNESS_ID, CLAUDE_CODE_DRIVER_VERSION, { attempts: 2 });
    assert.deepEqual(small.receipt, { attempts: 2 });
    const huge = boundedDriverReceipt(CLAUDE_CODE_HARNESS_ID, CLAUDE_CODE_DRIVER_VERSION, {
      blob: "x".repeat(32 * 1024),
    });
    assert.equal(huge.receipt, null);
    assert.equal(huge.omitted, "driver_receipt_exceeded_bound");
  });

  it("binds a durable turn to the contract that prepared it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-harness-job-driver-"));
    scratchRoots.push(root);
    const workspace = path.join(root, "workspace");
    const claudeConfigDir = path.join(root, "claude");
    fs.mkdirSync(workspace);
    fs.mkdirSync(claudeConfigDir);
    const runtime = createInternalClaudeRuntime({
      cwd: workspace,
      envFile: testEnvFile,
      env: {
        CODEX_THREAD_ID: "root-harness-job-driver",
        CC_RUNTIME_HOME: sharedRuntimeHome,
        CC_RUNTIME_CHECKOUT: "",
        CC_RUNTIME_SOURCE_ROOT: "",
        CLAUDE_CONFIG_DIR: claudeConfigDir,
      },
    });
    const prepared = {
      id: "cc-job-1",
      harnessStateVersion: 2,
      harnessId: CLAUDE_CODE_HARNESS_ID,
      driverVersion: CLAUDE_CODE_DRIVER_VERSION,
      harnessCapabilities: CLAUDE_CODE_CAPABILITIES,
    };
    assert.equal(runtime.assertJobDriver(prepared).harnessId, "claude-code");
    // A version-1 job predates Harness evidence and stays executable.
    assert.equal(runtime.assertJobDriver({ id: "cc-legacy" }).harnessId, "claude-code");

    assert.throws(
      () => runtime.assertJobDriver({ ...prepared, harnessStateVersion: 3 }),
      /carries Harness state version 3/,
    );
    assert.throws(
      () => runtime.assertJobDriver({ ...prepared, harnessId: "other-exec" }),
      /Unknown Harness other-exec/,
    );
    assert.throws(
      () => runtime.assertJobDriver({ ...prepared, driverVersion: "claude-code@0" }),
      /prepared by Driver claude-code@0/,
    );
    assert.throws(
      () => runtime.assertJobDriver({
        ...prepared,
        harnessCapabilities: { ...CLAUDE_CODE_CAPABILITIES, continuation: "fresh_only" },
      }),
      /prepared with continuation=fresh_only/,
    );
    assert.throws(
      () => runtime.assertJobDriver({
        ...prepared,
        harnessCapabilities: { ...CLAUDE_CODE_CAPABILITIES, continuation: "sometimes" },
      }),
      /unsupported continuation value/,
    );

    // Stopping a live turn stays possible across a Driver version bump; an
    // unknown capability vocabulary still fails closed.
    const drifted = { ...prepared, driverVersion: "claude-code@0" };
    assert.equal(runtime.assertJobDriver(drifted, { allowDriverVersionDrift: true }).harnessId, "claude-code");
    assert.throws(
      () => runtime.assertJobDriver(
        { ...drifted, harnessCapabilities: { ...CLAUDE_CODE_CAPABILITIES, interrupt: "eventually" } },
        { allowDriverVersionDrift: true },
      ),
      /unsupported interrupt value/,
    );
    assert.throws(
      () => runtime.assertJobDriver(
        { ...drifted, harnessId: "other-exec" },
        { allowDriverVersionDrift: true },
      ),
      /Unknown Harness other-exec/,
    );
  });

  it("refuses durable Agent activation after Driver version or capability drift", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-harness-agent-driver-"));
    scratchRoots.push(root);
    const workspace = path.join(root, "workspace");
    const claudeConfigDir = path.join(root, "claude");
    fs.mkdirSync(workspace);
    fs.mkdirSync(claudeConfigDir);
    const runtime = createAgentRuntime({
      cwd: workspace,
      envFile: testEnvFile,
      env: {
        CODEX_THREAD_ID: "root-harness-agent-driver",
        CC_RUNTIME_HOME: sharedRuntimeHome,
        CC_RUNTIME_CHECKOUT: "",
        CLAUDE_CONFIG_DIR: claudeConfigDir,
      },
    });
    const agent = runtime.store.createAgent({
      task_name: "driver_drift",
      selectedModel: "claude-sonnet-5",
      delegationMode: "leaf",
    });

    runtime.jobs.driver = Object.freeze({
      ...runtime.jobs.driver,
      driverVersion: "claude-code@future",
    });
    assert.throws(
      () => runtime.assertAgentDriver(runtime.store.resolveTarget(agent.agentId)),
      /accepted Driver .* but this runtime provides claude-code@future/,
    );
    assert.equal(
      runtime.assertAgentDriver(
        runtime.store.resolveTarget(agent.agentId),
        { allowDriverVersionDrift: true },
      ).harnessId,
      "claude-code",
    );

    runtime.jobs.driver = Object.freeze({
      ...runtime.jobs.driver,
      driverVersion: agent.driverVersion,
      capabilities: Object.freeze({
        ...runtime.jobs.driver.capabilities,
        continuation: "fresh_only",
      }),
    });
    assert.throws(
      () => runtime.assertAgentDriver(runtime.store.resolveTarget(agent.agentId)),
      /accepted continuation=exact_resume but this runtime provides continuation=fresh_only/,
    );
  });

  it("fences version-2 jobs from a version-1 worker before launch", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-harness-v1-worker-fence-"));
    scratchRoots.push(root);
    const workspace = path.join(root, "workspace");
    const claudeConfigDir = path.join(root, "claude");
    fs.mkdirSync(workspace);
    fs.mkdirSync(claudeConfigDir);
    const runtime = createInternalClaudeRuntime({
      cwd: workspace,
      envFile: testEnvFile,
      env: {
        CODEX_THREAD_ID: "root-harness-v1-worker-fence",
        CC_RUNTIME_HOME: sharedRuntimeHome,
        CC_RUNTIME_CHECKOUT: "",
        CLAUDE_CONFIG_DIR: claudeConfigDir,
      },
    });
    const readiness = {
      ready: true,
      availability: { available: true },
      compatibility: {
        staticCompatible: true,
        fingerprint: "test-fingerprint",
        executable: process.execPath,
        version: "test",
      },
      auth: { loggedIn: true },
      cwd: runtime.cwd,
      claudeConfigDir: runtime.env.CLAUDE_CONFIG_DIR ?? null,
      sourceRoot: runtime.sourceRoot,
    };
    const prepared = runtime.prepareStart("fenced turn", {
      readinessReceipt: readiness,
      jobId: "harness-v2-fence",
      model: "haiku",
      effort: "low",
    });
    const stored = readJobFile(workspace, prepared.jobId);
    assert.equal(stored.harnessStateVersion, 2);
    // The pre-Harness worker accepts only literal `queued`; this state is the
    // wire-level rollback fence, not merely advisory metadata.
    assert.equal(stored.status, "harness_queued");
  });

  it("keeps model-facing wait cadence and progress budget out of the Driver contract", () => {
    // Drivers report progress through the turn's receipts; polling cadence,
    // delivery budget, and completion priority stay with the supervisor.
    assert.deepEqual(HARNESS_DRIVER_OPERATIONS, [
      "preflight",
      "describeUnreadiness",
      "validatePreparedPreflight",
      "revalidatePreparedPreflight",
      "validateRoute",
      "resolveInstanceKey",
      "startTurn",
      "assignInput",
      "interruptTurn",
      "cancelTurn",
    ]);
    for (const name of Object.keys(driver)) {
      assert.doesNotMatch(name, /wait|progress|poll|timeout|budget/i);
    }
  });
});

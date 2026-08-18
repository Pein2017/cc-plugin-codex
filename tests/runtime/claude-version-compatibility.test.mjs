import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  assertPreparedClaudeCompatibility,
  diagnoseClaudeCompatibility,
  inspectClaudeCompatibility,
  inspectNativeTeamCompatibility,
  recordNativeTeamCompatibilityObservation,
  recordSuccessfulClaudeTurn,
  REQUIRED_CLAUDE_OPTIONS,
  REQUIRED_CLAUDE_VALUES,
} from "../../runtime/claude-version-compatibility.mjs";
import { createInternalAgentRuntime } from "../../runtime/internal-runtime.mjs";
import {
  classifyJobRecoverability,
  getConfig,
  readJobFile,
} from "../../runtime/job-store.mjs";

const priorRuntimeHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
const roots = [];

afterEach(() => {
  if (priorRuntimeHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = priorRuntimeHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-claude-compat-"));
  const workspace = path.join(root, "workspace");
  const executable = path.join(root, "claude");
  fs.mkdirSync(workspace);
  fs.writeFileSync(executable, "fake-v1\n", { mode: 0o755 });
  process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = path.join(root, "runtime-home");
  roots.push(root);
  return { workspace, executable };
}

function helpText({ omit = null } = {}) {
  return [
    ...REQUIRED_CLAUDE_OPTIONS.filter((value) => value !== omit),
    ...REQUIRED_CLAUDE_VALUES.filter((value) => `value:${value}` !== omit),
  ].join(" ");
}

function fakeCommands(options = {}) {
  const calls = [];
  const command = (_executable, args) => {
    calls.push([...args]);
    if (args[0] === "--version") {
      return { status: 0, stdout: `${options.version ?? "2.1.220"} (Claude Code)\n`, stderr: "" };
    }
    if (args[0] === "--help") {
      if (options.helpFailure) {
        return { status: 1, stdout: "", stderr: "help unavailable" };
      }
      return { status: 0, stdout: helpText({ omit: options.omit }), stderr: "" };
    }
    throw new Error(`unexpected fake command ${args.join(" ")}`);
  };
  return { calls, command };
}

function availability(executable, version = "2.1.220") {
  return {
    available: true,
    detail: `${version} (Claude Code)`,
    executable,
  };
}

function replaceExecutable(executable, marker) {
  fs.writeFileSync(executable, `${marker}\n`, { mode: 0o755 });
  const future = new Date(Date.now() + 2_000);
  fs.utimesSync(executable, future, future);
}

function writeFakeClaude(executable, launchMarker, marker) {
  fs.writeFileSync(executable, `#!/bin/sh
# ${marker}
case "$1" in
  --version)
    echo "2.1.220 (Claude Code)"
    ;;
  --help)
    echo '${helpText()}'
    ;;
  -p)
    echo launched > '${launchMarker}'
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`, { mode: 0o755 });
  const future = new Date(Date.now() + 2_000);
  fs.utimesSync(executable, future, future);
}

describe("Claude Code version compatibility", () => {
  it("retains only bounded sanitized native-team observations and evicts oldest non-current evidence", () => {
    const { workspace } = setup();
    for (let index = 0; index < 17; index += 1) {
      recordNativeTeamCompatibilityObservation(workspace, {
        fingerprint: `fingerprint-${String(index).padStart(2, "0")}`,
      }, "claude_orchestrator", {
        canonicalToolNames: ["Agent", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
        definitionNames: ["haiku-scout", "sonnet", "opus"],
        prompt: "prompt-sentinel",
        toolInput: "tool-input-sentinel",
        output: "output-sentinel",
        sessionId: "session-sentinel",
        roster: ["roster-sentinel"],
        modelMessage: "model-message-sentinel",
        memory: "memory-sentinel",
      }, {
        observedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
    }

    const stored = getConfig(workspace).claudeCliCompatibility.nativeTeamObservations;
    assert.equal(stored.length, 16);
    assert.equal(stored.some((entry) => entry.fingerprint === "fingerprint-00"), false);
    assert.equal(stored.some((entry) => entry.fingerprint === "fingerprint-16"), true);
    const serialized = JSON.stringify(getConfig(workspace).claudeCliCompatibility);
    for (const sentinel of [
      "prompt-sentinel",
      "tool-input-sentinel",
      "output-sentinel",
      "session-sentinel",
      "roster-sentinel",
      "model-message-sentinel",
      "memory-sentinel",
    ]) assert.doesNotMatch(serialized, new RegExp(sentinel));
  });

  it("fails closed for legacy native-team records instead of promoting them to live validation", async () => {
    const { workspace } = setup();
    const current = getConfig(workspace);
    const { mutateConfig } = await import("../../runtime/job-store.mjs");
    mutateConfig(workspace, (config) => ({
      ...current,
      ...config,
      claudeCliCompatibility: {
        nativeTeamObservations: [{
          fingerprint: "legacy-fingerprint",
          delegationMode: "claude_orchestrator",
          denySetLiveValidated: true,
          prompt: "legacy-prompt-sentinel",
        }],
      },
    }));

    const stored = inspectNativeTeamCompatibility(workspace, "legacy-fingerprint");
    assert.deepEqual(stored.observations, []);
    assert.equal(stored.legacyObservationCount, 1);
  });

  it("rejects a forged stored leaf classification that omits its observed Agent denial", async () => {
    const { workspace } = setup();
    recordNativeTeamCompatibilityObservation(workspace, { fingerprint: "forged-fingerprint" }, "leaf", {
      canonicalToolNames: ["Read"],
      definitionNames: [],
    });
    const { mutateConfig } = await import("../../runtime/job-store.mjs");
    mutateConfig(workspace, (config) => ({
      ...config,
      claudeCliCompatibility: {
        ...config.claudeCliCompatibility,
        nativeTeamObservations: config.claudeCliCompatibility.nativeTeamObservations.map((observation) => ({
          ...observation,
          classification: {
            ...observation.classification,
            canonicalToolNames: ["Agent"],
            canonicalToolNameCount: 1,
            forbiddenTools: [],
            denySetLiveValidated: true,
          },
        })),
      },
    }));

    const stored = inspectNativeTeamCompatibility(workspace, "forged-fingerprint");
    assert.deepEqual(stored.observations, []);
    assert.equal(stored.legacyObservationCount, 1);
  });

  it("rejects a stored non-boolean observed flag instead of treating it as inventory evidence", async () => {
    const { workspace } = setup();
    recordNativeTeamCompatibilityObservation(workspace, { fingerprint: "observed-flag-fingerprint" }, "leaf", {
      canonicalToolNames: ["Read"],
      definitionNames: [],
    });
    const { mutateConfig } = await import("../../runtime/job-store.mjs");
    mutateConfig(workspace, (config) => ({
      ...config,
      claudeCliCompatibility: {
        ...config.claudeCliCompatibility,
        nativeTeamObservations: config.claudeCliCompatibility.nativeTeamObservations.map((observation) => ({
          ...observation,
          classification: { ...observation.classification, observed: "false" },
        })),
      },
    }));

    assert.deepEqual(
      inspectNativeTeamCompatibility(workspace, "observed-flag-fingerprint").observations,
      [],
    );
  });

  it("classifies a forbidden name before truncating the retained inventory", () => {
    const { workspace } = setup();
    const toolNames = Array.from({ length: 70 }, (_, index) => `FutureTool${String(index).padStart(2, "0")}`);
    toolNames.push("ListAgents");
    recordNativeTeamCompatibilityObservation(workspace, { fingerprint: "capped-fingerprint" }, "claude_orchestrator", {
      canonicalToolNames: toolNames,
      definitionNames: ["haiku-scout", "sonnet", "opus"],
    });
    const [observation] = inspectNativeTeamCompatibility(workspace, "capped-fingerprint").observations;
    assert.equal(observation.classification.canonicalToolNames.length, 64);
    assert.deepEqual(observation.classification.forbiddenTools, ["ListAgents"]);
    assert.equal(observation.classification.denySetLiveValidated, false);
  });

  it("diagnoses the required surface without persisting readiness state", () => {
    const { workspace, executable } = setup();
    const fake = fakeCommands();
    const receipt = diagnoseClaudeCompatibility(workspace, {
      availability: availability(executable),
      spawnSyncImpl: fake.command,
    });
    assert.equal(receipt.status, "statically-compatible");
    assert.equal(receipt.staticCompatible, true);
    assert.equal(fs.existsSync(process.env.CODEX_HARNESSDOCK_RUNTIME_HOME), false);
    assert.equal(fake.calls.filter(([arg]) => arg === "--help").length, 1);
  });

  it("checks a new fingerprint once, caches it, and records a successful real turn", () => {
    const { workspace, executable } = setup();
    const fake = fakeCommands();
    const first = inspectClaudeCompatibility(workspace, {
      availability: availability(executable),
      spawnSyncImpl: fake.command,
    });
    assert.equal(first.status, "static_only");
    assert.equal(first.staticCompatible, true);
    assert.equal(fake.calls.filter(([arg]) => arg === "--help").length, 1);

    const second = inspectClaudeCompatibility(workspace, {
      availability: availability(executable),
      spawnSyncImpl: fake.command,
    });
    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal(fake.calls.filter(([arg]) => arg === "--help").length, 1);

    const observed = recordSuccessfulClaudeTurn(workspace, first, "2.1.220", {
      executable,
      spawnSyncImpl: fake.command,
    });
    assert.equal(observed.recorded, true);
    assert.equal(observed.compatibility.status, "observed_working");
    assert.equal(observed.compatibility.lastSuccessfulVersion, "2.1.220");
  });

  it("rechecks an in-place update and keeps prior successful evidence", () => {
    const { workspace, executable } = setup();
    const v1 = fakeCommands({ version: "2.1.220" });
    const admitted = inspectClaudeCompatibility(workspace, {
      availability: availability(executable, "2.1.220"),
      spawnSyncImpl: v1.command,
    });
    recordSuccessfulClaudeTurn(workspace, admitted, "2.1.220", {
      executable,
      spawnSyncImpl: v1.command,
    });

    replaceExecutable(executable, "fake-v2");
    const v2 = fakeCommands({ version: "2.1.221" });
    const updated = inspectClaudeCompatibility(workspace, {
      availability: availability(executable, "2.1.221"),
      spawnSyncImpl: v2.command,
    });
    assert.equal(updated.status, "static_only");
    assert.equal(updated.version, "2.1.221");
    assert.notEqual(updated.fingerprint, admitted.fingerprint);
    assert.equal(updated.lastSuccessfulVersion, "2.1.220");
  });

  it("fails closed on missing surface while retaining last compatible evidence", () => {
    const { workspace, executable } = setup();
    const v1 = fakeCommands();
    const admitted = inspectClaudeCompatibility(workspace, {
      availability: availability(executable),
      spawnSyncImpl: v1.command,
    });
    recordSuccessfulClaudeTurn(workspace, admitted, "2.1.220", {
      executable,
      spawnSyncImpl: v1.command,
    });

    replaceExecutable(executable, "missing-effort");
    const broken = fakeCommands({ version: "2.1.221", omit: "--effort" });
    const receipt = inspectClaudeCompatibility(workspace, {
      availability: availability(executable, "2.1.221"),
      spawnSyncImpl: broken.command,
    });
    assert.equal(receipt.staticCompatible, false);
    assert.deepEqual(receipt.missingSurface, ["--effort"]);
    assert.equal(receipt.lastStaticallyCompatibleVersion, "2.1.220");
    assert.equal(receipt.lastSuccessfulVersion, "2.1.220");
  });

  it("reports probe failure and rejects a fingerprint changed after preparation", () => {
    const { workspace, executable } = setup();
    const failing = fakeCommands({ helpFailure: true });
    const failed = inspectClaudeCompatibility(workspace, {
      availability: availability(executable),
      spawnSyncImpl: failing.command,
    });
    assert.equal(failed.staticCompatible, false);
    assert.equal(failed.failureCode, "help_probe_failed");
    assert.equal(Object.hasOwn(failed, "detail"), false);
    assert.equal(Object.hasOwn(failed, "versionText"), false);
    const persistedEvidence = JSON.stringify(getConfig(workspace).claudeCliCompatibility);
    assert.doesNotMatch(persistedEvidence, /help unavailable|versionText|detail/);
    assert.equal(REQUIRED_CLAUDE_OPTIONS.includes("--session-id"), false);
    assert.equal(REQUIRED_CLAUDE_OPTIONS.includes("--append-system-prompt"), true);
    assert.equal(REQUIRED_CLAUDE_OPTIONS.includes("--disallowedTools"), true);
    assert.equal(REQUIRED_CLAUDE_OPTIONS.includes("--agents"), true);

    replaceExecutable(executable, "repaired-v1");
    const v1 = fakeCommands({ version: "2.1.221" });
    const admitted = inspectClaudeCompatibility(workspace, {
      availability: availability(executable, "2.1.221"),
      spawnSyncImpl: v1.command,
    });
    replaceExecutable(executable, "new-v2");
    const v2 = fakeCommands({ version: "2.1.222" });
    assert.throws(
      () => assertPreparedClaudeCompatibility(workspace, admitted, {
        availability: availability(executable, "2.1.222"),
        spawnSyncImpl: v2.command,
      }),
      /changed after job preparation/,
    );
  });

  it("does not record observed-working after a same-version executable replacement", () => {
    const { workspace, executable } = setup();
    const fake = fakeCommands({ version: "2.1.220" });
    const admitted = inspectClaudeCompatibility(workspace, {
      availability: availability(executable),
      spawnSyncImpl: fake.command,
    });

    replaceExecutable(executable, "same-version-replacement");
    const observation = recordSuccessfulClaudeTurn(workspace, admitted, "2.1.220", {
      executable,
      spawnSyncImpl: fake.command,
    });

    assert.equal(observation.recorded, false);
    assert.equal(observation.reason, "post_turn_fingerprint_changed");
    assert.equal(observation.compatibility.status, "static_only");
    assert.equal(observation.compatibility.lastSuccessfulVersion, null);
  });

  it("fails a detached worker pre-Claude when its prepared fingerprint drifts", async () => {
    const { workspace, executable } = setup();
    const root = path.dirname(executable);
    const claudeConfigDir = path.join(root, ".claude");
    const envFile = path.join(root, "runtime.env");
    const launchMarker = path.join(root, "claude-p-invoked");
    fs.mkdirSync(claudeConfigDir);
    writeFakeClaude(executable, launchMarker, "prepared");
    fs.writeFileSync(envFile, [
      `CLAUDE_CONFIG_DIR=${claudeConfigDir}`,
      `CODEX_HARNESSDOCK_CLAUDE_BIN=${executable}`,
      "",
    ].join("\n"));
    const runtime = createInternalAgentRuntime({
      cwd: workspace,
      envFile,
      env: {
        CODEX_THREAD_ID: "root-compat-worker-drift",
        CODEX_HARNESSDOCK_RUNTIME_HOME: process.env.CODEX_HARNESSDOCK_RUNTIME_HOME,
        ANTHROPIC_API_KEY: "test-only",
      },
    });
    const readiness = runtime.readiness();
    assert.equal(readiness.ready, true);
    const prepared = runtime.prepareStart("must never reach stdin", {
      harnessId: runtime.driver.harnessId,
      readinessReceipt: readiness,
      jobId: "compat-worker-drift",
      model: "haiku",
      effort: "low",
    });

    writeFakeClaude(executable, launchMarker, "same-version-replacement");
    await assert.rejects(
      runtime.runWorker(prepared.jobId),
      /changed after job preparation/,
    );

    const terminal = readJobFile(workspace, prepared.jobId);
    assert.equal(fs.existsSync(launchMarker), false);
    assert.equal(terminal.status, "failed");
    assert.equal(terminal.preClaudeLaunch, true);
    assert.equal(terminal.safeFreshRetry, true);
    assert.equal(terminal.pid, null);
    assert.equal(classifyJobRecoverability(terminal).mode, "safe_fresh");
  });
});

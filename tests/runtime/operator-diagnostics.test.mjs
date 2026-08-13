import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  diagnoseNativeTeamCompatibility,
  inspectOperatorStorage,
  runDoctor,
} from "../../runtime/operator-diagnostics.mjs";
import {
  finalizeCompatibilityInstall,
  prepareCompatibilityInstall,
} from "../../runtime/plugin-compatibility-shells.mjs";
import { PACKAGE_VERSION, SOURCE_ROOT } from "../../runtime/version.mjs";

const temporaryDirectories = [];

function temporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

describe("operator storage diagnosis", () => {
  it("reports aggregate control state and conservative dry-run candidates without changing files", () => {
    const root = temporaryDirectory("cc-doctor-storage-");
    const pluginDataRoot = path.join(root, "cc");
    const workspace = path.join(pluginDataRoot, "state", "workspace");
    const jobsDirectory = path.join(workspace, "jobs");
    const owner = "owner-root";
    const events = [];
    for (let index = 0; index < 102; index += 1) {
      const id = `job-${String(index).padStart(3, "0")}`;
      writeJson(path.join(jobsDirectory, `${id}.json`), {
        id,
        status: "completed",
        ownerRootId: owner,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
      events.push({ jobId: id, sequence: index + 1 });
    }
    writeJson(path.join(workspace, "agent-registry", "roots", "owner", "registry.json"), {
      agents: {
        a: { status: "completed" },
        b: { status: "errored" },
      },
    });
    writeJson(path.join(workspace, "completion-inboxes", "owner", "inbox.json"), {
      acknowledgedThrough: 100,
      events,
    });
    const reservation = path.join(jobsDirectory, "stale.reserve");
    fs.writeFileSync(reservation, "");
    const old = new Date("2026-01-01T00:00:00.000Z");
    fs.utimesSync(reservation, old, old);

    const claudeConfigDir = path.join(root, ".claude");
    const oldHistory = path.join(claudeConfigDir, "projects", "project", "old.jsonl");
    const newHistory = path.join(claudeConfigDir, "projects", "project", "new.jsonl");
    fs.mkdirSync(path.dirname(oldHistory), { recursive: true });
    fs.writeFileSync(oldHistory, "{}\n");
    fs.writeFileSync(newHistory, "{}\n");
    fs.utimesSync(oldHistory, old, old);
    const before = fs.statSync(path.join(jobsDirectory, "job-000.json")).mtimeMs;

    const report = inspectOperatorStorage({
      pluginDataRoot,
      claudeConfigDir,
      nowMs: Date.parse("2026-07-28T00:00:00.000Z"),
      env: { CODEX_HOME: root },
    });

    assert.equal(report.readOnly, true);
    assert.equal(report.runtime.agents, 2);
    assert.deepEqual(report.runtime.agentStatuses, { completed: 1, errored: 1 });
    assert.equal(report.runtime.jobs, 102);
    assert.equal(report.runtime.completionEvents, 102);
    assert.equal(report.runtime.unreadCompletionEvents, 2);
    assert.equal(report.cleanup.dryRun, true);
    assert.equal(report.cleanup.candidateCount, 3);
    assert.equal(report.cleanup.candidates.filter((entry) => entry.reason === "terminal-job-beyond-owner-retention").length, 2);
    assert.equal(report.claudeHistory.sessionFiles, 2);
    assert.equal(report.claudeHistory.olderThanObservationWindow, 1);
    assert.equal(report.claudeHistory.pluginCleanupCandidates, 0);
    assert.equal(fs.statSync(path.join(jobsDirectory, "job-000.json")).mtimeMs, before);
  });

  it("counts malformed records without rewriting them", () => {
    const root = temporaryDirectory("cc-doctor-malformed-");
    const malformed = path.join(root, "state", "workspace", "jobs", "broken.json");
    fs.mkdirSync(path.dirname(malformed), { recursive: true });
    fs.writeFileSync(malformed, "not-json\n");
    const before = fs.readFileSync(malformed, "utf8");
    const report = inspectOperatorStorage({
      pluginDataRoot: root,
      claudeConfigDir: path.join(root, ".claude"),
    });
    assert.equal(report.runtime.malformedRecords, 1);
    assert.equal(fs.readFileSync(malformed, "utf8"), before);
  });
});

describe("operator doctor", () => {
  it("projects scoped native-team evidence without universal-containment or content leakage", async () => {
    const root = temporaryDirectory("cc-doctor-native-surface-");
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    const previous = process.env.CC_RUNTIME_HOME;
    process.env.CC_RUNTIME_HOME = path.join(root, "runtime-home");
    try {
      const { recordNativeTeamCompatibilityObservation } = await import("../../runtime/claude-version-compatibility.mjs");
      recordNativeTeamCompatibilityObservation(workspace, { fingerprint: "doctor-fingerprint" }, "claude_orchestrator", {
        canonicalToolNames: ["Task", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate", "FutureNativeTool"],
        definitionNames: ["haiku-scout", "sonnet"],
        teamTransportLiveValidated: false,
        prompt: "doctor-prompt-sentinel",
        memory: "doctor-memory-sentinel",
      });
      const report = diagnoseNativeTeamCompatibility(workspace, "doctor-fingerprint");
      const lead = report.modes.find((mode) => mode.delegationMode === "claude_orchestrator");
      assert.equal(lead.denySetLiveValidated, true);
      assert.equal(lead.teamTransportLiveValidated, false);
      assert.equal(lead.observed, true);
      assert.deepEqual(lead.canonicalToolNames, ["Agent", "FutureNativeTool", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"]);
      assert.equal(lead.canonicalToolNameCount, 7);
      assert.deepEqual(lead.definitionNames, ["haiku-scout", "sonnet"]);
      assert.ok(lead.reviewedForbiddenToolNames.includes("ListAgents"));
      assert.deepEqual(lead.missingDefinitions, ["opus"]);
      assert.deepEqual(lead.missingNecessaryCoordinationTools, []);
      assert.deepEqual(lead.forbiddenTools, []);
      assert.deepEqual(lead.unknownNativeTools, ["FutureNativeTool"]);
      assert.match(lead.summary, /reviewed deny-set validation/i);
      assert.match(lead.summary, /named-team transport proof/i);
      assert.doesNotMatch(JSON.stringify(report), /universal containment|doctor-prompt-sentinel|doctor-memory-sentinel/i);

      const noObservation = diagnoseNativeTeamCompatibility(workspace, "other-fingerprint");
      assert.equal(noObservation.modes.every((mode) => mode.denySetLiveValidated === false), true);
      const noCurrentFingerprint = diagnoseNativeTeamCompatibility(workspace, null);
      assert.equal(noCurrentFingerprint.modes.every((mode) => mode.observed === false), true);
      assert.equal(noCurrentFingerprint.modes.every((mode) => mode.canonicalToolNames.length === 0), true);
    } finally {
      if (previous == null) delete process.env.CC_RUNTIME_HOME;
      else process.env.CC_RUNTIME_HOME = previous;
    }
  });

  it("returns redacted health across a matching synthetic installation", async () => {
    const codexHome = temporaryDirectory("cc-doctor-codex-home-");
    const pluginRoot = path.join(SOURCE_ROOT, "plugins", "cc-for-pein");
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
    const snapshotRoot = path.join(
      codexHome,
      "plugins",
      "cache",
      "pein-local",
      "cc-for-pein",
      manifest.version,
    );
    fs.mkdirSync(path.dirname(snapshotRoot), { recursive: true });
    fs.cpSync(pluginRoot, snapshotRoot, { recursive: true });
    const coveragePlan = prepareCompatibilityInstall({
      codexHome,
      requestedVersion: manifest.version,
    });
    finalizeCompatibilityInstall({ plan: coveragePlan, installedSnapshotRoot: snapshotRoot });
    const secretEmail = "private@example.invalid";
    const fakeSpawn = (command, args) => {
      if (args.join(" ") === "plugin list --json") {
        return {
          status: 0,
          stdout: JSON.stringify({
            installed: [{
              pluginId: "cc-for-pein@pein-local",
              name: "cc-for-pein",
              marketplaceName: "pein-local",
              version: manifest.version,
              enabled: true,
              source: { source: "local", path: pluginRoot },
            }],
          }),
          stderr: "",
        };
      }
      if (args[0] === "--version") {
        return { status: 0, stdout: "2.1.220 (Claude Code)\n", stderr: "" };
      }
      if (args[0] === "--help") {
        return {
          status: 0,
          stdout: [
            "-p", "--output-format", "--verbose", "--include-partial-messages",
            "--input-format", "--replay-user-messages", "--include-hook-events", "--name",
            "--model", "--effort", "--resume", "--allowedTools", "--disallowedTools",
            "--append-system-prompt", "--agents", "--settings",
            "--permission-mode", "--dangerously-skip-permissions", "stream-json",
            "low", "medium", "high", "xhigh", "max", "dontAsk", "bypassPermissions",
          ].join(" "),
          stderr: "",
        };
      }
      if (args.join(" ") === "auth status --json") {
        return {
          status: 0,
          stdout: JSON.stringify({
            loggedIn: true,
            authMethod: "oauth",
            apiProvider: "firstParty",
            subscriptionType: "max",
            email: secretEmail,
            orgId: "private-org",
          }),
          stderr: "",
        };
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    };

    const report = await runDoctor({
      cwd: SOURCE_ROOT,
      expectedCheckout: SOURCE_ROOT,
      env: { ...process.env, CODEX_HOME: codexHome },
      spawnSyncImpl: fakeSpawn,
      observeCredentialImpl: () => ({
        version: 1,
        source: "native_oauth",
        configIdentity: "/data/CoordExp/.claude",
        state: "present",
        liveValidated: false,
        generation: { dev: "1", ino: "2", size: "3", mtimeNs: "4", ctimeNs: "5" },
        accessExpiresAt: "2026-08-11T20:00:00.000Z",
        accessLocallyExpired: false,
        refreshExpiresAt: null,
        refreshLocallyExpired: null,
      }),
      probeMcp: async () => ({
        healthy: true,
        tools: [
          "spawn_agent", "send_message", "followup_task", "wait_agent",
          "interrupt_agent", "list_agents", "read_agent_messages",
        ],
        agentCount: 0,
      }),
    });

    assert.equal(report.status, "pass");
    assert.equal(report.checks.find((check) => check.id === "checkout").details.packageVersion, PACKAGE_VERSION);
    assert.equal(report.checks.find((check) => check.id === "claude-auth").details.subscriptionType, "max");
    assert.equal(report.checks.find((check) => check.id === "claude-auth").details.liveValidated, false);
    assert.match(
      report.checks.find((check) => check.id === "claude-auth").summary,
      /provider liveness was not validated/,
    );
    const compatibilityShells = report.checks.find((check) => check.id === "plugin-compatibility-shells");
    assert.equal(compatibilityShells.status, "pass");
    assert.equal(compatibilityShells.details.coverageState, "first_install");
    assert.equal(compatibilityShells.details.expectedPredecessor, null);
    assert.match(compatibilityShells.summary, /first install.*no distinct predecessor/i);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(secretEmail));
    assert.doesNotMatch(JSON.stringify(report), /private-org/);
    assert.equal(fs.existsSync(path.join(codexHome, "plugins", "data", "cc", "state")), false);
  });

  it("warns on locally expired OAuth and fails on unavailable credential metadata without claiming liveness", async () => {
    const fakeSpawn = (_command, args) => {
      if (args.join(" ") === "plugin list --json") {
        return { status: 0, stdout: JSON.stringify({ installed: [] }), stderr: "" };
      }
      if (args[0] === "--version") return { status: 0, stdout: "2.1.220 (Claude Code)\n", stderr: "" };
      if (args[0] === "--help") {
        return {
          status: 0,
          stdout: [
            "-p", "--output-format", "--verbose", "--include-partial-messages",
            "--input-format", "--replay-user-messages", "--include-hook-events", "--name",
            "--model", "--effort", "--resume", "--allowedTools", "--disallowedTools",
            "--append-system-prompt", "--agents", "--settings", "--permission-mode",
            "--dangerously-skip-permissions", "stream-json", "low", "medium", "high",
            "xhigh", "max", "dontAsk", "bypassPermissions",
          ].join(" "),
          stderr: "",
        };
      }
      if (args.join(" ") === "auth status --json") {
        return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth" }), stderr: "" };
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    };
    const base = {
      cwd: SOURCE_ROOT,
      expectedCheckout: SOURCE_ROOT,
      env: { ...process.env, CODEX_HOME: temporaryDirectory("cc-doctor-auth-state-") },
      spawnSyncImpl: fakeSpawn,
      probeMcp: async () => ({ healthy: false, tools: [], agentCount: 0 }),
    };
    const expired = await runDoctor({
      ...base,
      observeCredentialImpl: () => ({
        version: 1,
        source: "native_oauth",
        configIdentity: "/data/CoordExp/.claude",
        state: "present",
        liveValidated: false,
        generation: { dev: "1", ino: "2", size: "3", mtimeNs: "4", ctimeNs: "5" },
        accessExpiresAt: "2026-08-11T10:00:00.000Z",
        accessLocallyExpired: true,
        refreshExpiresAt: null,
        refreshLocallyExpired: null,
      }),
    });
    const expiredAuth = expired.checks.find((check) => check.id === "claude-auth");
    assert.equal(expiredAuth.status, "warn");
    assert.equal(expiredAuth.details.liveValidated, false);
    assert.match(expiredAuth.summary, /expired or unproven/);

    const unavailable = await runDoctor({
      ...base,
      observeCredentialImpl: () => ({
        version: 1,
        source: "native_oauth",
        configIdentity: "/data/CoordExp/.claude",
        state: "unavailable",
        liveValidated: false,
        generation: null,
        accessExpiresAt: null,
        accessLocallyExpired: null,
        refreshExpiresAt: null,
        refreshLocallyExpired: null,
      }),
    });
    const unavailableAuth = unavailable.checks.find((check) => check.id === "claude-auth");
    assert.equal(unavailableAuth.status, "fail");
    assert.equal(unavailableAuth.details.liveValidated, false);
    assert.match(unavailableAuth.summary, /provider liveness was not validated/);
    assert.doesNotMatch(JSON.stringify(unavailableAuth), /accessToken|refreshToken|private@/);
  });
});

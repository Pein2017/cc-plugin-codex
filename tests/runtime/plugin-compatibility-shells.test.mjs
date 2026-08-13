import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import {
  finalizeCompatibilityInstall,
  inspectCompatibilityCoverage,
  prepareCompatibilityInstall,
  restorePreparedCompatibilityShells,
} from "../../runtime/plugin-compatibility-shells.mjs";

const SOURCE_ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PLUGIN_ROOT = path.join(SOURCE_ROOT, "plugins", "cc-for-pein");
const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cc-plugin-shells-"));
  temporaryDirectories.push(directory);
  return directory;
}

function snapshot(codexHome, version) {
  const root = path.join(
    codexHome,
    "plugins", "cache", "pein-local", "cc-for-pein", version,
  );
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.cpSync(PLUGIN_ROOT, root, { recursive: true });
  const manifestFile = path.join(root, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  fs.writeFileSync(manifestFile, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  return root;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("durable Plugin compatibility shells", () => {
  it("restores a known predecessor even when Codex Cache lost it before refresh", () => {
    const codexHome = temporaryDirectory();
    const previousVersion = "0.17.0+codex.previous";
    const currentVersion = "0.18.0+codex.current";

    const firstPlan = prepareCompatibilityInstall({ codexHome, requestedVersion: previousVersion });
    const previousSnapshot = snapshot(codexHome, previousVersion);
    finalizeCompatibilityInstall({ plan: firstPlan, installedSnapshotRoot: previousSnapshot });

    fs.rmSync(path.dirname(previousSnapshot), { recursive: true, force: true });
    const upgradePlan = prepareCompatibilityInstall({ codexHome, requestedVersion: currentVersion });
    assert.equal(upgradePlan.coverageState, "managed_upgrade");
    assert.equal(upgradePlan.expectedPredecessor, previousVersion);
    assert.deepEqual(upgradePlan.retainedVersions, [previousVersion]);

    const currentSnapshot = snapshot(codexHome, currentVersion);
    finalizeCompatibilityInstall({ plan: upgradePlan, installedSnapshotRoot: currentSnapshot });
    const restored = path.join(path.dirname(currentSnapshot), previousVersion);
    assert.equal(fs.existsSync(path.join(restored, "skills", "spawn-agent", "SKILL.md")), true);
    assert.equal(fs.existsSync(path.join(restored, "runtime")), false);

    const report = inspectCompatibilityCoverage({
      codexHome,
      currentVersion,
      currentSnapshotRoot: currentSnapshot,
    });
    assert.equal(report.coverageState, "managed");
    assert.equal(report.expectedPredecessor, previousVersion);
    assert.equal(report.archiveValid, true);
    assert.equal(report.coverageComplete, true);
    assert.deepEqual(report.managedVersions, [currentVersion, previousVersion]);
    assert.deepEqual(report.retainedVersions, [previousVersion]);
  });

  it("fails before installation when a known predecessor has no valid source", () => {
    const codexHome = temporaryDirectory();
    const previousVersion = "0.17.0+codex.previous";
    const firstPlan = prepareCompatibilityInstall({ codexHome, requestedVersion: previousVersion });
    finalizeCompatibilityInstall({
      plan: firstPlan,
      installedSnapshotRoot: snapshot(codexHome, previousVersion),
    });
    fs.rmSync(path.join(codexHome, "plugins", "cache"), { recursive: true, force: true });
    fs.rmSync(
      path.join(codexHome, "plugins", "data", "cc", "compatibility-shells", "v1", "versions", previousVersion),
      { recursive: true, force: true },
    );

    assert.throws(
      () => prepareCompatibilityInstall({
        codexHome,
        requestedVersion: "0.18.0+codex.current",
      }),
      /known previous Plugin discovery shell .*0\.17\.0\+codex\.previous.* unavailable/i,
    );
  });

  it("does not advance coverage when a prepared installation is only restored", () => {
    const codexHome = temporaryDirectory();
    const previousVersion = "0.17.0+codex.previous";
    const firstPlan = prepareCompatibilityInstall({ codexHome, requestedVersion: previousVersion });
    finalizeCompatibilityInstall({
      plan: firstPlan,
      installedSnapshotRoot: snapshot(codexHome, previousVersion),
    });
    const upgradePlan = prepareCompatibilityInstall({
      codexHome,
      requestedVersion: "0.18.0+codex.failed",
    });
    fs.rmSync(path.join(codexHome, "plugins", "cache"), { recursive: true, force: true });
    restorePreparedCompatibilityShells(upgradePlan);

    const report = inspectCompatibilityCoverage({
      codexHome,
      currentVersion: previousVersion,
      currentSnapshotRoot: path.join(
        codexHome, "plugins", "cache", "pein-local", "cc-for-pein", previousVersion,
      ),
    });
    assert.deepEqual(report.managedVersions, [previousVersion]);
    assert.equal(report.expectedPredecessor, null);
  });

  it("uses owner-only bounded storage and rejects archive content outside the whitelist", () => {
    const codexHome = temporaryDirectory();
    const version = "0.18.0+codex.current";
    const plan = prepareCompatibilityInstall({ codexHome, requestedVersion: version });
    const currentSnapshot = snapshot(codexHome, version);
    finalizeCompatibilityInstall({ plan, installedSnapshotRoot: currentSnapshot });

    const archiveRoot = path.join(
      codexHome, "plugins", "data", "cc", "compatibility-shells", "v1",
    );
    assert.equal(fs.statSync(archiveRoot).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(archiveRoot, "coverage.json")).mode & 0o777, 0o600);
    const archivedVersion = path.join(archiveRoot, "versions", version);
    fs.writeFileSync(path.join(archivedVersion, "unexpected-runtime.mjs"), "not allowed\n");

    const report = inspectCompatibilityCoverage({
      codexHome,
      currentVersion: version,
      currentSnapshotRoot: currentSnapshot,
    });
    assert.equal(report.archiveValid, false);
    assert.equal(report.coverageComplete, false);
  });

  it("fails closed when a managed successful version is missing from the archive", () => {
    const codexHome = temporaryDirectory();
    const version = "0.18.0+codex.current";
    const plan = prepareCompatibilityInstall({ codexHome, requestedVersion: version });
    const currentSnapshot = snapshot(codexHome, version);
    finalizeCompatibilityInstall({ plan, installedSnapshotRoot: currentSnapshot });
    fs.rmSync(path.join(
      codexHome, "plugins", "data", "cc", "compatibility-shells", "v1", "versions", version,
    ), { recursive: true, force: true });

    const report = inspectCompatibilityCoverage({ codexHome, currentVersion: version });
    assert.equal(report.archiveValid, false);
    assert.equal(report.valid, false);
    assert.equal(report.coverageComplete, false);
  });
});

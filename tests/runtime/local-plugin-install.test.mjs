import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import {
  finalizeCompatibilityInstall,
  inspectCompatibilityCoverage,
  prepareCompatibilityInstall,
} from "../../runtime/plugin-compatibility-shells.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const installScript = path.join(root, "scripts", "local-plugin-install.mjs");
const cachebusterScript = path.join(root, "scripts", "update-plugin-cachebuster.mjs");
const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cc-for-pein-install-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function fakeCodex(directory) {
  const binDirectory = path.join(directory, "bin");
  fs.mkdirSync(binDirectory);
  const executable = path.join(binDirectory, "codex");
  fs.writeFileSync(executable, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(args) + "\\n");
if (args.join(" ") === "plugin marketplace list --json") {
  const root = process.env.FAKE_MARKETPLACE_ROOT;
  process.stdout.write(JSON.stringify({ marketplaces: root ? [{ name: "pein-local", root }] : [] }));
} else if (args.join(" ") === "plugin list --json") {
  process.stdout.write(JSON.stringify({ installed: [{ pluginId: "cc-for-pein@pein-local", version: process.env.FAKE_PLUGIN_VERSION, enabled: true }] }));
} else if (args.join(" ") === "plugin add cc-for-pein@pein-local --json") {
  if (process.env.FAKE_DELETE_CACHE === "1") {
    fs.rmSync(process.env.FAKE_PLUGIN_CACHE_ROOT, { recursive: true, force: true });
  }
  if (process.env.FAKE_INSTALL_FAILURE === "1") process.exit(17);
  const target = require("node:path").join(process.env.FAKE_PLUGIN_CACHE_ROOT, process.env.FAKE_PLUGIN_VERSION);
  fs.mkdirSync(require("node:path").dirname(target), { recursive: true });
  fs.cpSync(process.env.FAKE_PLUGIN_SOURCE, target, { recursive: true });
  process.stdout.write(JSON.stringify({ ok: true }));
} else {
  process.stdout.write(JSON.stringify({ ok: true }));
}
`);
  fs.chmodSync(executable, 0o755);
  return binDirectory;
}

function invokeInstall({ mode, marketplaceRoot, configure = () => ({}) }) {
  const directory = temporaryDirectory();
  const codexHome = path.join(directory, "codex-home");
  const pluginCacheRoot = path.join(codexHome, "plugins", "cache", "pein-local", "cc-for-pein");
  fs.mkdirSync(pluginCacheRoot, { recursive: true });
  const logFile = path.join(directory, "calls.jsonl");
  const binDirectory = fakeCodex(directory);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "plugins", "cc-for-pein", ".codex-plugin", "plugin.json"), "utf8"),
  );
  const result = spawnSync(process.execPath, [installScript, mode], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_CODEX_LOG: logFile,
      FAKE_MARKETPLACE_ROOT: marketplaceRoot ?? "",
      FAKE_PLUGIN_VERSION: manifest.version,
      FAKE_PLUGIN_CACHE_ROOT: pluginCacheRoot,
      FAKE_PLUGIN_SOURCE: path.join(root, "plugins", "cc-for-pein"),
      CODEX_HOME: codexHome,
      PATH: `${binDirectory}:${process.env.PATH}`,
      ...configure({ directory, codexHome, pluginCacheRoot, manifest }),
    },
  });
  const calls = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  return { calls, result, directory, codexHome, pluginCacheRoot, manifest };
}

function managedSnapshot(codexHome, version) {
  const rootPath = path.join(
    codexHome, "plugins", "cache", "pein-local", "cc-for-pein", version,
  );
  fs.mkdirSync(path.dirname(rootPath), { recursive: true });
  fs.cpSync(path.join(root, "plugins", "cc-for-pein"), rootPath, { recursive: true });
  const manifestFile = path.join(rootPath, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  fs.writeFileSync(manifestFile, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  return rootPath;
}

function seedManagedVersion(codexHome, version) {
  const plan = prepareCompatibilityInstall({ codexHome, requestedVersion: version });
  finalizeCompatibilityInstall({
    plan,
    installedSnapshotRoot: managedSnapshot(codexHome, version),
  });
}

describe("local plugin installation", () => {
  it("refreshes a correctly bound local marketplace atomically without plugin removal", () => {
    const { calls, result } = invokeInstall({ mode: "--refresh-only", marketplaceRoot: root });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls, [
      ["plugin", "marketplace", "list", "--json"],
      ["plugin", "add", "cc-for-pein@pein-local", "--json"],
      ["plugin", "list", "--json"],
    ]);
    assert.equal(calls.some((args) => args[0] === "plugin" && args[1] === "remove"), false);
    assert.equal(calls.some((args) => args.slice(0, 3).join(" ") === "plugin marketplace remove"), false);
  });

  it("fails closed in refresh-only mode when the configured marketplace root drifts", () => {
    const driftRoot = temporaryDirectory();
    const { calls, result } = invokeInstall({ mode: "--refresh-only", marketplaceRoot: driftRoot });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /marketplace root drift/i);
    assert.deepEqual(calls, [["plugin", "marketplace", "list", "--json"]]);
  });

  it("allows an explicit initial binding to replace only a drifted marketplace", () => {
    const driftRoot = temporaryDirectory();
    const { calls, result } = invokeInstall({ mode: "--initial", marketplaceRoot: driftRoot });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls, [
      ["plugin", "marketplace", "list", "--json"],
      ["plugin", "marketplace", "remove", "pein-local", "--json"],
      ["plugin", "marketplace", "add", root, "--json"],
      ["plugin", "add", "cc-for-pein@pein-local", "--json"],
      ["plugin", "list", "--json"],
    ]);
    assert.equal(calls.some((args) => args[0] === "plugin" && args[1] === "remove"), false);
  });

  it("repairs an initial binding whose stale marketplace root no longer exists", () => {
    const staleRoot = path.join(temporaryDirectory(), "removed-worktree");
    const { calls, result } = invokeInstall({ mode: "--initial", marketplaceRoot: staleRoot });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls, [
      ["plugin", "marketplace", "list", "--json"],
      ["plugin", "marketplace", "remove", "pein-local", "--json"],
      ["plugin", "marketplace", "add", root, "--json"],
      ["plugin", "add", "cc-for-pein@pein-local", "--json"],
      ["plugin", "list", "--json"],
    ]);
  });

  it("restores only the two most-recent discovery shells after Codex cleanup", () => {
    const { result, pluginCacheRoot } = invokeInstall({
      mode: "--refresh-only",
      marketplaceRoot: root,
      configure: ({ codexHome, pluginCacheRoot }) => {
        for (const [index, version] of ["0.2.0+codex.old", "0.3.0+codex.middle", "0.4.0+codex.recent"].entries()) {
          const snapshot = managedSnapshot(codexHome, version);
          fs.writeFileSync(path.join(snapshot, "marker"), version);
          const stamp = new Date(1_700_000_000_000 + index * 1_000);
          fs.utimesSync(snapshot, stamp, stamp);
        }
        return { FAKE_DELETE_CACHE: "1" };
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(pluginCacheRoot, "0.2.0+codex.old")), false);
    assert.equal(fs.existsSync(path.join(pluginCacheRoot, "0.3.0+codex.middle", "marker")), false);
    assert.equal(fs.existsSync(path.join(pluginCacheRoot, "0.4.0+codex.recent", "marker")), false);
    assert.equal(fs.existsSync(path.join(pluginCacheRoot, "0.3.0+codex.middle", ".mcp.json")), true, result.stdout);
    assert.equal(fs.existsSync(path.join(pluginCacheRoot, "0.4.0+codex.recent", ".mcp.json")), true, result.stdout);
  });

  it("restores a durable predecessor that disappeared before installer startup", () => {
    const previousVersion = "0.17.0+codex.previous";
    const { result, pluginCacheRoot } = invokeInstall({
      mode: "--refresh-only",
      marketplaceRoot: root,
      configure: ({ codexHome, pluginCacheRoot }) => {
        seedManagedVersion(codexHome, previousVersion);
        fs.rmSync(pluginCacheRoot, { recursive: true, force: true });
        return {};
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes(`Retained discovery shells: ${previousVersion}.`), true);
    assert.equal(
      fs.existsSync(path.join(pluginCacheRoot, previousVersion, "skills", "spawn-agent", "SKILL.md")),
      true,
    );
  });

  it("fails before plugin add when a known predecessor is absent everywhere", () => {
    const previousVersion = "0.17.0+codex.previous";
    const { calls, result, codexHome, pluginCacheRoot } = invokeInstall({
      mode: "--refresh-only",
      marketplaceRoot: root,
      configure: ({ codexHome, pluginCacheRoot }) => {
        seedManagedVersion(codexHome, previousVersion);
        fs.rmSync(pluginCacheRoot, { recursive: true, force: true });
        fs.rmSync(
          path.join(codexHome, "plugins", "data", "cc", "compatibility-shells", "v1", "versions", previousVersion),
          { recursive: true, force: true },
        );
        return {};
      },
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes(previousVersion), true);
    assert.deepEqual(calls, []);
    const report = inspectCompatibilityCoverage({
      codexHome,
      currentVersion: previousVersion,
      currentSnapshotRoot: path.join(pluginCacheRoot, previousVersion),
    });
    assert.deepEqual(report.managedVersions, [previousVersion]);
  });

  it("records first-install migration coverage without inventing a predecessor", () => {
    const { result, codexHome, manifest, pluginCacheRoot } = invokeInstall({
      mode: "--refresh-only",
      marketplaceRoot: root,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Predecessor coverage: unavailable \(first install\/migration;/i);
    const report = inspectCompatibilityCoverage({
      codexHome,
      currentVersion: manifest.version,
      currentSnapshotRoot: path.join(pluginCacheRoot, manifest.version),
    });
    assert.equal(report.coverageState, "first_install");
    assert.deepEqual(report.managedVersions, [manifest.version]);
    assert.equal(report.expectedPredecessor, null);
  });

  it("restores selected discovery shells when Codex installation fails", () => {
    const { result, pluginCacheRoot } = invokeInstall({
      mode: "--refresh-only",
      marketplaceRoot: root,
      configure: ({ codexHome, pluginCacheRoot }) => {
        const snapshot = path.join(pluginCacheRoot, "0.5.0+codex.previous");
        managedSnapshot(codexHome, "0.5.0+codex.previous");
        fs.writeFileSync(path.join(snapshot, "marker"), "preserved");
        return { FAKE_DELETE_CACHE: "1", FAKE_INSTALL_FAILURE: "1" };
      },
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(pluginCacheRoot, "0.5.0+codex.previous", "marker")), false);
    assert.equal(fs.existsSync(path.join(pluginCacheRoot, "0.5.0+codex.previous", ".mcp.json")), true);
  });

  it("replaces only the Codex cachebuster suffix", () => {
    const directory = temporaryDirectory();
    const pluginRoot = path.join(directory, "plugin");
    const manifestDirectory = path.join(pluginRoot, ".codex-plugin");
    fs.mkdirSync(manifestDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDirectory, "plugin.json"),
      `${JSON.stringify({ name: "cc-for-pein", version: "0.3.0+other.build" }, null, 2)}\n`,
    );

    const result = spawnSync(process.execPath, [cachebusterScript, pluginRoot, "--cachebuster", "test-123"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(manifestDirectory, "plugin.json"), "utf8"));
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(manifest.version, `${packageJson.version}+codex.test-123`);
  });
});

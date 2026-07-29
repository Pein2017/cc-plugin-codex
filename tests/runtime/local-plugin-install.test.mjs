import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

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
} else {
  process.stdout.write(JSON.stringify({ ok: true }));
}
`);
  fs.chmodSync(executable, 0o755);
  return binDirectory;
}

function invokeInstall({ mode, marketplaceRoot }) {
  const directory = temporaryDirectory();
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
      PATH: `${binDirectory}:${process.env.PATH}`,
    },
  });
  const calls = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  return { calls, result };
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

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { promoteLocal } from "../../scripts/promote-local.mjs";

const temporaryDirectories = [];
afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function run(cwd, args) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error([args.join(" "), result.stderr, result.stdout].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function commit(cwd, message) {
  run(cwd, ["git", "add", "--all"]);
  run(cwd, ["git", "commit", "-m", message]);
  return run(cwd, ["git", "rev-parse", "HEAD"]);
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-local-promotion-"));
  temporaryDirectories.push(root);
  const live = path.join(root, "live");
  const development = path.join(root, "development");
  fs.mkdirSync(live);
  run(live, ["git", "init", "-b", "main"]);
  run(live, ["git", "config", "user.name", "CC Promotion Test"]);
  run(live, ["git", "config", "user.email", "cc-promotion@example.invalid"]);
  fs.writeFileSync(path.join(live, "package.json"), `${JSON.stringify({ scripts: { check: "true" } })}\n`);
  fs.mkdirSync(path.join(live, "runtime"));
  fs.writeFileSync(path.join(live, "runtime", "index.mjs"), "export const version = 1;\n");
  const initial = commit(live, "initial");
  run(live, ["git", "worktree", "add", "-b", "developer", development, "main"]);
  return { root, live, development, initial, gateDirectory: path.join(root, "gate") };
}

async function promote(fixture, options = {}) {
  return promoteLocal({
    liveCheckout: fixture.live,
    developmentCheckout: fixture.development,
    gateDirectory: fixture.gateDirectory,
    runAcceptance: options.runAcceptance ?? (() => {}),
  });
}

describe("local developer to main promotion", () => {
  it("fast-forwards main to the exact tested compatible commit", async () => {
    const fixture = setup();
    fs.writeFileSync(path.join(fixture.development, "runtime", "index.mjs"), "export const version = 2;\n");
    const target = commit(fixture.development, "compatible runtime change");
    let acceptanceCalls = 0;
    const receipt = await promote(fixture, { runAcceptance: () => { acceptanceCalls += 1; } });
    assert.equal(acceptanceCalls, 1);
    assert.equal(receipt.status, "promoted");
    assert.equal(receipt.activation, "hot_compatible");
    assert.equal(receipt.toCommit, target);
    assert.equal(run(fixture.live, ["git", "rev-parse", "HEAD"]), target);
  });

  it("reports an already-equal clean pair without running acceptance", async () => {
    const fixture = setup();
    let acceptanceCalls = 0;
    const receipt = await promote(fixture, { runAcceptance: () => { acceptanceCalls += 1; } });
    assert.equal(receipt.status, "up_to_date");
    assert.equal(acceptanceCalls, 0);
  });

  it("rejects dirty development state before changing main", async () => {
    const fixture = setup();
    fs.writeFileSync(path.join(fixture.development, "untracked.txt"), "dirty\n");
    await assert.rejects(promote(fixture), /clean developer checkout/i);
    assert.equal(run(fixture.live, ["git", "rev-parse", "HEAD"]), fixture.initial);
  });

  it("rejects divergent history before acceptance or main mutation", async () => {
    const fixture = setup();
    fs.writeFileSync(path.join(fixture.development, "developer.txt"), "developer\n");
    commit(fixture.development, "developer commit");
    fs.writeFileSync(path.join(fixture.live, "main.txt"), "main\n");
    const mainCommit = commit(fixture.live, "main commit");
    let acceptanceCalls = 0;
    await assert.rejects(
      promote(fixture, { runAcceptance: () => { acceptanceCalls += 1; } }),
      /does not descend from main/i,
    );
    assert.equal(acceptanceCalls, 0);
    assert.equal(run(fixture.live, ["git", "rev-parse", "HEAD"]), mainCommit);
  });

  it("leaves main unchanged when acceptance fails", async () => {
    const fixture = setup();
    fs.writeFileSync(path.join(fixture.development, "runtime", "index.mjs"), "export const version = 2;\n");
    commit(fixture.development, "candidate");
    await assert.rejects(
      promote(fixture, { runAcceptance: () => { throw new Error("checks failed"); } }),
      /checks failed/i,
    );
    assert.equal(run(fixture.live, ["git", "rev-parse", "HEAD"]), fixture.initial);
  });

  it("rejects a developer commit that changes during acceptance", async () => {
    const fixture = setup();
    fs.writeFileSync(path.join(fixture.development, "runtime", "index.mjs"), "export const version = 2;\n");
    commit(fixture.development, "candidate");
    await assert.rejects(
      promote(fixture, {
        runAcceptance: () => {
          fs.writeFileSync(path.join(fixture.development, "after-check.txt"), "new candidate\n");
          commit(fixture.development, "changed after checks");
        },
      }),
      /developer changed after acceptance began/i,
    );
    assert.equal(run(fixture.live, ["git", "rev-parse", "HEAD"]), fixture.initial);
  });

  it("classifies static MCP changes as restart-required", async () => {
    const fixture = setup();
    fs.writeFileSync(path.join(fixture.development, "runtime", "mcp-server.mjs"), "export {};\n");
    commit(fixture.development, "static MCP change");
    const receipt = await promote(fixture);
    assert.equal(receipt.activation, "restart_required");
    assert.deepEqual(receipt.decisivePaths, ["runtime/mcp-server.mjs"]);
  });
});

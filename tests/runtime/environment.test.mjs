import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { resolveRuntimeEnvironment } from "../../runtime/environment.mjs";

const cleanups = [];
afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop(), { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-env-"));
  cleanups.push(root);
  const codexHome = path.join(root, ".codex");
  fs.mkdirSync(codexHome, { recursive: true });
  return { root, codexHome };
}

describe("runtime environment", () => {
  it("uses CODEX_HOME/.env as one authoritative file and preserves CONDA_EXE", () => {
    const { root, codexHome } = fixture();
    const envFile = path.join(codexHome, ".env");
    fs.writeFileSync(envFile, [
      `CLAUDE_CONFIG_DIR=${path.join(root, ".claude")}`,
      "CONDA_EXE=/opt/conda/bin/conda",
      "HTTP_PROXY=http://127.0.0.1:9090",
      "NO_PROXY=127.0.0.1,localhost",
      "",
    ].join("\n"));
    const result = resolveRuntimeEnvironment({
      cwd: root,
      env: { PATH: "/usr/bin", CODEX_HOME: codexHome, HTTP_PROXY: "http://old:1" },
    });
    assert.deepEqual(result.receipt.sources, [envFile]);
    assert.equal(result.env.CONDA_EXE, "/opt/conda/bin/conda");
    assert.equal(result.env.HTTP_PROXY, "http://127.0.0.1:9090");
    assert.equal(result.env.PATH, "/usr/bin");
  });

  it("lets an explicit env file replace the CODEX_HOME selection", () => {
    const { root, codexHome } = fixture();
    fs.writeFileSync(path.join(codexHome, ".env"), "CLAUDE_CONFIG_DIR=/wrong\n");
    const explicit = path.join(root, "runtime.env");
    fs.writeFileSync(explicit, "CLAUDE_CONFIG_DIR=/right\nCUSTOM_FLAG=kept\n");
    const result = resolveRuntimeEnvironment({
      cwd: root,
      env: { CODEX_HOME: codexHome },
      envFile: explicit,
    });
    assert.deepEqual(result.receipt.sources, [explicit]);
    assert.equal(result.env.CLAUDE_CONFIG_DIR, "/right");
    assert.equal(result.env.CUSTOM_FLAG, "kept");
  });

  it("rejects shell syntax instead of executing it", () => {
    const { root } = fixture();
    const explicit = path.join(root, "bad.env");
    fs.writeFileSync(explicit, "$(touch /tmp/should-not-exist)\n");
    assert.throws(
      () => resolveRuntimeEnvironment({ cwd: root, env: {}, envFile: explicit }),
      /Invalid env syntax/
    );
  });

  it("finds the workspace ancestor .codex/.env without CODEX_HOME", () => {
    const { root } = fixture();
    const nested = path.join(root, "worktrees", "checkout");
    fs.mkdirSync(nested, { recursive: true });
    const projectCodex = path.join(root, ".codex");
    fs.mkdirSync(projectCodex, { recursive: true });
    const envFile = path.join(projectCodex, ".env");
    fs.writeFileSync(envFile, "CONDA_EXE=/ancestor/conda\nCLAUDE_CONFIG_DIR=/ancestor/claude\n");
    const result = resolveRuntimeEnvironment({
      cwd: nested,
      env: { CODEX_HOME: path.join(root, "missing-codex-home") },
    });
    assert.deepEqual(result.receipt.sources, [envFile]);
    assert.equal(result.env.CONDA_EXE, "/ancestor/conda");
  });

  it("keeps CONDA_EXE in the packaged fallback", () => {
    const { root } = fixture();
    const result = resolveRuntimeEnvironment({
      cwd: root,
      env: { CODEX_HOME: path.join(root, "missing") },
    });
    assert.equal(result.receipt.sources.length, 1);
    assert.match(result.receipt.sources[0], /config[/\\]runtime\.env$/);
    assert.equal(result.env.CONDA_EXE, "/root/miniconda3/bin/conda");
  });
});

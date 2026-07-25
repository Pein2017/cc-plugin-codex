import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const cli = path.join(root, "runtime", "cli.mjs");
const bootstrap = path.join(root, "plugin", "bootstrap", "cc-runtime.mjs");
const cleanups = [];

afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop(), { recursive: true, force: true });
});

function waitMs(ms) {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, ms);
}

function fakeClaude(filePath) {
  fs.writeFileSync(filePath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function firstLine() {
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let body = "";
    const data = (chunk) => {
      body += chunk;
      const newline = body.indexOf("\\n");
      if (newline < 0) return;
      cleanup();
      resolve(body.slice(0, newline));
    };
    const end = () => { cleanup(); resolve(body); };
    const error = (reason) => { cleanup(); reject(reason); };
    const cleanup = () => {
      process.stdin.off("data", data);
      process.stdin.off("end", end);
      process.stdin.off("error", error);
    };
    process.stdin.on("data", data);
    process.stdin.on("end", end);
    process.stdin.on("error", error);
  });
}

async function main() {
  if (args[0] === "--version") return process.stdout.write("2.1.220 (Claude Code)\\n");
  if (args[0] === "auth" && args[1] === "status") return process.stdout.write("authenticated\\n");
  if (args[0] !== "-p") throw new Error("unexpected args " + JSON.stringify(args));
  const initial = JSON.parse(await firstLine());
  const prompt = initial.message.content.map((part) => part.text || "").join("\\n");
  const resume = value("--resume");
  const sessionId = resume || "fake-session-1";
  if (process.env.CC_FAKE_INVOCATION_FILE) {
    fs.writeFileSync(process.env.CC_FAKE_INVOCATION_FILE, JSON.stringify({
      args, prompt, sessionId,
      env: {
        CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
        CONDA_EXE: process.env.CONDA_EXE,
        HTTP_PROXY: process.env.HTTP_PROXY,
        NO_PROXY: process.env.NO_PROXY,
        IS_SANDBOX: process.env.IS_SANDBOX,
        CC_RUNTIME_SOURCE_ROOT: process.env.CC_RUNTIME_SOURCE_ROOT,
      },
    }, null, 2));
  }
  process.stdout.write(JSON.stringify({
    type: "system", subtype: "init", session_id: sessionId,
    claude_code_version: "2.1.220", model: value("--model"),
    mcp_servers: [{ name: "serena", status: "connected" }],
  }) + "\\n");
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\\n")) {
      const newline = buffer.indexOf("\\n");
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) process.stdout.write(line + "\\n");
    }
  });
  if (/recover-once/.test(prompt) && !resume) {
    process.stdout.write(JSON.stringify({
      type: "stream_event", session_id: sessionId,
      event: { delta: { type: "text_delta", text: "partial" } },
    }) + "\\n");
    process.stderr.write("API Error: Connection closed mid-response. The response above may be incomplete.\\n");
    process.stdin.destroy();
    process.exitCode = 1;
    return;
  }
  const delay = Number(
    (resume && process.env.CC_FAKE_RESUME_DELAY) ||
    (prompt.match(/delay=(\\d+)/) || [])[1] ||
    100
  );
  const text = "completed:" + prompt;
  process.stdout.write(JSON.stringify({
    type: "stream_event", session_id: sessionId,
    event: { delta: { type: "text_delta", text } },
  }) + "\\n");
  await sleep(delay);
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: text }) + "\\n");
}
main().catch((error) => { process.stderr.write(error.stack + "\\n"); process.exitCode = 1; });
`, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-native-int-"));
  cleanups.push(dir);
  const workspace = path.join(dir, "workspace");
  const codexHome = path.join(dir, ".codex");
  const runtimeHome = path.join(dir, "runtime-home");
  const claude = path.join(dir, "claude");
  const invocation = path.join(dir, "invocation.json");
  fs.mkdirSync(workspace);
  fs.mkdirSync(codexHome);
  fakeClaude(claude);
  const envFile = path.join(codexHome, ".env");
  fs.writeFileSync(envFile, [
    `CLAUDE_CONFIG_DIR=${path.join(dir, ".claude")}`,
    "CONDA_EXE=/root/miniconda3/bin/conda",
    "HTTP_PROXY=http://127.0.0.1:9090",
    "NO_PROXY=127.0.0.1,localhost",
    `CC_CLAUDE_BIN=${claude}`,
    `CC_RUNTIME_CHECKOUT=${root}`,
    "",
  ].join("\n"));
  return {
    workspace,
    invocation,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CC_RUNTIME_HOME: runtimeHome,
      CC_FAKE_INVOCATION_FILE: invocation,
      CC_OWNER_SESSION_ID: "owner-1",
    },
  };
}

function run(test, args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: test.workspace,
    env: test.env,
    encoding: "utf8",
    timeout: options.timeout ?? 15_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return options.json === false ? result.stdout : JSON.parse(result.stdout);
}

function runAsync(test, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: test.workspace,
      env: test.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (status) => resolve({ status, stdout, stderr }));
  });
}

function waitFor(test, jobId, predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = run(test, ["status", jobId, "--json"]);
    if (predicate(job)) return job;
    waitMs(50);
  }
  throw new Error(`Timed out waiting for ${jobId}`);
}

describe("native runtime CLI", () => {
  it("runs terminal-parity from one env file without implicit Claude overrides", () => {
    const test = fixture();
    const launched = run(test, ["start", "--profile", "terminal-parity", "--write", "--json", "hello"]);
    const job = waitFor(test, launched.jobId, (value) => value.status === "completed");
    assert.equal(job.result.sessionId, "fake-session-1");
    assert.equal(job.result.runtimeReceipt.executionProfile.name, "terminal-parity");
    assert.equal(job.result.runtimeReceipt.sourceRoot, root);
    assert.equal(job.readiness.availability.executable, path.join(path.dirname(test.invocation), "claude"));
    assert.deepEqual(job.result.runtimeReceipt.environment.sources, [path.join(test.env.CODEX_HOME, ".env")]);
    const invocation = JSON.parse(fs.readFileSync(test.invocation, "utf8"));
    for (const flag of ["--model", "--effort", "--settings", "--permission-mode", "--allowedTools", "--strict-mcp-config"]) {
      assert.equal(invocation.args.includes(flag), false, flag);
    }
    assert.equal(invocation.env.CONDA_EXE, "/root/miniconda3/bin/conda");
    assert.equal(invocation.env.HTTP_PROXY, "http://127.0.0.1:9090");
    assert.equal(invocation.env.CC_RUNTIME_SOURCE_ROOT, root);
  });

  it("persists and acknowledges steering through the live stream", () => {
    const test = fixture();
    const launched = run(test, ["start", "--profile", "terminal-parity", "--json", "delay=700"]);
    waitFor(test, launched.jobId, (job) => job.status === "running");
    const steering = run(test, ["steer", launched.jobId, "prefer the smaller fixture", "--json"]);
    assert.equal(steering.sequence, 1);
    const job = waitFor(test, launched.jobId, (value) => value.status === "completed");
    assert.equal(job.result.steering.latestAcknowledgedSequence, 1);
    assert.equal(job.result.steering.pendingCount, 0);
  });

  it("launches the explicit unrestricted terminal profile with an auditable receipt", () => {
    const test = fixture();
    const launched = run(test, [
      "start",
      "--profile", "terminal-parity",
      "--dangerously-skip-permissions",
      "--write",
      "--json",
      "unrestricted",
    ]);
    const job = waitFor(test, launched.jobId, (value) => value.status === "completed");
    const invocation = JSON.parse(fs.readFileSync(test.invocation, "utf8"));
    assert.equal(invocation.args.includes("--dangerously-skip-permissions"), true);
    assert.equal(invocation.env.IS_SANDBOX, "1");
    assert.equal(job.result.runtimeReceipt.dangerouslySkipPermissions, true);
    assert.equal(job.result.runtimeReceipt.isSandbox, true);
    assert.deepEqual(
      job.result.runtimeReceipt.executionProfile.addedOverrides,
      ["dangerouslySkipPermissions"]
    );
  });

  it("resumes an exact session through follow-up and rejects concurrent ownership", () => {
    const test = fixture();
    const first = run(test, ["start", "--profile", "terminal-parity", "--json", "first"]);
    waitFor(test, first.jobId, (job) => job.status === "completed");
    const next = run(test, ["follow-up", first.jobId, "second", "--json"]);
    assert.notEqual(next.jobId, first.jobId);
    const activeConflict = spawnSync(process.execPath, [cli, "start", "--resume-session", "fake-session-1", "--json", "conflict"], {
      cwd: test.workspace, env: test.env, encoding: "utf8",
    });
    assert.equal(activeConflict.status, 1);
    assert.match(activeConflict.stderr, /already owned by active job/);
    const completed = waitFor(test, next.jobId, (job) => job.status === "completed");
    assert.equal(completed.result.sessionId, "fake-session-1");
  });

  it("atomically rejects one of two simultaneous exact-session starts", async () => {
    const test = fixture();
    const commands = await Promise.all([
      runAsync(test, ["start", "--resume-session", "shared-session", "--json", "delay=1000"]),
      runAsync(test, ["start", "--resume-session", "shared-session", "--json", "delay=1000"]),
    ]);
    assert.deepEqual(commands.map((entry) => entry.status).sort(), [0, 1]);
    const accepted = commands.find((entry) => entry.status === 0);
    const rejected = commands.find((entry) => entry.status === 1);
    assert.ok(accepted);
    assert.ok(rejected);
    assert.match(rejected.stderr, /already owned by active job/);
    const launch = JSON.parse(accepted.stdout);
    const terminal = waitFor(test, launch.jobId, (job) => ["completed", "failed"].includes(job.status));
    assert.equal(terminal.status, "completed");
  });

  it("recovers a subprocess transport close on the exact session", () => {
    const test = fixture();
    const launched = run(test, ["start", "--profile", "terminal-parity", "--json", "recover-once"]);
    const completed = waitFor(test, launched.jobId, (job) => job.status === "completed");
    assert.equal(completed.result.sessionId, "fake-session-1");
    assert.equal(completed.result.recoveryAttempts, 1);
    assert.equal(completed.result.attempts.length, 2);
    assert.equal(completed.result.attempts[0].failureClass, "transport_closed_resumable");
    const invocation = JSON.parse(fs.readFileSync(test.invocation, "utf8"));
    assert.equal(invocation.args.includes("--resume"), true);
    assert.equal(invocation.args[invocation.args.indexOf("--resume") + 1], "fake-session-1");
    assert.doesNotMatch(invocation.prompt, /recover-once/);
  });

  it("interrupts with SIGINT and resumes the same Claude session", () => {
    const test = fixture();
    const launched = run(test, ["start", "--profile", "terminal-parity", "--json", "delay=3000"]);
    waitFor(test, launched.jobId, (job) => job.status === "running" && job.threadId === "fake-session-1");
    const interrupted = run(test, ["interrupt", launched.jobId, "--json"]);
    assert.equal(interrupted.interrupted, true);
    assert.equal(interrupted.sessionId, "fake-session-1");
    const follow = run(test, ["follow-up", launched.jobId, "after interrupt", "--json"]);
    const completed = waitFor(test, follow.jobId, (job) => job.status === "completed");
    assert.equal(completed.result.sessionId, "fake-session-1");
  });

  it("interrupts a live recovery attempt rather than mistaking it for backoff", () => {
    const test = fixture();
    test.env.CC_FAKE_RESUME_DELAY = "3000";
    const launched = run(test, ["start", "--profile", "terminal-parity", "--json", "recover-once"]);
    waitFor(
      test,
      launched.jobId,
      (job) => job.status === "running" && job.recoveryAttempts === 1 && Boolean(job.pid),
      10_000
    );
    const interrupted = run(test, ["interrupt", launched.jobId, "--json"], { timeout: 10_000 });
    assert.equal(interrupted.interrupted, true);
    const stored = waitFor(test, launched.jobId, (job) => job.status === "interrupted");
    assert.equal(stored.pid, null);
  });

  it("delegates from a fake cache bootstrap to the declared checkout runtime", () => {
    const test = fixture();
    const fakeCache = path.join(path.dirname(test.workspace), "fake-cache", "cc", "0.1.0");
    const fakeBootstrap = path.join(fakeCache, "bootstrap", "cc-runtime.mjs");
    const poisonMarker = path.join(fakeCache, "poison-ran");
    fs.mkdirSync(path.dirname(fakeBootstrap), { recursive: true });
    fs.copyFileSync(bootstrap, fakeBootstrap);
    fs.mkdirSync(path.join(fakeCache, "runtime"));
    fs.writeFileSync(
      path.join(fakeCache, "runtime", "cli.mjs"),
      `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(poisonMarker)}, "bad");\n`
    );
    const result = spawnSync(process.execPath, [fakeBootstrap, "readiness", "--json"], {
      cwd: test.workspace,
      env: test.env,
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.sourceRoot, root);
    assert.equal(fs.existsSync(poisonMarker), false);
  });

  it("lets an explicit env file select the checkout before cache bootstrap delegation", () => {
    const test = fixture();
    const isolatedCodexHome = path.join(path.dirname(test.workspace), "empty-codex-home");
    const explicitEnv = path.join(path.dirname(test.workspace), "explicit-runtime.env");
    const fakeCache = path.join(path.dirname(test.workspace), "explicit-cache", "cc", "0.1.0");
    const fakeBootstrap = path.join(fakeCache, "bootstrap", "cc-runtime.mjs");
    fs.mkdirSync(isolatedCodexHome);
    fs.mkdirSync(path.dirname(fakeBootstrap), { recursive: true });
    fs.copyFileSync(bootstrap, fakeBootstrap);
    fs.writeFileSync(explicitEnv, [
      `CLAUDE_CONFIG_DIR=${path.join(path.dirname(test.workspace), ".claude-explicit")}`,
      `CC_CLAUDE_BIN=${path.join(path.dirname(test.invocation), "claude")}`,
      `CC_RUNTIME_CHECKOUT=${root}`,
      "HTTP_PROXY=http://127.0.0.1:9090",
      "",
    ].join("\n"));
    const env = { ...test.env, CODEX_HOME: isolatedCodexHome };
    delete env.CC_RUNTIME_CHECKOUT;
    delete env.CC_RUNTIME_ENV_FILE;
    const result = spawnSync(process.execPath, [
      fakeBootstrap,
      "readiness",
      "--cwd", test.workspace,
      "--env-file", explicitEnv,
      "--json",
    ], {
      cwd: path.dirname(test.workspace),
      env,
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.sourceRoot, root);
    assert.deepEqual(receipt.environment.sources, [explicitEnv]);
    assert.equal(receipt.environment.claudeConfigDir, path.join(path.dirname(test.workspace), ".claude-explicit"));
  });
});

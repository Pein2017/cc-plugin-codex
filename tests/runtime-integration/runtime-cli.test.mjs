import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const cli = path.join(root, "runtime", "cli.mjs");
const operatorCli = path.join(root, "runtime", "operator-cli.mjs");
const bootstrap = path.join(root, "plugins", "cc-for-pein", "bootstrap", "cc-runtime.mjs");
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

function textOf(event) {
  return Array.isArray(event && event.message && event.message.content)
    ? event.message.content.map((part) => part && part.text || "").join("\\n")
    : "";
}

async function firstEvent() {
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let body = "";
    const data = (chunk) => {
      body += chunk;
      const newline = body.indexOf("\\n");
      if (newline < 0) return;
      cleanup();
      try { resolve(JSON.parse(body.slice(0, newline))); } catch (error) { reject(error); }
    };
    const end = () => { cleanup(); reject(new Error("stdin ended before first stream event")); };
    const cleanup = () => { process.stdin.off("data", data); process.stdin.off("end", end); };
    process.stdin.on("data", data);
    process.stdin.on("end", end);
  });
}

function appendInvocation(record) {
  if (process.env.CC_FAKE_INVOCATION_FILE) {
    fs.appendFileSync(process.env.CC_FAKE_INVOCATION_FILE, JSON.stringify(record) + "\\n");
  }
}

async function main() {
  if (args[0] === "--version") return process.stdout.write("2.1.220 (Claude Code)\\n");
  if (args[0] === "--help") return process.stdout.write("-p --output-format --verbose --include-partial-messages --input-format --replay-user-messages --include-hook-events --name --model --effort --session-id --resume --allowedTools --disallowedTools --append-system-prompt --settings --permission-mode --dangerously-skip-permissions stream-json low medium high xhigh max dontAsk bypassPermissions\\n");
  if (args[0] === "auth" && args[1] === "status") return process.stdout.write("authenticated\\n");
  if (args[0] !== "-p") throw new Error("unexpected args " + JSON.stringify(args));
  const initial = await firstEvent();
  const prompt = textOf(initial);
  const resume = value("--resume");
  const token = (prompt.match(/session=([a-z0-9_-]+)/i) || [])[1] || "default";
  const sessionId = resume || "fake-session-" + token;
  appendInvocation({
    args, prompt, sessionId,
    env: {
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
      CONDA_EXE: process.env.CONDA_EXE,
      HTTP_PROXY: process.env.HTTP_PROXY,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      NO_PROXY: process.env.NO_PROXY,
      IS_SANDBOX: process.env.IS_SANDBOX,
      CC_RUNTIME_SOURCE_ROOT: process.env.CC_RUNTIME_SOURCE_ROOT,
    },
  });
  process.stdout.write(JSON.stringify({
    type: "system", subtype: "init", session_id: sessionId,
    claude_code_version: "2.1.220", model: value("--model"),
  }) + "\\n");
  process.stdin.on("data", (chunk) => {
    for (const line of String(chunk).split("\\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const text = textOf(event);
        if (text) process.stdout.write(JSON.stringify({ type: "user", message: { content: [{ type: "text", text }] } }) + "\\n");
      } catch {}
    }
  });
  process.on("SIGINT", () => process.exit(130));
  const delay = Number((prompt.match(/delay=(\\d+)/) || [])[1] || 80);
  process.stdout.write(JSON.stringify({
    type: "stream_event", session_id: sessionId,
    event: { delta: { type: "text_delta", text: "completed:" + prompt } },
  }) + "\\n");
  await sleep(delay);
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "completed:" + prompt }) + "\\n");
}
main().catch((error) => { process.stderr.write(error.stack + "\\n"); process.exitCode = 1; });
`, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function fixture(ownerRootId = "owner-1") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-agent-cli-"));
  cleanups.push(dir);
  const workspace = path.join(dir, "workspace");
  const codexHome = path.join(dir, ".codex");
  const runtimeHome = path.join(dir, "runtime-home");
  const claude = path.join(dir, "claude");
  const invocation = path.join(dir, "invocations.jsonl");
  fs.mkdirSync(workspace);
  fs.mkdirSync(codexHome);
  fakeClaude(claude);
  const envFile = path.join(codexHome, ".env");
  fs.writeFileSync(envFile, [
    `CLAUDE_CONFIG_DIR=${path.join(dir, ".claude")}`,
    "CONDA_EXE=/opt/conda/bin/conda",
    "HTTP_PROXY=http://127.0.0.1:9090",
    "HTTPS_PROXY=http://127.0.0.1:9090",
    "NO_PROXY=127.0.0.1,localhost",
    `CC_CLAUDE_BIN=${claude}`,
    `CC_RUNTIME_CHECKOUT=${root}`,
    "",
  ].join("\n"));
  const inheritedEnv = { ...process.env };
  // A CC-bootstrapped parent exports its own trusted root. The fixture owns a
  // fresh logical root and must not let that ambient identity override the
  // explicit CODEX_THREAD_ID below.
  delete inheritedEnv.CC_TRUSTED_OWNER_ROOT_ID;
  return {
    workspace,
    invocation,
    envFile,
    env: {
      ...inheritedEnv,
      CODEX_HOME: codexHome,
      CODEX_THREAD_ID: ownerRootId,
      CC_RUNTIME_HOME: runtimeHome,
      CC_RUNTIME_ENV_FILE: envFile,
      CC_FAKE_INVOCATION_FILE: invocation,
    },
  };
}

function command(test, args, options = {}) {
  return spawnSync(process.execPath, [...(options.nodeArgs ?? []), options.program ?? cli, ...args], {
    cwd: test.workspace,
    env: options.env ?? test.env,
    encoding: "utf8",
    timeout: options.timeout ?? 15_000,
  });
}

function run(test, args, options = {}) {
  const result = command(test, args, options);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runAsync(test, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [options.program ?? cli, ...args], {
      cwd: test.workspace,
      env: options.env ?? test.env,
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

function list(test, options = {}) {
  return run(test, ["list_agents", "--json"], options);
}

function agent(test, target, options = {}) {
  // Public list owns reconciliation; inspect the durable registry only after
  // exercising that lifecycle boundary so the helper does not bypass it.
  list(test, options);
  const environment = options.env ?? test.env;
  const workspaceHash = createHash("sha256")
    .update(fs.realpathSync.native(test.workspace))
    .digest("hex")
    .slice(0, 16);
  const rootHash = createHash("sha256")
    .update(environment.CODEX_THREAD_ID)
    .digest("hex")
    .slice(0, 32);
  const registryFile = path.join(
    environment.CC_RUNTIME_HOME,
    "state",
    workspaceHash,
    "agent-registry",
    "roots",
    rootHash,
    "registry.json",
  );
  const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
  const selected = Object.values(registry.agents).find((item) =>
    [item.agentId, item.path, item.name].includes(target)
  );
  assert.ok(selected, `expected Agent ${target}`);
  return selected;
}

function waitForAgent(test, target, predicate, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  let latest = null;
  while (Date.now() < deadline) {
    const current = agent(test, target, options);
    latest = current;
    if (predicate(current)) return current;
    waitMs(40);
  }
  throw new Error(`Timed out waiting for Agent ${target}: ${JSON.stringify(latest)}`);
}

function waitForJob(test, jobId, predicate, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  while (Date.now() < deadline) {
    const current = readInternalJob(test, jobId);
    if (current && predicate(current)) return current;
    waitMs(40);
  }
  throw new Error(`Timed out waiting for internal Agent job ${jobId}`);
}

function readInternalJob(test, jobId) {
  const canonicalWorkspace = fs.realpathSync.native(test.workspace);
  const workspaceHash = createHash("sha256").update(canonicalWorkspace).digest("hex").slice(0, 12);
  const jobFile = path.join(test.env.CC_RUNTIME_HOME, "state", workspaceHash, "jobs", `${jobId}.json`);
  try {
    return JSON.parse(fs.readFileSync(jobFile, "utf8"));
  } catch {
    return null;
  }
}

function invocations(test) {
  if (!fs.existsSync(test.invocation)) return [];
  return fs.readFileSync(test.invocation, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeNativeTranscript(test, sessionId, records) {
  const claudeConfigDir = path.join(path.dirname(test.workspace), ".claude");
  const encodedWorkspace = test.workspace.replace(/[^a-zA-Z0-9]/g, "-");
  const projectDir = path.join(claudeConfigDir, "projects", encodedWorkspace);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, `${sessionId}.jsonl`),
    `${records.map((record) => JSON.stringify({ sessionId, ...record })).join("\n")}\n`,
    "utf8",
  );
}

describe("canonical Agent runtime CLI", () => {
  it("launches Haiku with its canonical model and explicit low effort", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "haiku_smoke",
      "--model", "haiku", "--reasoning-effort", "low", "--json", "session=haiku delay=40",
    ]);
    assert.deepEqual(Object.keys(spawned).sort(), ["agent_name", "model", "status"]);
    assert.equal(spawned.agent_name, "/root/haiku_smoke");
    assert.equal(spawned.model, "claude-haiku-4-5");
    assert.match(spawned.status, /^(starting|working)$/);
    waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    const invocation = invocations(test)[0];
    assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], "claude-haiku-4-5");
    assert.equal(invocation.args[invocation.args.indexOf("--effort") + 1], "low");
    assert.deepEqual(
      invocation.args.flatMap((value, index) => value === "--disallowedTools" ? [invocation.args[index + 1]] : []),
      ["Agent", "Workflow"],
    );
    assert.equal(invocation.args.includes("--dangerously-skip-permissions"), true);
    assert.match(invocation.args[invocation.args.indexOf("--append-system-prompt") + 1], /Act as a leaf/i);
    assert.match(invocation.args[invocation.args.indexOf("--append-system-prompt") + 1], /read(?: and|\/)review only/i);
  });

  it("launches Fable with canonical model and explicit max effort", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "fable_smoke",
      "--model", "claude-fable-5", "--reasoning-effort", "max",
      "--delegation-mode", "claude_orchestrator", "--json", "session=fable delay=40",
    ]);
    assert.deepEqual(Object.keys(spawned).sort(), ["agent_name", "model", "status"]);
    assert.equal(spawned.agent_name, "/root/fable_smoke");
    assert.equal(spawned.model, "claude-fable-5");
    assert.match(spawned.status, /^(starting|working)$/);
    const firstTurn = waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    const invocation = invocations(test)[0];
    assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], "claude-fable-5");
    assert.equal(invocation.args[invocation.args.indexOf("--effort") + 1], "max");
    assert.deepEqual(
      invocation.args.flatMap((value, index) => value === "--disallowedTools" ? [invocation.args[index + 1]] : []),
      ["Workflow"],
    );
    assert.equal(invocation.args.includes("--dangerously-skip-permissions"), true);
    assert.match(invocation.args[invocation.args.indexOf("--append-system-prompt") + 1], /join every child/i);
    assert.match(invocation.args[invocation.args.indexOf("--append-system-prompt") + 1], /read(?: and|\/)review only/i);

    const followed = run(test, [
      "followup_task", spawned.agent_name, "--json", "fable exact-session follow-up delay=40",
    ]);
    assert.deepEqual(followed, {
      agent_name: spawned.agent_name,
      delivery: "new_turn",
    });
    const completed = waitForAgent(
      test,
      spawned.agent_name,
      (value) => value.status === "completed" && value.latestJobId !== firstTurn.latestJobId,
    );
    assert.equal(completed.delegationMode, "claude_orchestrator");
    const followupJob = readInternalJob(test, completed.latestJobId);
    assert.equal(followupJob.request.delegationMode, "claude_orchestrator");
    const followupInvocation = invocations(test)[1];
    assert.equal(
      followupInvocation.args[followupInvocation.args.indexOf("--resume") + 1],
      "fake-session-fable",
    );
    assert.deepEqual(
      followupInvocation.args.flatMap((value, index) => value === "--disallowedTools" ? [followupInvocation.args[index + 1]] : []),
      ["Workflow"],
    );
    assert.equal(followupInvocation.args.includes("--dangerously-skip-permissions"), true);
    assert.match(
      followupInvocation.args[followupInvocation.args.indexOf("--append-system-prompt") + 1],
      /join every child/i,
    );
    assert.match(
      followupInvocation.args[followupInvocation.args.indexOf("--append-system-prompt") + 1],
      /read(?: and|\/)review only/i,
    );
  });

  it("exposes all seven operations with flat exact targeting and duplicate-name rejection", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "alpha", "--model", "sonnet", "--json", "session=alpha delay=700",
    ]);
    assert.deepEqual(Object.keys(spawned).sort(), ["agent_name", "model", "status"]);
    assert.equal(spawned.agent_name, "/root/alpha");
    assert.equal(spawned.model, "claude-sonnet-5");
    assert.match(spawned.status, /^(starting|working)$/);
    assert.throws(
      () => run(test, ["spawn_agent", "--write=false", "--task-name", "alpha", "--model", "sonnet", "--json", "duplicate"]),
      /already belongs/
    );
    const selected = agent(test, "/root/alpha");
    assert.equal(selected.path, spawned.agent_name);
    const prefix = command(test, ["send_message", "/root/al", "not exact", "--json"]);
    assert.equal(prefix.status, 1);
    assert.match(prefix.stderr, /No Agent with that exact ID, path, or name/);
    assert.throws(
      () => run(test, ["spawn_agent", "--write=false", "--task-name", "forked", "--fork-turns", "all", "--json", "forbidden"]),
      /Unknown option --fork-turns/
    );
  });

  it("keeps Agent roots isolated while operator all-agents remains explicit and read-only", () => {
    const test = fixture("root-a");
    const alpha = run(test, ["spawn_agent", "--write=false", "--task-name", "alpha", "--model", "opus", "--json", "session=alpha delay=50"]);
    waitForAgent(test, alpha.agent_name, (value) => value.status === "completed");
    const foreignEnv = { ...test.env, CODEX_THREAD_ID: "root-b" };
    assert.deepEqual(list(test, { env: foreignEnv }).agents, []);
    const foreign = command(test, ["send_message", alpha.agent_name, "foreign", "--json"], { env: foreignEnv });
    assert.equal(foreign.status, 1);
    assert.match(foreign.stderr, /No Agent with that exact ID, path, or name/);
    const beta = run(test, ["spawn_agent", "--write=false", "--task-name", "beta", "--model", "sonnet", "--json", "session=beta delay=50"], { env: foreignEnv });
    waitForAgent(test, beta.agent_name, (value) => value.status === "completed", { env: foreignEnv });

    const operator = run(test, [
      "list-agents", "--all", "--cwd", test.workspace,
      "--env-file", test.envFile, "--json",
    ], {
      program: operatorCli,
      env: foreignEnv,
    });
    assert.equal(operator.operatorMode, true);
    assert.equal(operator.readOnly, true);
    assert.equal(operator.agents.length, 2);
    assert.ok(operator.agents.every((value) => value.rootHash && value.claudeSessionId === undefined));
  });

  it("runs two Agents concurrently and leaves their terminal histories nonresident", async () => {
    const test = fixture();
    const launches = await Promise.all([
      runAsync(test, ["spawn_agent", "--write=false", "--task-name", "agent_a", "--model", "sonnet", "--json", "session=a delay=500"]),
      runAsync(test, ["spawn_agent", "--write=false", "--task-name", "agent_b", "--model", "opus", "--json", "session=b delay=500"]),
    ]);
    assert.deepEqual(launches.map((entry) => entry.status).sort(), [0, 0]);
    const agents = launches.map((entry) => JSON.parse(entry.stdout));
    for (const entry of agents) waitForAgent(test, entry.agent_name, (value) => value.status === "completed");
    const listed = list(test);
    assert.equal(listed.agents.length, 2);
    assert.ok(listed.agents.every((value) => value.agent_status === "completed"));
    assert.deepEqual(
      new Set(invocations(test).map((value) => value.sessionId)),
      new Set(["fake-session-a", "fake-session-b"])
    );
  });

  it("durably dispatches an active send_message and records acknowledgement", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "active", "--model", "sonnet", "--json", "session=active delay=1000",
    ]);
    const stored = agent(test, spawned.agent_name);
    const started = waitForJob(test, stored.activeJobId, (value) => value.status === "running" && Boolean(value.pid));
    assert.equal(started.agentId, stored.agentId);
    const sent = run(test, ["send_message", spawned.agent_name, "steer exactly once", "--json"]);
    assert.deepEqual(sent, {
      agent_name: spawned.agent_name,
      delivery: "dispatched_active",
    });
    assert.equal(JSON.stringify(sent).includes("steer exactly once"), false);
    const finished = waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    assert.ok(finished.mailbox.messages.filter((message) => message.state === "acknowledged").length >= 1);
    assert.equal(finished.mailbox.messages.some((message) => message.state === "dispatched"), false);
  });

  it("queues an idle message and assigns it to an exact-session follow-up", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "resume", "--model", "opus", "--json", "session=resume delay=60",
    ]);
    const terminal = waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    assert.equal(terminal.continuation.mode, "exact_session");
    assert.equal(terminal.claudeSessionId, "fake-session-resume");
    const queued = run(test, ["send_message", terminal.path, "queued before follow-up", "--json"]);
    assert.deepEqual(queued, {
      agent_name: terminal.path,
      delivery: "queued_no_turn",
    });
    const beforeFollowup = agent(test, terminal.path);
    assert.equal(beforeFollowup.mailbox.messages.filter((message) => message.state === "queued").length, 1);

    const followup = run(test, ["followup_task", terminal.path, "session=resume follow-up", "--json"]);
    assert.deepEqual(followup, {
      agent_name: terminal.path,
      delivery: "new_turn",
    });
    waitForAgent(
      test,
      terminal.path,
      (value) => value.status === "completed" && value.latestJobId !== terminal.latestJobId,
    );
    const recorded = invocations(test);
    assert.equal(recorded.length, 2);
    assert.equal(recorded[0].args[recorded[0].args.indexOf("--model") + 1], "claude-opus-5");
    assert.equal(recorded[0].args[recorded[0].args.indexOf("--name") + 1], "resume");
    assert.equal(recorded[1].args.includes("--resume"), true);
    assert.equal(recorded[1].args[recorded[1].args.indexOf("--model") + 1], "claude-opus-5");
    assert.equal(recorded[1].args.includes("--name"), false);
    assert.equal(recorded[1].args[recorded[1].args.indexOf("--resume") + 1], "fake-session-resume");
    assert.match(recorded[1].prompt, /queued before follow-up/);
    assert.match(recorded[1].prompt, /session=resume follow-up/);
  });

  it("reads complete paginated outer-assistant history from the bound native session", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "history",
      "--model", "sonnet", "--json", "session=history delay=40",
    ]);
    const terminal = waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    const before = fs.readFileSync(
      path.join(
        test.env.CC_RUNTIME_HOME,
        "state",
        createHash("sha256").update(fs.realpathSync.native(test.workspace)).digest("hex").slice(0, 16),
        "agent-registry",
        "roots",
        createHash("sha256").update(test.env.CODEX_THREAD_ID).digest("hex").slice(0, 32),
        "registry.json",
      ),
      "utf8",
    );
    const longMessage = `${"界".repeat(24_000)}-complete-tail`;
    writeNativeTranscript(test, terminal.claudeSessionId, [
      {
        type: "assistant",
        uuid: "old-message",
        timestamp: "2026-07-27T00:00:00.000Z",
        isSidechain: false,
        message: { role: "assistant", content: [{ type: "text", text: "older" }] },
      },
      {
        type: "assistant",
        uuid: "private-thinking",
        timestamp: "2026-07-27T00:00:01.000Z",
        isSidechain: false,
        message: { role: "assistant", content: [{ type: "thinking", thinking: "private" }] },
      },
      {
        type: "assistant",
        uuid: "new-message",
        timestamp: "2026-07-27T00:00:02.000Z",
        isSidechain: false,
        message: {
          role: "assistant",
          content: [
            { type: "text", text: longMessage },
            { type: "tool_use", name: "Bash", input: { command: "private" } },
          ],
        },
      },
      {
        type: "assistant",
        uuid: "sidechain",
        timestamp: "2026-07-27T00:00:03.000Z",
        isSidechain: true,
        message: { role: "assistant", content: [{ type: "text", text: "private-sidechain" }] },
      },
    ]);

    const latest = run(test, ["read_agent_messages", terminal.path, "--json"]);
    assert.deepEqual(latest.messages, [{
      message_id: "new-message",
      timestamp: "2026-07-27T00:00:02.000Z",
      text: longMessage,
    }]);
    assert.equal(latest.next_before, "new-message");
    assert.ok(Buffer.byteLength(latest.messages[0].text, "utf8") > 64 * 1024);

    const older = run(test, [
      "read_agent_messages", terminal.path,
      "--before", latest.next_before,
      "--limit", "2",
      "--json",
    ]);
    assert.deepEqual(older.messages.map((message) => message.message_id), ["old-message"]);
    assert.equal(older.next_before, null);
    assert.equal(JSON.stringify(older).includes("private"), false);

    const after = fs.readFileSync(
      path.join(
        test.env.CC_RUNTIME_HOME,
        "state",
        createHash("sha256").update(fs.realpathSync.native(test.workspace)).digest("hex").slice(0, 16),
        "agent-registry",
        "roots",
        createHash("sha256").update(test.env.CODEX_THREAD_ID).digest("hex").slice(0, 32),
        "registry.json",
      ),
      "utf8",
    );
    assert.equal(after, before);
  });

  it("keeps list and wait completion delivery unread until a later acknowledgement", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "delivery", "--model", "sonnet", "--json", "session=delivery delay=60",
    ]);
    waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    const firstList = list(test);
    const secondList = list(test);
    assert.deepEqual(firstList, secondList);
    assert.deepEqual(firstList.agents, [{
      agent_name: spawned.agent_name,
      agent_status: "completed",
      delegation_mode: "leaf",
    }]);
    assert.equal(JSON.stringify(firstList).includes("completionInbox"), false);

    const firstWait = run(test, ["wait_agent", "--timeout-ms", "0", "--json"]);
    assert.equal(firstWait.timedOut, false);
    assert.equal(firstWait.update.kind, "completion");
    assert.equal(firstWait.update.agent_name, spawned.agent_name);
    assert.ok(firstWait.update.delivery_token);
    assert.match(firstWait.update.completion_message, /^completed:session=delivery/);
    assert.equal(firstWait.update.completion_message_truncated, false);
    const redelivered = run(test, ["wait_agent", "--timeout-ms", "0", "--json"]);
    assert.deepEqual(redelivered, firstWait);
    const secondWait = run(test, [
      "wait_agent", "--timeout-ms", "0", "--acknowledge-tokens", firstWait.update.delivery_token, "--json",
    ]);
    assert.equal(secondWait.timedOut, true);
    assert.equal(secondWait.update, undefined);
    assert.deepEqual(list(test), firstList);
  });

  it("reports safe stream progress before the complete completion message", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "progress_stream",
      "--model", "sonnet", "--json", "session=progress-stream delay=2000",
    ]);
    const progressAgent = agent(test, spawned.agent_name);
    waitForJob(test, progressAgent.activeJobId, (value) => Number(value.publicProgress?.revision ?? 0) >= 2);

    const completionFirst = run(test, ["wait_agent", "--timeout-ms", "0", "--json"]);
    assert.deepEqual(completionFirst, {
      message: "Timed out waiting for CC Agent activity.",
      timedOut: true,
    });

    const progress = run(test, [
      "wait_agent", "--timeout-ms", "0", "--wake-on-progress", "--json",
    ]);
    assert.equal(progress.timedOut, false);
    assert.deepEqual(progress.update, {
      kind: "progress",
      agent_name: spawned.agent_name,
      agent_status: "working",
      progress: {
        revision: 2,
        activity: "responding",
        phase: "running",
        summary: "Claude is drafting its response.",
        updated_at: progress.update.progress.updated_at,
      },
    });
    assert.equal(JSON.stringify(progress).includes("session=progress-stream"), false);

    const completion = run(test, ["wait_agent", "--timeout-ms", "5000", "--json"], { timeout: 10_000 });
    assert.equal(completion.update.kind, "completion");
    assert.match(completion.update.completion_message, /^completed:session=progress-stream/);
  });

  it("interrupts only a running Agent turn and keeps the logical Agent record", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "interruptible", "--model", "opus", "--json", "session=interrupt delay=5000",
    ]);
    const stored = agent(test, spawned.agent_name);
    waitForJob(test, stored.activeJobId, (value) => value.status === "running" && Boolean(value.pid));
    const receipt = run(test, ["interrupt_agent", spawned.agent_name, "--json"], { timeout: 12_000 });
    assert.deepEqual(receipt, {
      agent_name: spawned.agent_name,
      status: "interrupted",
    });
    const terminal = waitForAgent(
      test,
      spawned.agent_name,
      (value) => ["interrupted", "errored"].includes(value.status),
      { timeoutMs: 12_000 }
    );
    assert.equal(terminal.agentId, stored.agentId);
    assert.equal(terminal.activeJobId, null);
  });

  it("rejects removed lifecycle commands and model-facing all/session overrides", () => {
    const test = fixture();
    for (const legacy of ["start", "run", "steer", "status", "result", "follow-up", "cancel", "cancel_job"]) {
      const result = command(test, [legacy, "--json"]);
      assert.equal(result.status, 1, legacy);
      assert.match(result.stderr, /Unknown or removed command/);
    }
    for (const args of [
      ["list_agents", "--all", "--json"],
      ["list_agents", "--cwd", path.dirname(test.workspace), "--json"],
      ["list_agents", "-C", path.dirname(test.workspace), "--json"],
      ["list_agents", "--env-file", test.envFile, "--json"],
      ["list_agents", `--cwd ${path.dirname(test.workspace)} --json`],
      ["spawn_agent", "--write=false", "--task-name", "forbidden", "--resume-session", "x", "--json", "x"],
      ["spawn_agent", "--write=false", "--task-name", "forbidden_tools", "--allowed-tools", "Bash", "--json", "x"],
      ["wait_agent", "/root/not-allowed", "--json"],
      ["read_agent_messages", "/root/not-allowed", "--session-id", "foreign", "--json"],
      ["read_agent_messages", "/root/not-allowed", "--owner-root-id", "foreign", "--json"],
      ["read_agent_messages", "/root/not-allowed", "--all", "--json"],
      ["read_agent_messages", "/root/not-allowed", "--transcript-path", "/tmp/foreign.jsonl", "--json"],
    ]) {
      const result = command(test, args);
      assert.equal(result.status, 1, args.join(" "));
      assert.match(result.stderr, /Unsupported model-facing option|Unknown option|root-scoped/);
    }

    const swallowedUnknown = command(test, [
      "spawn_agent", "--write=false",
      "--task-name", "must_not_exist",
      "--message", "--claude-session-id", "foreign",
      "--json",
    ]);
    assert.equal(swallowedUnknown.status, 1);
    assert.match(swallowedUnknown.stderr, /Missing value for --message/);
    assert.deepEqual(list(test).agents, []);

    const unsupportedModel = command(test, [
      "spawn_agent", "--write=false",
      "--task-name", "unsupported_model",
      "--model", "fable-5",
      "--json", "must fail before Claude starts",
    ]);
    assert.equal(unsupportedModel.status, 1);
    assert.match(unsupportedModel.stderr, /Unsupported Claude model/);

    for (const unsupported of ["haiku-4-5", "claude-haiku-4-5-20251001"]) {
      const rejected = command(test, [
        "spawn_agent", "--write=false",
        "--task-name", `unsupported_${unsupported.replaceAll("-", "_")}`,
        "--model", unsupported,
        "--json", "dated or partial IDs are not public inputs",
      ]);
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /Unsupported Claude model/);
    }

    const missingModel = command(test, [
      "spawn_agent", "--write=false", "--task-name", "missing_model", "--json", "must fail before Claude starts",
    ]);
    assert.equal(missingModel.status, 1);
    assert.match(missingModel.stderr, /requires an explicit model/);
    assert.deepEqual(list(test).agents, []);
    assert.deepEqual(invocations(test), []);
  });

  it("preserves full-access terminal-parity environment and delegates a copied bootstrap to the checkout", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--write=false", "--task-name", "parity", "--model", "opus",
      "--json", "session=parity delay=60",
    ]);
    waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    const invocation = invocations(test)[0];
    for (const flag of ["--effort", "--settings", "--permission-mode", "--allowedTools", "--strict-mcp-config"]) {
      assert.equal(invocation.args.includes(flag), false, flag);
    }
    assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], "claude-opus-5");
    assert.equal(invocation.args.includes("--dangerously-skip-permissions"), true);
    assert.deepEqual(
      invocation.args.flatMap((value, index) => value === "--disallowedTools" ? [invocation.args[index + 1]] : []),
      ["Agent", "Workflow"],
    );
    assert.match(invocation.args[invocation.args.indexOf("--append-system-prompt") + 1], /bounded Claude Agent/i);
    assert.match(invocation.args[invocation.args.indexOf("--append-system-prompt") + 1], /read(?: and|\/)review only/i);
    assert.match(invocation.args[invocation.args.indexOf("--append-system-prompt") + 1], /blocked on a lead\/user decision/i);
    assert.equal(invocation.args.includes("--system-prompt"), false);
    assert.equal(invocation.args[invocation.args.indexOf("--name") + 1], "parity");
    assert.equal(invocation.env.CLAUDE_CONFIG_DIR, path.join(path.dirname(test.workspace), ".claude"));
    assert.equal(invocation.env.CONDA_EXE, "/opt/conda/bin/conda");
    assert.equal(invocation.env.HTTP_PROXY, "http://127.0.0.1:9090");
    assert.equal(invocation.env.HTTPS_PROXY, "http://127.0.0.1:9090");
    assert.equal(invocation.env.NO_PROXY, "127.0.0.1,localhost");
    assert.equal(invocation.env.IS_SANDBOX, "1");
    assert.equal(invocation.env.CC_RUNTIME_SOURCE_ROOT, root);

    const fakeCache = path.join(path.dirname(test.workspace), "fake-cache", "cc", "0.1.0");
    const fakeBootstrap = path.join(fakeCache, "bootstrap", "cc-runtime.mjs");
    const poisonMarker = path.join(fakeCache, "poison-ran");
    fs.mkdirSync(path.dirname(fakeBootstrap), { recursive: true });
    fs.copyFileSync(bootstrap, fakeBootstrap);
    fs.copyFileSync(
      path.join(path.dirname(bootstrap), "dependency-preflight.mjs"),
      path.join(path.dirname(fakeBootstrap), "dependency-preflight.mjs"),
    );
    fs.mkdirSync(path.join(fakeCache, "runtime"));
    fs.writeFileSync(path.join(fakeCache, "runtime", "cli.mjs"), `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(poisonMarker)}, "bad");\n`);
    const poisonEnv = path.join(fakeCache, "poison.env");
    fs.writeFileSync(poisonEnv, "not valid dotenv syntax\n");
    const delegated = command(test, ["list_agents", "--json"], {
      program: fakeBootstrap,
      nodeArgs: ["--"],
      env: {
        ...test.env,
        CC_RUNTIME_CHECKOUT: fakeCache,
        CC_RUNTIME_ENV_FILE: poisonEnv,
        CLAUDE_NATIVE_CONFIG_DIR: "/poison/native-claude",
        CLAUDE_CONFIG_DIR: "/poison/claude",
      },
    });
    assert.equal(delegated.status, 0, delegated.stderr || delegated.stdout);
    assert.deepEqual(JSON.parse(delegated.stdout), list(test));
    assert.equal(fs.existsSync(poisonMarker), false);

    for (const args of [
      ["list_agents", "--cwd", path.dirname(test.workspace), "--json"],
      ["list_agents", "-C", path.dirname(test.workspace), "--json"],
      ["list_agents", "--env-file", test.envFile, "--json"],
      ["list_agents", "--env-file", path.join(fakeCache, "missing.env"), "--json"],
      ["list_agents", `--env-file ${test.envFile} --json`],
    ]) {
      const rejected = command(test, args, { program: fakeBootstrap, nodeArgs: ["--"] });
      assert.equal(rejected.status, 1, args.join(" "));
      assert.match(rejected.stderr, /Unsupported model-facing option/);
    }
  });

  it("always adds dangerous bypass while follow-up can change behavioral write intent", () => {
    const test = fixture();
    const spawned = run(test, [
      "spawn_agent", "--task-name", "write_parity",
      "--model", "sonnet", "--write=false", "--json", "session=write-parity delay=40",
    ]);
    const terminal = waitForAgent(test, spawned.agent_name, (value) => value.status === "completed");
    const followup = run(test, [
      "followup_task", terminal.path, "--write=true", "session=write-parity follow-up", "--json",
    ]);
    waitForAgent(
      test,
      terminal.path,
      (value) => value.status === "completed" && value.latestJobId !== terminal.latestJobId,
    );
    const recorded = invocations(test);
    assert.equal(recorded.length, 2);
    assert.equal(recorded[0].args.includes("--dangerously-skip-permissions"), true);
    assert.equal(recorded[1].args.includes("--dangerously-skip-permissions"), true);
    assert.match(
      recorded[0].args[recorded[0].args.indexOf("--append-system-prompt") + 1],
      /read(?: and|\/)review only/i,
    );
    assert.match(
      recorded[1].args[recorded[1].args.indexOf("--append-system-prompt") + 1],
      /task-scoped workspace mutation/i,
    );

    const rejected = command(test, [
      "spawn_agent", "--write=false", "--task-name", "contradictory",
      "--model", "sonnet", "--dangerously-skip-permissions", "--json", "must fail",
    ]);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Unknown option --dangerously-skip-permissions/);
  });
});

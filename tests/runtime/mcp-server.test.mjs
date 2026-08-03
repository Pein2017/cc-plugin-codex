import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  CC_MCP_TOOL_NAMES,
  CODEX_SANDBOX_META_KEY,
  createCcMcpServer,
  invokeIsolatedRuntimeOperation,
  redactMcpErrorMessage,
} from "../../runtime/mcp-server.mjs";
import { CC_MCP_API_GENERATION } from "../../runtime/mcp-api.mjs";
import { PACKAGE_VERSION } from "../../runtime/version.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const pluginRoot = path.join(root, "plugins", "cc-for-pein");
const meta = {
  threadId: "mcp-test-thread",
  [CODEX_SANDBOX_META_KEY]: { sandboxCwd: pathToFileURL(root).href },
};

function runtimeMethods(handler) {
  return Object.fromEntries(CC_MCP_TOOL_NAMES.map((name) => [name, (input) => handler(name, input)]));
}

async function inMemoryClient(runtimeFactory) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCcMcpServer({ runtimeFactory });
  const client = new Client({ name: "cc-mcp-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

const closers = [];
const temporaryDirectories = [];
afterEach(async () => {
  await Promise.allSettled(closers.splice(0).map((close) => close()));
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("typed CC MCP server", () => {
  it("advertises exactly the canonical seven typed tools", async () => {
    const { client, server } = await inMemoryClient(() => runtimeMethods(() => ({})));
    closers.push(() => client.close(), () => server.close());
    const listed = await client.listTools();
    assert.equal(client.getServerVersion()?.version, PACKAGE_VERSION);
    assert.deepEqual(listed.tools.map((tool) => tool.name), CC_MCP_TOOL_NAMES);
    for (const tool of listed.tools) assert.equal(tool.inputSchema.additionalProperties, false);
    const listAgents = listed.tools.find((tool) => tool.name === "list_agents");
    assert.deepEqual(listAgents.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    const spawn = listed.tools.find((tool) => tool.name === "spawn_agent");
    assert.deepEqual(new Set(spawn.inputSchema.required), new Set(["task_name", "message", "model", "write"]));
    assert.equal(Object.hasOwn(spawn.inputSchema.properties, "fork_turns"), false);
    assert.equal(Object.hasOwn(spawn.inputSchema.properties, "execution_profile"), false);
    assert.equal(Object.hasOwn(spawn.inputSchema.properties, "allowed_tools"), false);
    assert.equal(Object.hasOwn(spawn.inputSchema.properties, "harness"), false);
    assert.deepEqual(spawn.inputSchema.properties.delegation_mode.enum, ["leaf", "claude_orchestrator"]);
    assert.match(spawn.inputSchema.properties.write.description, /Required behavioral authority[\s\S]*false[\s\S]*true permits[\s\S]*Process access is unchanged/i);
    const followup = listed.tools.find((tool) => tool.name === "followup_task");
    assert.equal(Object.hasOwn(followup.inputSchema.properties, "allowed_tools"), false);
    const wait = listed.tools.find((tool) => tool.name === "wait_agent");
    assert.equal(Object.hasOwn(wait.inputSchema.properties, "timeout_ms"), false);
    assert.equal(Object.hasOwn(wait.inputSchema.properties, "wake_on_progress"), true);
    assert.equal(wait.inputSchema.required?.includes("wake_on_progress") ?? false, false);
    assert.match(wait.description, /critical-path[\s\S]*10-minute completion-first[\s\S]*one progress update per Agent turn[\s\S]*never repeat/i);
  });

  it("uses the fixed model wait and preserves optional progress plus acknowledgement", async () => {
    const calls = [];
    const { client, server } = await inMemoryClient(() => runtimeMethods((name, input) => {
      calls.push({ name, input });
      return { accepted: true };
    }));
    closers.push(() => client.close(), () => server.close());

    await client.callTool({ name: "wait_agent", arguments: {}, _meta: meta });
    await client.callTool({
      name: "wait_agent",
      arguments: {
        wake_on_progress: true,
        acknowledge_tokens: ["delivery-prior"],
      },
      _meta: meta,
    });
    const rejected = await client.callTool({
      name: "wait_agent",
      arguments: { timeout_ms: 1_000 },
      _meta: meta,
    });

    assert.deepEqual(calls, [
      { name: "wait_agent", input: {} },
      {
        name: "wait_agent",
        input: {
          wake_on_progress: true,
          acknowledge_tokens: ["delivery-prior"],
        },
      },
    ]);
    assert.equal(rejected.isError, true);
  });

  it("redacts private runtime identities and absolute paths while keeping public error categories", () => {
    const message = redactMcpErrorMessage(
      [
        "Claude session abc-123 in internal job job-456 failed at /data/CoordExp/cc-plugin-codex/runtime/state/jobs/job-456.json:",
        "(/data/CoordExp/.codex/plugins/data/cc/state/private.json)",
        "`/data/CoordExp/.codex/plugins/data/cc/state/private.json`",
        "/root/.codex/plugins/data/cc/state/session-leases/private.json",
        "/root/.claude /root/project",
        "Agent /root/public_agent authentication required",
      ].join(" "),
    );
    assert.match(message, /authentication required/i);
    assert.equal(message.includes("abc-123"), false);
    assert.equal(message.includes("job-456"), false);
    assert.equal(message.includes("/data/CoordExp"), false);
    assert.equal(message.includes("/root/.codex"), false);
    assert.equal(message.includes("/root/.claude"), false);
    assert.equal(message.includes("/root/project"), false);
    assert.match(message, /\/root\/public_agent/);
  });

  it("forwards a non-null wait_agent blocking object unchanged, with no output schema or supplementation", async () => {
    const update = {
      kind: "completion",
      agent_name: "/root/blocked_wait",
      agent_status: "failed",
      summary: "Agent turn failed.",
      completion_message: "",
      completion_message_truncated: false,
      delivery_token: "delivery-blocked-wait",
      blocking: { reason: "auth_required", scope: "harness", retry: "operator_required" },
    };
    const receipt = { message: "CC Agent completion is available.", timedOut: false, update };
    const { client, server } = await inMemoryClient(() => runtimeMethods(() => receipt));
    closers.push(() => client.close(), () => server.close());

    const listed = await client.listTools();
    const wait = listed.tools.find((tool) => tool.name === "wait_agent");
    assert.equal(Object.hasOwn(wait, "outputSchema"), false);

    const result = await client.callTool({ name: "wait_agent", arguments: {}, _meta: meta });
    assert.deepEqual(result.structuredContent, receipt);
    assert.deepEqual(result.structuredContent.update.blocking, update.blocking);
    assert.deepEqual(JSON.parse(result.content[0].text), receipt);
    assert.deepEqual(JSON.parse(result.content[0].text).update.blocking, update.blocking);
  });

  it("forwards a null wait_agent blocking field unchanged rather than synthesizing a reason", async () => {
    const update = {
      kind: "completion",
      agent_name: "/root/completed_wait",
      agent_status: "completed",
      summary: "Agent turn completed.",
      completion_message: "done",
      completion_message_truncated: false,
      delivery_token: "delivery-completed-wait",
      blocking: null,
    };
    const receipt = { message: "CC Agent completion is available.", timedOut: false, update };
    const { client, server } = await inMemoryClient(() => runtimeMethods(() => receipt));
    closers.push(() => client.close(), () => server.close());

    const result = await client.callTool({ name: "wait_agent", arguments: {}, _meta: meta });
    assert.deepEqual(result.structuredContent, receipt);
    assert.equal(result.structuredContent.update.blocking, null);
    assert.equal(JSON.parse(result.content[0].text).update.blocking, null);
  });

  it("preserves a compact send receipt without reconstructing internal evidence", async () => {
    const receipt = {
      agent_name: "/root/compact_send",
      delivery: "dispatched_active",
    };
    const { client, server } = await inMemoryClient(() => runtimeMethods((name) => {
      assert.equal(name, "send_message");
      return receipt;
    }));
    closers.push(() => client.close(), () => server.close());

    const result = await client.callTool({
      name: "send_message",
      arguments: { target: "/root/compact_send", message: "private repeated text" },
      _meta: meta,
    });
    assert.deepEqual(result.structuredContent, receipt);
    assert.deepEqual(JSON.parse(result.content[0].text), receipt);
    assert.equal(JSON.stringify(result).includes("private repeated text"), false);
  });

  it("passes through exact compact spawn, follow-up, and interrupt receipts", async () => {
    const receipts = {
      spawn_agent: {
        agent_name: "/root/compact",
        model: "claude-sonnet-5",
        status: "working",
      },
      followup_task: {
        agent_name: "/root/compact",
        delivery: "new_turn",
      },
      interrupt_agent: {
        agent_name: "/root/compact",
        status: "interrupted",
      },
    };
    const { client, server } = await inMemoryClient(() => runtimeMethods((name) => receipts[name] ?? {}));
    closers.push(() => client.close(), () => server.close());

    for (const [name, argumentsValue] of [
      ["spawn_agent", {
        task_name: "compact",
        message: "bounded task",
        model: "claude-sonnet-5",
        write: false,
      }],
      ["followup_task", { target: "/root/compact", message: "continue" }],
      ["interrupt_agent", { target: "/root/compact" }],
    ]) {
      const result = await client.callTool({ name, arguments: argumentsValue, _meta: meta });
      assert.deepEqual(result.structuredContent, receipts[name]);
      assert.deepEqual(JSON.parse(result.content[0].text), receipts[name]);
      assert.deepEqual(Object.keys(result.structuredContent), Object.keys(receipts[name]));
    }
  });

  it("requires spawn write intent and preserves explicit false and true without another switch", async () => {
    const calls = [];
    const { client, server } = await inMemoryClient(() => runtimeMethods((name, input) => {
      calls.push({ name, input });
      return { accepted: true };
    }));
    closers.push(() => client.close(), () => server.close());

    const base = {
      task_name: "permission_probe",
      message: "inspect only",
      model: "claude-haiku-4-5",
    };
    const omitted = await client.callTool({ name: "spawn_agent", arguments: base, _meta: meta });
    assert.equal(omitted.isError, true);
    await client.callTool({
      name: "spawn_agent",
      arguments: { ...base, task_name: "permission_read", write: false },
      _meta: meta,
    });
    await client.callTool({
      name: "spawn_agent",
      arguments: { ...base, task_name: "permission_write", write: true },
      _meta: meta,
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].input.write, false);
    assert.equal(calls[1].input.write, true);
    for (const call of calls) {
      assert.equal(Object.hasOwn(call.input, "dangerously_skip_permissions"), false);
      assert.equal(Object.hasOwn(call.input, "permission_mode"), false);
    }
  });

  it("binds every call to trusted Codex thread and workspace metadata", async () => {
    const contexts = [];
    const { client, server } = await inMemoryClient((context) => {
      contexts.push(context);
      return runtimeMethods((name, input) => ({ operation: name, input }));
    });
    closers.push(() => client.close(), () => server.close());

    const result = await client.callTool({
      name: "list_agents",
      arguments: { path_prefix: "/root/a" },
      _meta: meta,
    });
    assert.deepEqual(result.structuredContent, {
      operation: "list_agents",
      input: { path_prefix: "/root/a" },
    });
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].cwd, root);
    assert.equal(contexts[0].env.CODEX_THREAD_ID, meta.threadId);
    assert.equal(contexts[0].env.CC_TRUSTED_OWNER_ROOT_ID, meta.threadId);
    assert.equal(contexts[0].env.CC_RUNTIME_CHECKOUT, root);
    assert.equal(contexts[0].envFile, path.join(root, "config", "runtime.env"));
  });

  it("fails closed when trusted context is missing or callers add private selectors", async () => {
    let runtimeCalls = 0;
    const { client, server } = await inMemoryClient(() => {
      runtimeCalls += 1;
      return runtimeMethods(() => ({}));
    });
    closers.push(() => client.close(), () => server.close());

    const missing = await client.callTool({ name: "list_agents", arguments: {} });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /missing _meta\.threadId/);

    const staleWorkspace = await client.callTool({
      name: "list_agents",
      arguments: {},
      _meta: {
        threadId: "mcp-stale-workspace-thread",
        [CODEX_SANDBOX_META_KEY]: {
          sandboxCwd: pathToFileURL(path.join(root, ".missing-cc-workspace-for-test")).href,
        },
      },
    });
    assert.equal(staleWorkspace.isError, true);
    assert.match(staleWorkspace.content[0].text, /trusted.*workspace.*(?:unavailable|no longer exists)/i);

    const forbidden = await client.callTool({
      name: "spawn_agent",
      arguments: {
        task_name: "audit",
        message: "read only",
        model: "claude-haiku-4-5",
        write: false,
        cwd: "/tmp",
      },
      _meta: meta,
    });
    assert.equal(forbidden.isError, true);
    assert.match(forbidden.content[0].text, /invalid|unrecognized|additional/i);
    const retiredTools = await client.callTool({
      name: "followup_task",
      arguments: { target: "/root/audit", message: "continue", allowed_tools: ["Read"] },
      _meta: meta,
    });
    assert.equal(retiredTools.isError, true);
    assert.match(retiredTools.content[0].text, /invalid|unrecognized|additional/i);
    assert.equal(runtimeCalls, 0);
  });

  it("propagates caller cancellation only into the wait observation", async () => {
    let observedAbort = false;
    let mutations = 0;
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const { client, server } = await inMemoryClient((context) => runtimeMethods(async (name) => {
      if (name !== "wait_agent") {
        mutations += 1;
        return {};
      }
      markStarted();
      await new Promise((resolve, reject) => {
        context.abortSignal.addEventListener("abort", () => {
          observedAbort = true;
          const error = new Error("wait cancelled");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
      return {};
    }));
    closers.push(() => client.close(), () => server.close());

    const controller = new AbortController();
    const waiting = client.callTool(
      { name: "wait_agent", arguments: {}, _meta: meta },
      undefined,
      { signal: controller.signal },
    );
    await started;
    controller.abort();
    await assert.rejects(waiting, /abort|cancel/i);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(observedAbort, true);
    assert.equal(mutations, 0);
  });

  it("loads compatible runtime implementation edits in a fresh worker on every call", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cc-mcp-hot-load-"));
    temporaryDirectories.push(directory);
    const runtimeFile = path.join(directory, "runtime.mjs");
    const writeRuntime = (revision) => fs.writeFileSync(runtimeFile, `
export const CC_MCP_API_GENERATION = ${CC_MCP_API_GENERATION};
export function createClaudeRuntime() {
  return { list_agents() { return { revision: ${JSON.stringify(revision)} }; } };
}
`);
    const context = { cwd: root, envFile: path.join(root, "config", "runtime.env"), env: {} };
    writeRuntime("first");
    const first = await invokeIsolatedRuntimeOperation({
      operation: "list_agents",
      input: {},
      context,
      runtimeModuleUrl: pathToFileURL(runtimeFile),
    });
    writeRuntime("second");
    const second = await invokeIsolatedRuntimeOperation({
      operation: "list_agents",
      input: {},
      context,
      runtimeModuleUrl: pathToFileURL(runtimeFile),
    });
    assert.deepEqual(first, { revision: "first" });
    assert.deepEqual(second, { revision: "second" });
  });

  it("rejects a stale MCP generation before invoking the current runtime", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cc-mcp-generation-"));
    temporaryDirectories.push(directory);
    const marker = path.join(directory, "called");
    const runtimeFile = path.join(directory, "runtime.mjs");
    fs.writeFileSync(runtimeFile, `
import fs from "node:fs";
export const CC_MCP_API_GENERATION = ${CC_MCP_API_GENERATION + 1};
export function createClaudeRuntime() {
  fs.writeFileSync(${JSON.stringify(marker)}, "called");
  return { list_agents() { return {}; } };
}
`);
    await assert.rejects(
      invokeIsolatedRuntimeOperation({
        operation: "list_agents",
        input: {},
        context: { cwd: root, envFile: path.join(root, "config", "runtime.env"), env: {} },
        runtimeModuleUrl: pathToFileURL(runtimeFile),
      }),
      (error) => error?.code === "CC_MCP_RESTART_REQUIRED" && /release:local.*new Codex task/i.test(error.message),
    );
    assert.equal(fs.existsSync(marker), false);
  });

  it("starts through the descriptor bootstrap and preserves stdio framing", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--", path.join(pluginRoot, "bootstrap", "cc-mcp.mjs")],
      cwd: root,
      stderr: "pipe",
    });
    const client = new Client({ name: "cc-mcp-stdio-test", version: "1.0.0" });
    closers.push(() => client.close());
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), CC_MCP_TOOL_NAMES);
  });
});

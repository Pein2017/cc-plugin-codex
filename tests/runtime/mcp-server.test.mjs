import assert from "node:assert/strict";
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
} from "../../runtime/mcp-server.mjs";
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
afterEach(async () => {
  await Promise.allSettled(closers.splice(0).map((close) => close()));
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
    assert.deepEqual(spawn.inputSchema.properties.delegation_mode.enum, ["leaf", "claude_orchestrator"]);
    assert.match(spawn.inputSchema.properties.write.description, /Required[\s\S]*False[\s\S]*true enables/i);
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

  it("starts through the descriptor bootstrap and preserves stdio framing", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--", "bootstrap/cc-mcp.mjs"],
      cwd: pluginRoot,
      stderr: "pipe",
    });
    const client = new Client({ name: "cc-mcp-stdio-test", version: "1.0.0" });
    closers.push(() => client.close());
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), CC_MCP_TOOL_NAMES);
  });
});

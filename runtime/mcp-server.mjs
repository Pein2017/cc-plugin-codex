#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Typed Codex MCP adapter. This process owns no lifecycle state: every call is
 * bound to trusted Codex metadata and delegated to runtime/index.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createClaudeRuntime } from "./index.mjs";
import { PACKAGE_VERSION } from "./version.mjs";

export const CODEX_SANDBOX_META_KEY = "codex/sandbox-state-meta";
export const CC_MCP_TOOL_NAMES = Object.freeze([
  "spawn_agent",
  "send_message",
  "followup_task",
  "wait_agent",
  "interrupt_agent",
  "list_agents",
  "read_agent_messages",
]);

const SOURCE_ROOT = fs.realpathSync.native(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
);
const FIXED_ENV_FILE = path.join(SOURCE_ROOT, "config", "runtime.env");
const MODEL_IDS = [
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-fable-5",
];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

const exactTarget = z.string().trim().min(1).describe(
  "Exact current-root Agent ID, /root/<task_name> path, or normalized name."
);
const message = z.string().trim().min(1);
const executionFields = {
  reasoning_effort: z.enum(EFFORTS).optional(),
  allowed_tools: z.array(z.string().trim().min(1)).min(1).optional(),
};
const optionalWrite = z.boolean().optional().describe(
  "Mutation intent. False keeps native Claude permissions; true enables terminal-parity dangerous permission bypass. Omitted follow-up intent inherits."
);

const TOOL_DEFINITIONS = Object.freeze({
  spawn_agent: {
    description:
      "Experimental: create one durable current-root leaf Claude Agent by default, or an explicit Fable native orchestrator, and return after durable background handoff.",
    inputSchema: z.object({
      task_name: z.string().regex(/^[a-z0-9_]+$/),
      message,
      description: z.string().trim().min(1).optional(),
      model: z.enum(MODEL_IDS),
      write: z.boolean().describe(
        "Required mutation intent. False keeps native Claude permissions; true enables terminal-parity dangerous permission bypass."
      ),
      delegation_mode: z.enum(["leaf", "claude_orchestrator"]).optional(),
      ...executionFields,
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  send_message: {
    description:
      "Experimental: durably deliver or queue a message for an exact current-root CC Agent without activating an idle Agent.",
    inputSchema: z.object({ target: exactTarget, message }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  followup_task: {
    description:
      "Experimental: deliver work to an active Agent or activate one exact-session/safely-fresh follow-up turn, returning after durable background handoff.",
    inputSchema: z.object({ target: exactTarget, message, ...executionFields, write: optionalWrite }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  wait_agent: {
    description:
      "Experimental: synchronously wait for current-root CC Agent progress or completion. Omit timeout_ms for the 10-minute default; eligible activity returns early. Cancellation stops only this observation.",
    inputSchema: z.object({
      timeout_ms: z.number().int().min(0).max(3_600_000).optional(),
      acknowledge_tokens: z.array(z.string().trim().min(1)).optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  interrupt_agent: {
    description:
      "Experimental: interrupt only an exact current-root Agent's active turn while preserving its durable identity and proven continuation path.",
    inputSchema: z.object({ target: exactTarget }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  list_agents: {
    description:
      "Experimental: list durable logical CC Agents in the current Codex root, optionally filtered by stable path prefix.",
    inputSchema: z.object({ path_prefix: z.string().trim().min(1).optional() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  read_agent_messages: {
    description:
      "Experimental: read complete recent outer-assistant text from the native Claude history bound to an exact current-root Agent without activating it.",
    inputSchema: z.object({
      target: exactTarget,
      before: z.string().trim().min(1).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
});

function contextError(detail) {
  return new Error(
    `CC MCP requires trusted Codex thread and local sandbox workspace metadata: ${detail}. ` +
    "Start a new Codex task with the installed cc-for-pein Plugin enabled."
  );
}

export function resolveCodexMcpContext(meta, signal = null) {
  const threadId = String(meta?.threadId ?? "").trim();
  if (!threadId) throw contextError("missing _meta.threadId");
  const rawCwd = meta?.[CODEX_SANDBOX_META_KEY]?.sandboxCwd;
  if (typeof rawCwd !== "string" || !rawCwd.trim()) {
    throw contextError(`missing _meta["${CODEX_SANDBOX_META_KEY}"].sandboxCwd`);
  }
  let cwd;
  try {
    const uri = new URL(rawCwd);
    if (uri.protocol !== "file:") throw contextError("sandboxCwd is not a local file URI");
    cwd = fileURLToPath(uri);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CC MCP requires")) throw error;
    throw contextError("sandboxCwd is not a valid local file URI");
  }
  if (!path.isAbsolute(cwd)) throw contextError("sandboxCwd is not absolute");
  try {
    cwd = fs.realpathSync.native(cwd);
    if (!fs.statSync(cwd).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw contextError(`trusted sandbox workspace is unavailable or no longer exists: ${cwd}`);
  }
  return {
    cwd,
    envFile: FIXED_ENV_FILE,
    abortSignal: signal,
    env: {
      ...process.env,
      CODEX_THREAD_ID: threadId,
      CC_TRUSTED_OWNER_ROOT_ID: threadId,
      CC_RUNTIME_CHECKOUT: SOURCE_ROOT,
      CC_RUNTIME_SOURCE_ROOT: SOURCE_ROOT,
      CC_RUNTIME_ENV_FILE: FIXED_ENV_FILE,
    },
  };
}

/** @returns {import("@modelcontextprotocol/sdk/types.js").CallToolResult} */
export function runtimeReceiptResult(receipt) {
  return {
    content: [{ type: "text", text: JSON.stringify(receipt) }],
    structuredContent: receipt,
  };
}

function sanitizedError(error) {
  const messageText = error instanceof Error ? error.message : String(error);
  return new Error(messageText.replaceAll("\0", "").slice(0, 8_000) || "CC MCP tool call failed.");
}

export function createCcMcpServer(options = {}) {
  const runtimeFactory = options.runtimeFactory ?? createClaudeRuntime;
  const server = new McpServer(
    { name: "cc-for-pein", version: PACKAGE_VERSION },
    {
      capabilities: { experimental: { [CODEX_SANDBOX_META_KEY]: {} } },
      instructions:
        "Use the seven Experimental CC Agent tools. Spawn is asynchronous; wait_agent is the explicit bounded join. Tool calls are scoped by trusted Codex metadata.",
    }
  );

  for (const name of CC_MCP_TOOL_NAMES) {
    const definition = TOOL_DEFINITIONS[name];
    /** @type {any} */ (server).registerTool(name, definition, async (input, extra) => {
      try {
        const runtime = runtimeFactory(resolveCodexMcpContext(extra._meta, extra.signal));
        const receipt = await runtime[name](input);
        return runtimeReceiptResult(receipt);
      } catch (error) {
        throw sanitizedError(error);
      }
    });
  }
  return server;
}

export async function runCcMcpServer() {
  const server = createCcMcpServer();
  const transport = new StdioServerTransport();
  transport.onerror = (error) => {
    process.stderr.write(`CC MCP transport error: ${error.message}\n`);
  };
  await server.connect(transport);
  const close = async () => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCcMcpServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

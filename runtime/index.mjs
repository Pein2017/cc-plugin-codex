/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sole public lifecycle seam. Jobs, Harness Drivers, native processes,
 * persistence, completion delivery, session binding, and mailbox details
 * remain internal.
 */
import { createAgentRuntime as createInternalAgentRuntime } from "./agent-runtime.mjs";

export { HARNESSDOCK_MCP_API_GENERATION } from "./mcp-api.mjs";

/**
 * @typedef {object} AgentRuntimeLifecycle
 * @property {(input: object) => Promise<object>} spawn_agent
 * @property {(input: object) => object} send_message
 * @property {(input: object) => Promise<object>} followup_task
 * @property {(input?: object) => Promise<object>} wait_agent
 * @property {(input: object) => Promise<object>} interrupt_agent
 * @property {(input: object) => object} read_agent_messages
 * @property {(input?: object) => object} list_agents
 */

/**
 * The neutral public factory. It owns no Harness identity of its own: the
 * seven operations it exposes are the same seven this generation has always
 * exposed, and which Harness serves them is an internal routing fact.
 *
 * @returns {AgentRuntimeLifecycle}
 */
export function createAgentRuntime(options = {}) {
  const runtime = createInternalAgentRuntime(options);
  return Object.freeze({
    spawn_agent: runtime.spawnAgent.bind(runtime),
    send_message: runtime.sendMessage.bind(runtime),
    followup_task: runtime.followupTask.bind(runtime),
    wait_agent: runtime.waitAgent.bind(runtime),
    interrupt_agent: runtime.interruptAgent.bind(runtime),
    read_agent_messages: runtime.readAgentMessages.bind(runtime),
    list_agents: runtime.listAgents.bind(runtime),
  });
}

/**
 * Bounded current-generation compatibility alias. It is the exact same
 * function, not a second surface: an installed checkout, an isolated MCP call
 * worker, or a Codex task discovered before the neutral name existed keeps
 * calling this one without a public generation bump. New internal callers and
 * the dependent multi-Harness generation use `createAgentRuntime()`.
 */
export { createAgentRuntime as createClaudeRuntime };

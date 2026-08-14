/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sole public lifecycle seam. Jobs, Claude processes, persistence, completion
 * delivery, session binding, and mailbox details remain internal.
 */
import { createAgentRuntime } from "./agent-runtime.mjs";

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

/** @returns {AgentRuntimeLifecycle} */
export function createClaudeRuntime(options = {}) {
  const runtime = createAgentRuntime(options);
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

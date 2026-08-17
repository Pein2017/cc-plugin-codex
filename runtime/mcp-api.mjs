/** SPDX-License-Identifier: Apache-2.0 */

/**
 * Increment only when an existing Codex task's discovered MCP contract can no
 * longer call the checkout runtime safely. Compatible runtime implementation
 * edits keep this generation and hot-load on the next isolated MCP call.
 *
 * Generation 6 is the multi-Harness generation: it adds `list_harnesses`, makes
 * `spawn_agent` require an explicitly stated Harness, full model, topology, and
 * behavioral authority, and removes `followup_task`'s write field because a
 * frozen route's authority is inherited. A task that discovered generation 5
 * cannot call it safely, so that task is told to restart rather than adapted.
 */
export const HARNESSDOCK_MCP_API_GENERATION = 6;

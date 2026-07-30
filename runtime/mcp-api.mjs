/** SPDX-License-Identifier: Apache-2.0 */

/**
 * Increment only when an existing Codex task's discovered MCP contract can no
 * longer call the checkout runtime safely. Compatible runtime implementation
 * edits keep this generation and hot-load on the next isolated MCP call.
 */
export const CC_MCP_API_GENERATION = 3;

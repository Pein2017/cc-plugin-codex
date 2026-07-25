/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stable public lifecycle seam. Worker execution, readiness probes, waits,
 * persistence, subprocess details, and recovery remain internal to the CLI.
 */
import { createInternalClaudeRuntime } from "./internal-runtime.mjs";

/**
 * @typedef {object} ClaudeRuntimeLifecycle
 * @property {(task: string, options?: object) => Promise<object>} start
 * @property {(jobId: string, message: string) => object} steer
 * @property {(jobId: string) => Promise<object>} interrupt
 * @property {(jobId: string) => Promise<object>} cancel
 * @property {(jobId?: string|null, options?: object) => object} status
 * @property {(jobId?: string|null) => object} result
 * @property {(jobId: string, message: string, options?: object) => Promise<object>} followUp
 */

/** @returns {ClaudeRuntimeLifecycle} */
export function createClaudeRuntime(options = {}) {
  const runtime = createInternalClaudeRuntime(options);
  return Object.freeze({
    start: runtime.start.bind(runtime),
    steer: runtime.steer.bind(runtime),
    interrupt: runtime.interrupt.bind(runtime),
    cancel: runtime.cancel.bind(runtime),
    status: runtime.status.bind(runtime),
    result: runtime.result.bind(runtime),
    followUp: runtime.followUp.bind(runtime),
  });
}

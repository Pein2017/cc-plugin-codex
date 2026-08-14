/** SPDX-License-Identifier: Apache-2.0 */
import { parentPort, workerData } from "node:worker_threads";

import { withRuntimeLoadGate } from "./promotion-gate.mjs";

if (!parentPort) throw new Error("HarnessDock MCP call worker requires a parent port.");

const abortController = new AbortController();
parentPort.on("message", (message) => {
  if (message?.type === "abort") abortController.abort();
});

function errorPayload(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    code: typeof /** @type {any} */ (error)?.code === "string"
      ? /** @type {any} */ (error).code
      : undefined,
  };
}

try {
  const runtimeModule = await withRuntimeLoadGate({
    gateDirectory: workerData.promotionGateDirectory,
    markerPath: workerData.loaderMarkerPath,
    load: () => import(workerData.runtimeModuleUrl),
  });
  if (runtimeModule.HARNESSDOCK_MCP_API_GENERATION !== workerData.expectedGeneration) {
    const error = new Error(
      `HARNESSDOCK_MCP_RESTART_REQUIRED: HarnessDock MCP API generation changed from ${workerData.expectedGeneration} to ` +
      `${runtimeModule.HARNESSDOCK_MCP_API_GENERATION ?? "unknown"}. Run npm run release:local in ` +
      "/data/CoordExp/cc-plugin-codex and start a new Codex task."
    );
    /** @type {any} */ (error).code = "HARNESSDOCK_MCP_RESTART_REQUIRED";
    throw error;
  }
  if (typeof runtimeModule.createClaudeRuntime !== "function") {
    throw new Error("Checkout runtime/index.mjs does not export createClaudeRuntime().");
  }
  const runtime = runtimeModule.createClaudeRuntime({
    ...workerData.context,
    abortSignal: abortController.signal,
  });
  const operation = runtime?.[workerData.operation];
  if (typeof operation !== "function") {
    const error = new Error(
      `HARNESSDOCK_MCP_RESTART_REQUIRED: checkout runtime does not implement MCP operation ${workerData.operation}. ` +
      "Run npm run release:local and start a new Codex task."
    );
    /** @type {any} */ (error).code = "HARNESSDOCK_MCP_RESTART_REQUIRED";
    throw error;
  }
  const receipt = await operation(workerData.input);
  parentPort.postMessage({ ok: true, receipt });
} catch (error) {
  parentPort.postMessage({ ok: false, error: errorPayload(error) });
}

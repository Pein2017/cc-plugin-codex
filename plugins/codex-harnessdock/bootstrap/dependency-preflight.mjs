/** SPDX-License-Identifier: Apache-2.0 */
import { createRequire } from "node:module";
import path from "node:path";

export const REQUIRED_CHECKOUT_DEPENDENCIES = Object.freeze([
  "@modelcontextprotocol/sdk/server/mcp.js",
  "zod",
]);

export function assertCheckoutDependencies(checkout, options = {}) {
  const canonicalCheckout = path.resolve(checkout);
  const resolve = options.resolve ?? createRequire(path.join(canonicalCheckout, "package.json")).resolve;
  const missing = [];
  for (const dependency of REQUIRED_CHECKOUT_DEPENDENCIES) {
    try {
      resolve(dependency);
    } catch {
      missing.push(dependency);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Checkout dependencies are missing in ${canonicalCheckout}. ` +
      `Run npm install in ${canonicalCheckout}. Missing: ${missing.join(", ")}.`
    );
  }
  return { checkout: canonicalCheckout, dependencies: [...REQUIRED_CHECKOUT_DEPENDENCIES] };
}

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stable local paths owned by this runtime. Source location, marketplace
 * identity, and Codex's versioned plugin cache never influence persisted data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_DATA_NAMESPACE = "cc";
export const LEGACY_PLUGIN_DATA_NAMESPACES = [];

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let configuredPaths = null;

export function normalizePathSlashes(value) {
  return value.replace(/\\/g, "/");
}

function canonicalPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

export function samePath(a, b, platform = process.platform) {
  const left = canonicalPath(a);
  const right = canonicalPath(b);
  return platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export function configureRuntimePaths(env = process.env) {
  const next = {
    codexHome: path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex")),
    runtimeHome: String(env.CC_RUNTIME_HOME ?? "").trim()
      ? path.resolve(env.CC_RUNTIME_HOME)
      : null,
  };
  if (
    configuredPaths &&
    (configuredPaths.codexHome !== next.codexHome ||
      configuredPaths.runtimeHome !== next.runtimeHome)
  ) {
    throw new Error(
      "Runtime path ownership is already configured with a different CODEX_HOME or CC_RUNTIME_HOME in this process."
    );
  }
  configuredPaths = next;
  return { ...next };
}

export function resolveCodexHome() {
  return configuredPaths?.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
}

export function resolvePluginsDataRoot() {
  return path.join(resolveCodexHome(), "plugins", "data");
}

export function resolveExpectedPluginDataRoot() {
  return path.join(resolvePluginsDataRoot(), PLUGIN_DATA_NAMESPACE);
}

export function resolvePluginDataRoot(namespace) {
  if (namespace !== undefined) {
    return path.join(resolvePluginsDataRoot(), namespace);
  }

  const injectedRoot = configuredPaths?.runtimeHome ?? process.env.CC_RUNTIME_HOME?.trim();
  if (injectedRoot) {
    return path.resolve(injectedRoot);
  }

  return resolveExpectedPluginDataRoot();
}

export function resolveWritablePluginDataRoots(
  primaryRoot = resolveExpectedPluginDataRoot()
) {
  return [primaryRoot];
}

export function resolvePluginStateRoot(namespace) {
  return path.join(resolvePluginDataRoot(namespace), "state");
}

export function resolvePluginRuntimeRoot(namespace) {
  return path.join(resolvePluginDataRoot(namespace), "runtime");
}

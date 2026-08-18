/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * package.json is the one human-maintained release base-version source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CANONICAL_RUNTIME_CHECKOUT = "/data/CoordExp/codex-harnessdock";
export const PACKAGE_FILE = path.join(SOURCE_ROOT, "package.json");

export function readPackageMetadata(options = {}) {
  const packageFile = options.packageFile ?? PACKAGE_FILE;
  const parsed = JSON.parse((options.readFileSync ?? fs.readFileSync)(packageFile, "utf8"));
  if (typeof parsed.name !== "string" || !parsed.name.trim()) {
    throw new Error(`Package metadata has no name: ${packageFile}`);
  }
  if (typeof parsed.version !== "string" || !parsed.version.trim() || parsed.version.includes("+")) {
    throw new Error(`Package metadata has an invalid base version: ${packageFile}`);
  }
  return Object.freeze({ name: parsed.name.trim(), version: parsed.version.trim() });
}

export function pluginVersionForCachebuster(cachebuster, packageMetadata = readPackageMetadata()) {
  const token = String(cachebuster ?? "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(token)) {
    throw new Error("Cachebuster must contain only letters, digits, dots, underscores, or hyphens.");
  }
  return `${packageMetadata.version}+codex.${token}`;
}

export function pluginBaseVersion(version) {
  return String(version ?? "").split("+", 1)[0];
}

export const PACKAGE_METADATA = readPackageMetadata();
export const PACKAGE_VERSION = PACKAGE_METADATA.version;

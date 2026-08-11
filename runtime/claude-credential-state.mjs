/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Redacted local Claude credential observation. This module never returns
 * bearer material or a token-derived digest; callers receive only a closed
 * filesystem generation and bounded expiry facts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OBSERVATION_VERSION = 1;
const MAX_CREDENTIAL_BYTES = 1024 * 1024;

function nonEmpty(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function canonicalConfigIdentity(env) {
  const configured = nonEmpty(env?.CLAUDE_CONFIG_DIR) ?? path.join(os.homedir(), ".claude");
  const resolved = path.resolve(configured);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function expiryIso(value) {
  const milliseconds = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

function expiredAt(iso, nowMs) {
  if (!iso) return null;
  const milliseconds = Date.parse(iso);
  return Number.isFinite(milliseconds) ? milliseconds <= nowMs : null;
}

function generationOf(stats) {
  return {
    dev: String(stats.dev),
    ino: String(stats.ino),
    size: String(stats.size),
    mtimeNs: String(stats.mtimeNs),
    ctimeNs: String(stats.ctimeNs),
  };
}

function projection({
  source,
  configIdentity,
  state,
  generation = null,
  accessExpiresAt = null,
  refreshExpiresAt = null,
  nowMs,
}) {
  return {
    version: OBSERVATION_VERSION,
    source,
    configIdentity,
    state,
    liveValidated: false,
    generation,
    accessExpiresAt,
    accessLocallyExpired: expiredAt(accessExpiresAt, nowMs),
    refreshExpiresAt,
    refreshLocallyExpired: expiredAt(refreshExpiresAt, nowMs),
  };
}

export function observeClaudeCredentialState(options = {}) {
  const env = options.env ?? process.env;
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const configIdentity = canonicalConfigIdentity(env);

  if (nonEmpty(env.ANTHROPIC_API_KEY)) {
    return projection({
      source: "api_key",
      configIdentity,
      state: "present",
      nowMs,
    });
  }

  const credentialFile = path.join(configIdentity, ".credentials.json");
  let stats;
  try {
    stats = fs.statSync(credentialFile, { bigint: true });
  } catch {
    return projection({
      source: "native_oauth",
      configIdentity,
      state: "missing",
      nowMs,
    });
  }
  const generation = generationOf(stats);
  if (!stats.isFile() || stats.size <= 0n || stats.size > BigInt(MAX_CREDENTIAL_BYTES)) {
    return projection({
      source: "native_oauth",
      configIdentity,
      state: "unavailable",
      generation,
      nowMs,
    });
  }

  let oauth;
  try {
    const parsed = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
    oauth = parsed?.claudeAiOauth;
  } catch {
    oauth = null;
  }
  if (!oauth || typeof oauth !== "object" || !nonEmpty(oauth.accessToken)) {
    return projection({
      source: "native_oauth",
      configIdentity,
      state: "unavailable",
      generation,
      nowMs,
    });
  }

  return projection({
    source: "native_oauth",
    configIdentity,
    state: "present",
    generation,
    accessExpiresAt: expiryIso(oauth.expiresAt),
    refreshExpiresAt: expiryIso(oauth.refreshTokenExpiresAt),
    nowMs,
  });
}

export function sameCredentialGeneration(left, right) {
  if (
    left?.version !== OBSERVATION_VERSION ||
    right?.version !== OBSERVATION_VERSION ||
    left?.source !== "native_oauth" ||
    right?.source !== "native_oauth" ||
    left?.configIdentity !== right?.configIdentity ||
    !left?.generation ||
    !right?.generation
  ) {
    return false;
  }
  return ["dev", "ino", "size", "mtimeNs", "ctimeNs"]
    .every((key) => left.generation[key] === right.generation[key]);
}

export function isNativeOAuthCredentialObservation(observation) {
  if (
    observation?.version !== OBSERVATION_VERSION ||
    observation?.source !== "native_oauth" ||
    observation?.state !== "present" ||
    observation?.liveValidated !== false ||
    typeof observation?.configIdentity !== "string" ||
    !observation.configIdentity ||
    !observation?.generation
  ) {
    return false;
  }
  return ["dev", "ino", "size", "mtimeNs", "ctimeNs"]
    .every((key) => typeof observation.generation[key] === "string" && /^\d+$/.test(observation.generation[key]));
}

export function isLocallyCurrentOAuthCredential(observation, nowMs = Date.now()) {
  if (
    !isNativeOAuthCredentialObservation(observation) ||
    !observation?.accessExpiresAt
  ) {
    return false;
  }
  const expiry = Date.parse(observation.accessExpiresAt);
  return Number.isFinite(expiry) && expiry > nowMs;
}

export { OBSERVATION_VERSION as CLAUDE_CREDENTIAL_OBSERVATION_VERSION };

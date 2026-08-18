/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Zero-model-cost compatibility evidence for the independently updated host
 * Claude Code CLI. Static help checks admit a binary; successful real turns
 * add stronger observation without launching an extra paid probe.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";

import { resolveClaudeExecutable } from "./claude-headless-adapter.mjs";
import {
  assessObservedNativeSurface,
  NATIVE_TEAM_POLICY_REVISION,
} from "./claude-native-team-policy.mjs";
import { getConfig, mutateConfig, nowIso } from "./job-store.mjs";

export const CLAUDE_CLI_SURFACE_REVISION = "hd-agent-v2";
export const REQUIRED_CLAUDE_OPTIONS = Object.freeze([
  "-p",
  "--output-format",
  "--verbose",
  "--include-partial-messages",
  "--input-format",
  "--replay-user-messages",
  "--include-hook-events",
  "--name",
  "--model",
  "--effort",
  "--resume",
  "--allowedTools",
  "--disallowedTools",
  "--append-system-prompt",
  "--agents",
  "--settings",
  "--permission-mode",
  "--dangerously-skip-permissions",
]);
export const REQUIRED_CLAUDE_VALUES = Object.freeze([
  "stream-json",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "dontAsk",
  "bypassPermissions",
]);

const PROBE_TIMEOUT_MS = 10_000;
const MAX_MISSING_SURFACE = 64;
export const MAX_NATIVE_TEAM_OBSERVATIONS = 16;
const MAX_NATIVE_TEAM_DISPLAY_NAMES = 64;
const NATIVE_TEAM_OBSERVATION_SCHEMA_VERSION = 1;
const NATIVE_TEAM_MODES = new Set(["leaf", "claude_orchestrator"]);
const SAFE_NATIVE_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_NATIVE_FINGERPRINT = /^[A-Za-z0-9_-]{1,256}$/;

function boundedText(value, maxChars = 200) {
  const text = String(value ?? "").trim();
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

export function normalizeClaudeVersion(value) {
  const text = boundedText(value, 200);
  const semantic = /\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/.exec(text)?.[1];
  return semantic ?? text;
}

function probeResultFailureCode(result, probe) {
  if (result?.status === 0) return null;
  if (result?.error?.code === "ETIMEDOUT") {
    return `${probe}_probe_timeout`;
  }
  return `${probe}_probe_failed`;
}

function compatibilityFailure(code, message) {
  const error = new Error(message);
  /** @type {any} */ (error).compatibilityCode = code;
  return error;
}

function compatibilityFailureCode(error, fallback) {
  const code = error && typeof error === "object"
    ? /** @type {any} */ (error).compatibilityCode
    : null;
  return typeof code === "string"
    ? code
    : fallback;
}

function runCommand(executable, args, cwd, env, spawnSyncImpl) {
  return spawnSyncImpl(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function fileIdentity(target, statSync = fs.statSync) {
  const stat = statSync(target);
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    size: String(stat.size),
    mtimeMs: String(Math.trunc(stat.mtimeMs)),
    mode: String(stat.mode),
  };
}

function fingerprintPayload(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function sampleClaudeExecutable(cwd, options = {}) {
  const env = options.env ?? process.env;
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const executable = options.executable ?? resolveClaudeExecutable({ env });
  const versionResult = options.versionText == null
    ? runCommand(executable, ["--version"], cwd, env, spawnSyncImpl)
    : null;
  if (versionResult) {
    const failureCode = probeResultFailureCode(versionResult, "version");
    if (failureCode) {
      throw compatibilityFailure(failureCode, "Claude version probe failed.");
    }
  }
  const versionText = boundedText(
    options.versionText ?? versionResult?.stdout ?? versionResult?.stderr,
    200,
  );
  if (!versionText) {
    throw compatibilityFailure("version_probe_empty", "Claude version probe returned no version.");
  }
  let canonicalTarget;
  let identity;
  try {
    canonicalTarget = (options.realpathSync ?? fs.realpathSync.native)(executable);
    identity = fileIdentity(canonicalTarget, options.statSync);
  } catch {
    throw compatibilityFailure(
      "executable_identity_failed",
      "Claude executable identity could not be sampled."
    );
  }
  const version = normalizeClaudeVersion(versionText);
  const fingerprint = fingerprintPayload({
    executable,
    canonicalTarget,
    identity,
    versionText,
  });
  return {
    executable,
    canonicalTarget,
    version,
    versionText,
    identity,
    fingerprint,
  };
}

function checkHelpSurface(helpText) {
  const tokens = new Set(String(helpText ?? "").match(/--?[A-Za-z][A-Za-z0-9-]*/g) ?? []);
  const missingOptions = REQUIRED_CLAUDE_OPTIONS.filter((option) => !tokens.has(option));
  const missingValues = REQUIRED_CLAUDE_VALUES.filter(
    (value) => !new RegExp(`(?:^|[^A-Za-z0-9_-])${value}(?:$|[^A-Za-z0-9_-])`).test(helpText),
  );
  return [...missingOptions, ...missingValues.map((value) => `value:${value}`)]
    .slice(0, MAX_MISSING_SURFACE);
}

/**
 * Read-only static diagnosis for operator tooling. Unlike readiness admission,
 * this never reads or writes cached compatibility state.
 */
export function diagnoseClaudeCompatibility(cwd, options = {}) {
  const availability = options.availability;
  if (availability?.available !== true) {
    return {
      status: "incompatible",
      staticCompatible: false,
      version: null,
      executable: availability?.executable ?? null,
      fingerprint: null,
      requiredSurfaceRevision: CLAUDE_CLI_SURFACE_REVISION,
      checkedAt: nowIso(),
      missingSurface: [],
      failureCode: "availability_unavailable",
    };
  }

  const env = options.env ?? process.env;
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  let before;
  try {
    before = sampleClaudeExecutable(cwd, {
      env,
      spawnSyncImpl,
      executable: availability.executable,
      versionText: availability.detail,
      realpathSync: options.realpathSync,
      statSync: options.statSync,
    });
  } catch (error) {
    return {
      status: "incompatible",
      staticCompatible: false,
      version: null,
      executable: availability.executable ?? null,
      fingerprint: null,
      requiredSurfaceRevision: CLAUDE_CLI_SURFACE_REVISION,
      checkedAt: nowIso(),
      missingSurface: [],
      failureCode: compatibilityFailureCode(error, "executable_identity_failed"),
    };
  }

  const helpResult = runCommand(before.executable, ["--help"], cwd, env, spawnSyncImpl);
  const helpFailureCode = probeResultFailureCode(helpResult, "help");
  let after = null;
  let afterFailureCode = null;
  try {
    after = sampleClaudeExecutable(cwd, {
      env,
      spawnSyncImpl,
      executable: before.executable,
      realpathSync: options.realpathSync,
      statSync: options.statSync,
    });
  } catch (error) {
    afterFailureCode = compatibilityFailureCode(error, "post_probe_failed");
  }

  const stable = after?.fingerprint === before.fingerprint;
  const missingSurface = helpFailureCode
    ? []
    : checkHelpSurface(`${helpResult.stdout ?? ""}\n${helpResult.stderr ?? ""}`);
  const failureCode = helpFailureCode ?? afterFailureCode ?? (
    !stable
      ? "executable_unstable"
      : missingSurface.length > 0
        ? "missing_surface"
        : null
  );
  return {
    status: failureCode ? "incompatible" : "statically-compatible",
    staticCompatible: failureCode == null,
    version: before.version,
    executable: before.executable,
    fingerprint: before.fingerprint,
    requiredSurfaceRevision: CLAUDE_CLI_SURFACE_REVISION,
    checkedAt: nowIso(),
    missingSurface: missingSurface.slice(0, MAX_MISSING_SURFACE),
    failureCode,
  };
}

function sameCachedProbe(current, snapshot) {
  return Boolean(
    current?.fingerprint === snapshot.fingerprint &&
    current?.requiredSurfaceRevision === CLAUDE_CLI_SURFACE_REVISION &&
    typeof current?.staticStatus === "string"
  );
}

function persistedStaticObservation(snapshot, extra = {}) {
  return {
    fingerprint: snapshot?.fingerprint ?? null,
    version: snapshot?.version ?? null,
    executable: snapshot?.canonicalTarget ?? snapshot?.executable ?? null,
    requiredSurfaceRevision: CLAUDE_CLI_SURFACE_REVISION,
    staticStatus: extra.staticStatus ?? null,
    missingSurface: Array.isArray(extra.missingSurface)
      ? extra.missingSurface.slice(0, MAX_MISSING_SURFACE)
      : [],
    failureCode: extra.failureCode ?? null,
    checkedAt: extra.checkedAt ?? null,
  };
}

function persistedSuccessfulObservation(observation) {
  if (!observation?.fingerprint) return null;
  return {
    fingerprint: observation.fingerprint,
    version: observation.version ?? null,
    executable: observation.executable ?? null,
    observedAt: observation.observedAt ?? null,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNativeFingerprint(value) {
  const fingerprint = typeof value === "string" ? value.trim() : "";
  if (!SAFE_NATIVE_FINGERPRINT.test(fingerprint)) {
    throw new Error("Native team observation has an invalid executable fingerprint.");
  }
  return fingerprint;
}

function requireNativeMode(value) {
  if (!NATIVE_TEAM_MODES.has(value)) {
    throw new Error("Native team observation has an invalid delegation mode.");
  }
  return value;
}

function sanitizeNativeNames(value, label) {
  if (!Array.isArray(value) || value.some((name) => typeof name !== "string" || !SAFE_NATIVE_NAME.test(name))) {
    throw new Error(`Native team observation has malformed ${label}.`);
  }
  return [...new Set(value)].sort((left, right) => left.localeCompare(right));
}

function boundedNativeNames(names) {
  return names.slice(0, MAX_NATIVE_TEAM_DISPLAY_NAMES);
}

function sanitizedNativeClassification(surface, delegationMode) {
  if (!isPlainObject(surface)) {
    throw new Error("Native team observation has malformed surface evidence.");
  }
  const observed = surface.observed !== false;
  const toolNames = observed
    ? sanitizeNativeNames(surface.canonicalToolNames, "tool names")
    : undefined;
  const definitionNames = sanitizeNativeNames(surface.definitionNames ?? [], "definition names");
  // Re-classify the complete normalized inventory before applying the display
  // cap.  Do not trust a receipt's booleans or pre-truncated classifications.
  const assessed = assessObservedNativeSurface({
    delegationMode,
    ...(toolNames === undefined ? {} : { toolNames }),
    definitionNames,
  });
  const teamTransportLiveValidated = delegationMode === "claude_orchestrator" &&
    surface.teamTransportLiveValidated === true;
  return {
    observed: assessed.observed,
    definitionNames: boundedNativeNames(assessed.definitionNames),
    canonicalToolNames: boundedNativeNames(assessed.canonicalToolNames),
    canonicalToolNameCount: assessed.canonicalToolNames.length,
    missingDefinitions: boundedNativeNames(assessed.missingDefinitions),
    missingNecessaryCoordinationTools: boundedNativeNames(assessed.missingNecessaryCoordinationTools),
    forbiddenTools: boundedNativeNames(assessed.forbiddenTools),
    unknownNativeTools: boundedNativeNames(assessed.unknownNativeTools),
    denySetLiveValidated: assessed.denySetLiveValidated,
    teamTransportLiveValidated,
  };
}

function sanitizedStoredNativeObservation(value) {
  if (!isPlainObject(value) || value.schemaVersion !== NATIVE_TEAM_OBSERVATION_SCHEMA_VERSION) return null;
  try {
    const fingerprint = requireNativeFingerprint(value.fingerprint);
    const delegationMode = requireNativeMode(value.delegationMode);
    const policyRevision = value.policyRevision === NATIVE_TEAM_POLICY_REVISION
      ? value.policyRevision
      : null;
    const classification = value.classification;
    if (!policyRevision || !isPlainObject(classification) || typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt))) {
      return null;
    }
    if (typeof classification.observed !== "boolean") return null;
    const observed = classification.observed;
    const normalized = {
      observed,
      definitionNames: boundedNativeNames(sanitizeNativeNames(classification.definitionNames, "definition names")),
      canonicalToolNames: boundedNativeNames(sanitizeNativeNames(classification.canonicalToolNames, "tool names")),
      canonicalToolNameCount: Number.isSafeInteger(classification.canonicalToolNameCount) &&
        classification.canonicalToolNameCount >= classification.canonicalToolNames.length
        ? classification.canonicalToolNameCount
        : classification.canonicalToolNames.length,
      missingDefinitions: boundedNativeNames(sanitizeNativeNames(classification.missingDefinitions, "missing definitions")),
      missingNecessaryCoordinationTools: boundedNativeNames(sanitizeNativeNames(
        classification.missingNecessaryCoordinationTools,
        "missing coordination tools",
      )),
      forbiddenTools: boundedNativeNames(sanitizeNativeNames(classification.forbiddenTools, "forbidden tools")),
      unknownNativeTools: boundedNativeNames(sanitizeNativeNames(classification.unknownNativeTools, "unknown tools")),
      denySetLiveValidated: false,
      teamTransportLiveValidated: delegationMode === "claude_orchestrator" &&
        classification.teamTransportLiveValidated === true,
    };
    normalized.denySetLiveValidated = observed && normalized.forbiddenTools.length === 0;
    const recomputed = assessObservedNativeSurface({
      delegationMode,
      ...(observed ? { toolNames: normalized.canonicalToolNames } : {}),
      definitionNames: normalized.definitionNames,
    });
    const completeInventory = normalized.canonicalToolNameCount === normalized.canonicalToolNames.length;
    const hasEvery = (needles, haystack) => needles.every((name) => haystack.includes(name));
    // A persisted record must be internally consistent.  For a full retained
    // inventory we recompute all decision-bearing facts.  For a capped
    // inventory, names omitted from the diagnostic display may themselves be
    // decision-bearing (e.g. ListAgents sorted after 64 unknown names), so
    // require that any retained evidence is reflected while preserving the
    // complete-inventory decision that was made before the cap.
    if (classification.teamTransportLiveValidated !== normalized.teamTransportLiveValidated ||
      JSON.stringify(normalized.missingDefinitions) !== JSON.stringify(recomputed.missingDefinitions) ||
      !hasEvery(recomputed.forbiddenTools, normalized.forbiddenTools) ||
      !hasEvery(recomputed.unknownNativeTools, normalized.unknownNativeTools) ||
      (normalized.denySetLiveValidated && recomputed.forbiddenTools.length > 0) ||
      (completeInventory && (
        classification.denySetLiveValidated !== normalized.denySetLiveValidated ||
        JSON.stringify(normalized.missingNecessaryCoordinationTools) !==
          JSON.stringify(recomputed.missingNecessaryCoordinationTools) ||
        JSON.stringify(normalized.forbiddenTools) !== JSON.stringify(recomputed.forbiddenTools) ||
        JSON.stringify(normalized.unknownNativeTools) !== JSON.stringify(recomputed.unknownNativeTools)
      ))) return null;
    return {
      schemaVersion: NATIVE_TEAM_OBSERVATION_SCHEMA_VERSION,
      fingerprint,
      delegationMode,
      policyRevision,
      classification: normalized,
      observedAt: new Date(value.observedAt).toISOString(),
    };
  } catch {
    return null;
  }
}

function readNativeTeamObservations(state) {
  const raw = Array.isArray(state?.nativeTeamObservations) ? state.nativeTeamObservations : [];
  const observations = [];
  let legacyObservationCount = 0;
  for (const value of raw) {
    const sanitized = sanitizedStoredNativeObservation(value);
    if (sanitized) observations.push(sanitized);
    else legacyObservationCount += 1;
  }
  return { observations, legacyObservationCount };
}

function orderNativeObservations(observations) {
  return observations.map((observation, index) => ({ observation, index })).sort((left, right) => {
    const time = Date.parse(left.observation.observedAt) - Date.parse(right.observation.observedAt);
    if (time !== 0) return time;
    const fingerprint = left.observation.fingerprint.localeCompare(right.observation.fingerprint);
    if (fingerprint !== 0) return fingerprint;
    const mode = left.observation.delegationMode.localeCompare(right.observation.delegationMode);
    return mode !== 0 ? mode : left.index - right.index;
  });
}

function retainBoundedNativeObservations(observations, currentFingerprint) {
  const bounded = [...observations];
  while (bounded.length > MAX_NATIVE_TEAM_OBSERVATIONS) {
    const newestCurrentByMode = new Map();
    for (const { observation } of orderNativeObservations(bounded).reverse()) {
      const key = `${observation.fingerprint}\0${observation.delegationMode}`;
      if (observation.fingerprint === currentFingerprint && !newestCurrentByMode.has(key)) {
        newestCurrentByMode.set(key, observation);
      }
    }
    const removable = orderNativeObservations(bounded).find(({ observation }) => {
      const protectedCurrent = newestCurrentByMode.get(
        `${observation.fingerprint}\0${observation.delegationMode}`,
      ) === observation;
      return !protectedCurrent && observation.fingerprint !== currentFingerprint;
    }) ?? orderNativeObservations(bounded).find(({ observation }) =>
      newestCurrentByMode.get(`${observation.fingerprint}\0${observation.delegationMode}`) !== observation
    ) ?? orderNativeObservations(bounded)[0];
    bounded.splice(removable.index, 1);
  }
  return orderNativeObservations(bounded).map(({ observation }) => observation);
}

/**
 * Persist one already-observed native initialization/transport receipt.  This
 * deliberately accepts only the prepared fingerprint, mode, and bounded
 * runtime receipt; callers must not pass prompts, events, or transcript data.
 */
export function recordNativeTeamCompatibilityObservation(
  cwd,
  prepared,
  delegationMode,
  nativeTeamSurface,
  options = {},
) {
  const fingerprint = requireNativeFingerprint(prepared?.fingerprint);
  const mode = requireNativeMode(delegationMode);
  const observedAt = options.observedAt == null ? nowIso() : new Date(options.observedAt).toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("Native team observation has an invalid timestamp.");
  }
  const observation = {
    schemaVersion: NATIVE_TEAM_OBSERVATION_SCHEMA_VERSION,
    fingerprint,
    delegationMode: mode,
    policyRevision: NATIVE_TEAM_POLICY_REVISION,
    classification: sanitizedNativeClassification(nativeTeamSurface, mode),
    observedAt,
  };
  return mutateConfig(cwd, (config) => {
    const state = sanitizedCompatibilityState(config.claudeCliCompatibility) ?? {};
    const existing = readNativeTeamObservations(state).observations;
    return {
      ...config,
      claudeCliCompatibility: {
        schemaVersion: 1,
        ...state,
        nativeTeamObservations: retainBoundedNativeObservations([...existing, observation], fingerprint),
        legacyNativeTeamObservationCount: readNativeTeamObservations(config.claudeCliCompatibility).legacyObservationCount,
      },
    };
  }).claudeCliCompatibility;
}

/** Read only the sanitized evidence; malformed/legacy entries never validate. */
export function inspectNativeTeamCompatibility(cwd, fingerprint = null) {
  const state = getConfig(cwd).claudeCliCompatibility;
  const evidence = readNativeTeamObservations(state);
  const selected = fingerprint == null
    ? []
    : evidence.observations.filter((observation) => observation.fingerprint === fingerprint);
  return {
    observations: orderNativeObservations(selected).map(({ observation }) => observation),
    legacyObservationCount: evidence.legacyObservationCount + Number(state?.legacyNativeTeamObservationCount ?? 0),
  };
}

function sanitizedCompatibilityState(state) {
  if (!state) return null;
  const current = state.current
    ? persistedStaticObservation(state.current, state.current)
    : null;
  const lastStaticallyCompatible = state.lastStaticallyCompatible
    ? persistedStaticObservation(state.lastStaticallyCompatible, state.lastStaticallyCompatible)
    : null;
  const nativeEvidence = readNativeTeamObservations(state);
  return {
    schemaVersion: 1,
    current,
    lastStaticallyCompatible,
    lastSuccessfulTurn: persistedSuccessfulObservation(state.lastSuccessfulTurn),
    nativeTeamObservations: nativeEvidence.observations,
    legacyNativeTeamObservationCount: nativeEvidence.legacyObservationCount + Number(state?.legacyNativeTeamObservationCount ?? 0),
  };
}

function containsLegacyRawEvidence(state) {
  return [state?.current, state?.lastStaticallyCompatible].some((entry) =>
    entry && (
      Object.hasOwn(entry, "versionText") ||
      Object.hasOwn(entry, "detail") ||
      Object.hasOwn(entry, "identity") ||
      Object.hasOwn(entry, "canonicalTarget") ||
      Object.hasOwn(entry, "configuredExecutable")
    )
  );
}

function publicReceipt(state) {
  const current = state?.current ?? null;
  const lastCompatible = state?.lastStaticallyCompatible ?? null;
  const lastSuccess = state?.lastSuccessfulTurn ?? null;
  const staticCompatible = current?.staticStatus === "compatible";
  const runtimeObserved = Boolean(
    staticCompatible && lastSuccess?.fingerprint === current?.fingerprint
  );
  return {
    status: staticCompatible
      ? runtimeObserved ? "observed_working" : "static_only"
      : "incompatible",
    staticCompatible,
    runtimeObserved,
    version: current?.version ?? null,
    executable: current?.executable ?? null,
    fingerprint: current?.fingerprint ?? null,
    requiredSurfaceRevision: current?.requiredSurfaceRevision ?? CLAUDE_CLI_SURFACE_REVISION,
    checkedAt: current?.checkedAt ?? null,
    missingSurface: Array.isArray(current?.missingSurface)
      ? current.missingSurface.slice(0, MAX_MISSING_SURFACE)
      : [],
    failureCode: current?.failureCode ?? null,
    lastStaticallyCompatibleVersion: lastCompatible?.version ?? null,
    lastSuccessfulVersion: lastSuccess?.version ?? null,
    lastSuccessfulAt: lastSuccess?.observedAt ?? null,
  };
}

function persistStaticProbe(cwd, initialSnapshot, options) {
  const env = options.env ?? process.env;
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  return mutateConfig(cwd, (config) => {
    let before;
    try {
      before = sampleClaudeExecutable(cwd, {
        env,
        spawnSyncImpl,
        executable: initialSnapshot.executable,
        realpathSync: options.realpathSync,
        statSync: options.statSync,
      });
    } catch (error) {
      const checkedAt = nowIso();
      const existing = /** @type {any} */ (
        sanitizedCompatibilityState(config.claudeCliCompatibility) ?? {}
      );
      return {
        ...config,
        claudeCliCompatibility: {
          schemaVersion: 1,
          ...existing,
          current: persistedStaticObservation(initialSnapshot, {
            staticStatus: "probe_failed",
            missingSurface: [],
            failureCode: compatibilityFailureCode(error, "version_probe_failed"),
            checkedAt,
          }),
        },
      };
    }

    const existing = /** @type {any} */ (
      sanitizedCompatibilityState(config.claudeCliCompatibility) ?? {}
    );
    if (sameCachedProbe(existing.current, before)) {
      return {
        ...config,
        claudeCliCompatibility: existing,
      };
    }

    const helpResult = runCommand(before.executable, ["--help"], cwd, env, spawnSyncImpl);
    const helpFailureCode = probeResultFailureCode(helpResult, "help");
    let after = null;
    let afterFailureCode = null;
    try {
      after = sampleClaudeExecutable(cwd, {
        env,
        spawnSyncImpl,
        executable: before.executable,
        realpathSync: options.realpathSync,
        statSync: options.statSync,
      });
    } catch (error) {
      afterFailureCode = compatibilityFailureCode(error, "post_probe_failed");
    }

    const stable = after?.fingerprint === before.fingerprint;
    const missingSurface = helpFailureCode
      ? []
      : checkHelpSurface(`${helpResult.stdout ?? ""}\n${helpResult.stderr ?? ""}`);
    const staticStatus = helpFailureCode || afterFailureCode
      ? "probe_failed"
      : !stable
        ? "unstable"
        : missingSurface.length > 0
          ? "missing_surface"
          : "compatible";
    const failureCode = helpFailureCode ?? afterFailureCode ?? (
      !stable
        ? "executable_unstable"
        : missingSurface.length > 0
          ? "missing_surface"
          : null
    );
    const checkedAt = nowIso();
    const current = persistedStaticObservation(before, {
      staticStatus,
      missingSurface,
      failureCode,
      checkedAt,
    });
    return {
      ...config,
      claudeCliCompatibility: {
        schemaVersion: 1,
        ...existing,
        current,
        lastStaticallyCompatible: staticStatus === "compatible"
          ? current
          : existing.lastStaticallyCompatible ?? null,
        lastSuccessfulTurn: existing.lastSuccessfulTurn ?? null,
      },
    };
  }).claudeCliCompatibility;
}

export function inspectClaudeCompatibility(cwd, options = {}) {
  const availability = options.availability;
  if (availability?.available !== true) {
    return {
      status: "incompatible",
      staticCompatible: false,
      runtimeObserved: false,
      version: null,
      executable: availability?.executable ?? null,
      fingerprint: null,
      requiredSurfaceRevision: CLAUDE_CLI_SURFACE_REVISION,
      checkedAt: null,
      missingSurface: [],
      failureCode: "availability_unavailable",
      lastStaticallyCompatibleVersion: null,
      lastSuccessfulVersion: null,
      lastSuccessfulAt: null,
    };
  }

  let snapshot;
  try {
    snapshot = sampleClaudeExecutable(cwd, {
      env: options.env,
      spawnSyncImpl: options.spawnSyncImpl,
      executable: availability.executable,
      versionText: availability.detail,
      realpathSync: options.realpathSync,
      statSync: options.statSync,
    });
  } catch (error) {
    return {
      status: "incompatible",
      staticCompatible: false,
      runtimeObserved: false,
      version: null,
      executable: availability.executable,
      fingerprint: null,
      requiredSurfaceRevision: CLAUDE_CLI_SURFACE_REVISION,
      checkedAt: null,
      missingSurface: [],
      failureCode: compatibilityFailureCode(error, "executable_identity_failed"),
      lastStaticallyCompatibleVersion: null,
      lastSuccessfulVersion: null,
      lastSuccessfulAt: null,
    };
  }

  const cached = getConfig(cwd).claudeCliCompatibility;
  if (sameCachedProbe(cached?.current, snapshot)) {
    if (!containsLegacyRawEvidence(cached)) return publicReceipt(cached);
    const sanitized = mutateConfig(cwd, (config) => ({
      ...config,
      claudeCliCompatibility: sanitizedCompatibilityState(config.claudeCliCompatibility),
    })).claudeCliCompatibility;
    return publicReceipt(sanitized);
  }
  return publicReceipt(persistStaticProbe(cwd, snapshot, options));
}

export function assertPreparedClaudeCompatibility(cwd, expected, options = {}) {
  if (!expected?.staticCompatible || !expected.fingerprint) {
    throw new Error("Prepared job has no statically compatible Claude executable receipt.");
  }
  const availability = options.availability ?? options.getAvailability?.(cwd, {
    env: options.env,
  });
  if (!availability) {
    throw new Error("Claude compatibility recheck requires current availability evidence.");
  }
  const current = inspectClaudeCompatibility(cwd, { ...options, availability });
  if (!current.staticCompatible) {
    throw new Error(formatClaudeCompatibilityError(current));
  }
  if (current.fingerprint !== expected.fingerprint) {
    throw new Error(
      `Claude Code changed after job preparation (${expected.version ?? "unknown"} -> ${current.version ?? "unknown"}); retry against the new compatible executable.`
    );
  }
  return current;
}

export function recordSuccessfulClaudeTurn(cwd, prepared, runtimeVersionText, options = {}) {
  let recorded = false;
  let reason = null;
  const runtimeVersion = normalizeClaudeVersion(runtimeVersionText);
  let postTurnSnapshot = null;
  try {
    postTurnSnapshot = sampleClaudeExecutable(cwd, {
      env: options.env,
      spawnSyncImpl: options.spawnSyncImpl,
      executable: options.executable,
      realpathSync: options.realpathSync,
      statSync: options.statSync,
    });
  } catch (error) {
    reason = compatibilityFailureCode(error, "post_turn_probe_failed");
  }
  if (!reason && postTurnSnapshot?.fingerprint !== prepared?.fingerprint) {
    reason = "post_turn_fingerprint_changed";
  }
  if (!reason && (!runtimeVersion || runtimeVersion !== postTurnSnapshot?.version)) {
    reason = "runtime_version_mismatch";
  }
  const saved = mutateConfig(cwd, (config) => {
    const state = /** @type {any} */ (
      sanitizedCompatibilityState(config.claudeCliCompatibility) ?? {}
    );
    const current = state.current;
    if (
      reason ||
      !prepared?.fingerprint ||
      current?.fingerprint !== prepared.fingerprint ||
      current?.staticStatus !== "compatible" ||
      postTurnSnapshot?.fingerprint !== current.fingerprint
    ) {
      if (!reason) reason = "compatibility_state_changed";
      return config;
    }
    recorded = true;
    return {
      ...config,
      claudeCliCompatibility: {
        schemaVersion: 1,
        ...state,
        lastSuccessfulTurn: {
          fingerprint: current.fingerprint,
          version: current.version,
          executable: current.executable,
          observedAt: nowIso(),
        },
      },
    };
  }).claudeCliCompatibility;
  return {
    recorded,
    reason: recorded ? null : reason ?? "compatibility_state_changed",
    compatibility: publicReceipt(saved),
    runtimeVersion,
  };
}

export function formatClaudeCompatibilityError(receipt) {
  const version = receipt?.version ?? "unknown version";
  const missing = Array.isArray(receipt?.missingSurface) && receipt.missingSurface.length > 0
    ? ` Missing: ${receipt.missingSurface.join(", ")}.`
    : "";
  const failure = receipt?.failureCode ? ` Failure: ${receipt.failureCode}.` : "";
  return `Claude Code ${version} is incompatible with HarnessDock runtime surface ${CLAUDE_CLI_SURFACE_REVISION}.${missing}${failure}`;
}

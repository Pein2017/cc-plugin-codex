/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Claude Code legacy Agent projection.
 *
 * Version-one and version-two Agent records were written when "no Harness was
 * recorded" could only mean Claude Code. This module is the single place where
 * that historical meaning may still be applied, so no generic or version-three
 * path has to carry a Claude default, a config-directory path, a transcript
 * layout, or a per-turn write intent.
 *
 * Everything here is a projection of what was already written. It never infers
 * a model from a name, converts a legacy Agent to version three or another
 * Harness, or rewrites a durable record on read.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  V1_HARNESS_ID,
  assertHarnessId,
  canonicalNativeSessionRef,
} from "./harness-contract.mjs";
import { validateHarnessCapabilities } from "./harness-capabilities.mjs";

/**
 * The only Harness identity a record may be given without having stated one.
 * The registry holds no default at all; this constant is the legacy
 * *interpretation*, and it applies to nothing newer than version two.
 */
export const CLAUDE_LEGACY_HARNESS_ID = V1_HARNESS_ID;

/**
 * The Harness the current public seven-operation generation is bound to.
 *
 * The generic runtime composes one Driver for that generation and must name it
 * somewhere. It names it here, by asking the owner of the legacy Claude
 * meaning, rather than by carrying a default of its own: when the dependent
 * multi-Harness generation states a route per Agent, this binding stops being
 * consulted instead of quietly widening into a fallback.
 */
export function currentGenerationHarnessId() {
  return CLAUDE_LEGACY_HARNESS_ID;
}

/**
 * The Harness one durable version-one or version-two record belongs to.
 *
 * A record that stated its Harness keeps it. A record written before Harness
 * state existed can only have meant Claude Code, and this is the single place
 * that interpretation may be applied to a job, lease, or Agent record.
 */
export function legacyRecordHarnessId(record) {
  const stated = record?.harnessId;
  if (typeof stated === "string" && stated.trim()) return stated.trim();
  return CLAUDE_LEGACY_HARNESS_ID;
}

/** The version-one Claude-shaped record. */
export const CLAUDE_LEGACY_AGENT_VERSION = 1;

/** The version-two Harness-neutral record, still mutable in its authority. */
export const CLAUDE_NEUTRAL_AGENT_VERSION = 2;

/** The two record versions whose Harness meaning was historically fixed. */
export const CLAUDE_LEGACY_AGENT_VERSIONS = Object.freeze([
  CLAUDE_LEGACY_AGENT_VERSION,
  CLAUDE_NEUTRAL_AGENT_VERSION,
]);

/** Historical per-turn write intent, which is never immutable route authority. */
const HISTORICAL_AUTHORITY_SCOPE = "historical_per_turn";

/** The terminal receipt statuses a legacy normalization may be based on. */
const TERMINAL_JOB_STATUSES = Object.freeze([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
  "unknown",
]);

/** Legacy delegation vocabulary projected onto the neutral topology names. */
const LEGACY_TOPOLOGY_PROJECTION = Object.freeze({
  leaf: "leaf",
  claude_orchestrator: "native_orchestrator",
});

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty text value.`);
  }
  return value.trim();
}

function canonicalPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

/** True for the two record versions this adapter may interpret. */
export function isLegacyAgentRecord(agent) {
  return Boolean(agent) &&
    typeof agent === "object" &&
    !Array.isArray(agent) &&
    CLAUDE_LEGACY_AGENT_VERSIONS.includes(agent.version);
}

/**
 * Fail closed before applying any legacy interpretation to a record that never
 * carried it. A version-three Agent states its whole route; borrowing a Claude
 * meaning for it would invent identity that was never recorded.
 */
export function assertLegacyAgentRecord(agent, label = "Agent record") {
  if (!isLegacyAgentRecord(agent)) {
    throw new Error(
      `${label} is not a legacy Claude Agent record ` +
      `(version ${JSON.stringify(agent?.version ?? null)}); ` +
      `only versions ${CLAUDE_LEGACY_AGENT_VERSIONS.join(", ")} carry the historical Claude meaning.`
    );
  }
  return agent;
}

/**
 * The Harness a legacy record belongs to. Version one predates Harness state
 * and can only be Claude Code; version two states its own Harness and keeps it.
 */
export function legacyHarnessId(agent) {
  assertLegacyAgentRecord(agent);
  return agent.harnessId ?? CLAUDE_LEGACY_HARNESS_ID;
}

/**
 * Exact recorded model evidence. A record that never proved its model keeps a
 * null model: no name, session, config directory, or Harness default may
 * become model evidence after the fact.
 */
export function legacySelectedModel(agent) {
  assertLegacyAgentRecord(agent);
  return agent.selectedModel ?? null;
}

/** The neutral native session reference a legacy record points at, if any. */
export function legacyNativeSessionRef(agent) {
  assertLegacyAgentRecord(agent);
  if (agent.nativeSessionRef) return agent.nativeSessionRef;
  if (agent.claudeSessionId && agent.claudeConfigDir) {
    return {
      harnessId: CLAUDE_LEGACY_HARNESS_ID,
      instanceKey: agent.claudeConfigDir,
      nativeSessionId: agent.claudeSessionId,
    };
  }
  return null;
}

/**
 * The Claude Code compatibility projection of a neutral reference. Native
 * history and legacy model recovery still read these names; another Harness
 * never receives them.
 */
export function legacyClaudeSessionProjection(reference) {
  if (!reference || reference.harnessId !== CLAUDE_LEGACY_HARNESS_ID) {
    return { claudeSessionId: null, claudeConfigDir: null };
  }
  return {
    claudeSessionId: reference.nativeSessionId ?? null,
    claudeConfigDir: reference.instanceKey ?? null,
  };
}

/** The legacy route projection: one Harness, the recorded model, its mode. */
export function legacyRouteProjection(agent) {
  return {
    harnessId: legacyHarnessId(agent),
    model: legacySelectedModel(agent),
    delegationMode: agent.delegationMode ?? "leaf",
  };
}

/**
 * The neutral topology name a legacy delegation mode validates as. This is a
 * read-side projection only: `claude_orchestrator` stays `claude_orchestrator`
 * in the durable record, because rewriting it would claim a migration that
 * never happened.
 */
export function legacyValidationTopology(agent) {
  assertLegacyAgentRecord(agent);
  const mode = agent.delegationMode ?? "leaf";
  const topology = LEGACY_TOPOLOGY_PROJECTION[mode];
  if (!topology) throw new Error(`Invalid Agent delegation mode: ${JSON.stringify(mode)}.`);
  return topology;
}

/**
 * A non-durable route projection for validation and diagnostics. It carries no
 * Driver version, capability snapshot, or immutable authority, so it can never
 * be mistaken for — or persisted as — a version-three route.
 */
export function legacyValidationRoute(agent) {
  const reference = legacyNativeSessionRef(agent);
  return Object.freeze({
    harnessId: legacyHarnessId(agent),
    instanceKey: reference?.instanceKey ?? null,
    model: legacySelectedModel(agent),
    topology: legacyValidationTopology(agent),
    durable: false,
  });
}

/**
 * Historical per-turn write intent, reported as the mutable turn evidence it
 * always was. A legacy Agent has no frozen behavioral authority to report.
 */
export function legacyTurnAuthority(job) {
  const write = job?.request?.write;
  return {
    authority: write === true
      ? "behavioral_write"
      : write === false
        ? "behavioral_read_only"
        : "unknown",
    scope: HISTORICAL_AUTHORITY_SCOPE,
    immutable: false,
  };
}

/**
 * Legacy identity is terminal. A historical record cannot be truthfully frozen
 * into immutable version-three authority, and it cannot be moved to another
 * Harness: both would rewrite evidence that was recorded under different rules.
 */
export function assertNoVersionThreeConversion(agent, label = "Legacy Claude Agent") {
  assertLegacyAgentRecord(agent, label);
  const identity = agent.path ?? agent.agentId ?? "record";
  throw new Error(
    `${label} ${identity} cannot be converted to version-three state or another Harness; ` +
    `its authority, model, and session evidence are historical.`
  );
}

/**
 * Claude Code's logical instance key is a filesystem path, so it is
 * canonicalized here: a symlinked configuration directory must not produce a
 * second identity for one native session.
 */
export function canonicalClaudeInstanceKey(value) {
  return canonicalPath(value || path.join(os.homedir(), ".claude"));
}

/** Claude Code canonicalizes its instance key; every other Harness owns its own. */
export function canonicalInstanceKeyForHarness(harnessId, requested) {
  if (harnessId === CLAUDE_LEGACY_HARNESS_ID) return canonicalClaudeInstanceKey(requested);
  return assertText(requested, "Harness instance key");
}

/** The shape a redacted Claude instance identity always has. */
const REDACTED_CLAUDE_INSTANCE_KEY_PATTERN = /^claude-config-[0-9a-f]{16}$/;

/**
 * The redacted, stable version-two/three identity of one native Claude
 * configuration.
 *
 * Version-one and version-two state name a Claude logical instance by its
 * canonical `CLAUDE_CONFIG_DIR` path, which a version-three route may not
 * carry: a durable route's instance key must be a redacted identity, not a
 * filesystem path. This is that translation, and it lives with the rest of the
 * legacy Claude meaning. It is a pure hash: it reads no record, writes no
 * record, and never returns the raw path.
 */
export function redactedClaudeInstanceKey(configDir) {
  const canonical = canonicalClaudeInstanceKey(configDir);
  return `claude-config-${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

/**
 * The logical instance namespace one Harness instance key occupies in
 * version-three state.
 *
 * For Claude Code, the legacy configuration path and the Driver's redacted key
 * name the same native configuration, so both collapse onto the one redacted
 * identity: a single Claude configuration can never enter two version-three
 * instance, session, or writer lease namespaces. An already-redacted key is
 * returned verbatim, so this is idempotent and never re-hashes an identity.
 * Every other Harness owns its own key and it is taken exactly as stated.
 */
export function versionThreeInstanceKeyForHarness(harnessId, requested) {
  if (harnessId !== CLAUDE_LEGACY_HARNESS_ID) {
    return assertText(requested, "Harness instance key");
  }
  const stated = assertText(requested, "Claude Code instance key");
  return REDACTED_CLAUDE_INSTANCE_KEY_PATTERN.test(stated) ? stated : redactedClaudeInstanceKey(stated);
}

/**
 * The Claude session/config pair native history, credential recovery, and
 * transcript lookup are bound to. A legacy record pointing at another Harness
 * has no Claude binding, and a version-three record never had one.
 */
export function legacyClaudeHistoryBinding(agent) {
  const reference = legacyNativeSessionRef(agent);
  const projection = legacyClaudeSessionProjection(reference);
  if (!projection.claudeSessionId || !projection.claudeConfigDir) return null;
  return { sessionId: projection.claudeSessionId, configDir: projection.claudeConfigDir };
}

/** Interpret a stored session binding: version one names only Claude fields. */
export function interpretLegacySessionBinding(stored) {
  return {
    ...stored,
    harnessId: stored.harnessId ?? CLAUDE_LEGACY_HARNESS_ID,
    instanceKey: stored.instanceKey ?? stored.claudeConfigDir,
    nativeSessionId: stored.nativeSessionId ?? stored.claudeSessionId,
  };
}

/**
 * Record a validated native session on a version-one record without changing
 * its schema: an active legacy worker must never be rewritten into a shape it
 * does not understand.
 */
export function applyLegacyClaudeSessionRef(agent, reference) {
  if (agent?.version !== CLAUDE_LEGACY_AGENT_VERSION) {
    throw new Error("Only a version-one Agent stores its session as Claude fields.");
  }
  if (reference.harnessId !== CLAUDE_LEGACY_HARNESS_ID) {
    throw new Error(
      `Agent ${agent.path} predates Harness state and cannot bind a ${reference.harnessId} session.`
    );
  }
  return {
    ...agent,
    claudeSessionId: reference.nativeSessionId,
    claudeConfigDir: reference.instanceKey,
  };
}

/**
 * Normalize a terminal, unowned version-one record to version two on its next
 * safe write. An active or ownership-uncertain record is never rewritten: its
 * existing worker stays the lifecycle owner until terminal reconciliation, and
 * a record whose legacy model is still unproven keeps its mutable version-one
 * shape. This is the only durable legacy rewrite, and it is never a conversion
 * to version three or to another Harness.
 *
 * The receipt must be this Agent's own terminal receipt from this Agent's own
 * root: a mismatched linkage is a caller defect, not a migration input, and is
 * refused rather than applied to the wrong record.
 */
export function migrateLegacyTerminalRecord(agent, job) {
  assertLegacyAgentRecord(agent);
  const identity = agent.path ?? agent.agentId ?? "record";
  if (!TERMINAL_JOB_STATUSES.includes(job?.status)) {
    throw new Error(
      `Legacy normalization of ${identity} requires a terminal receipt, not ${JSON.stringify(job?.status ?? null)}.`
    );
  }
  if (job?.agentId != null && job.agentId !== agent.agentId) {
    throw new Error(
      `Legacy normalization of ${identity} was given another Agent's receipt (${JSON.stringify(job.agentId)}).`
    );
  }
  if (job?.ownerRootId != null && job.ownerRootId !== agent.rootThreadId) {
    throw new Error(
      `Legacy normalization of ${identity} was given a receipt owned by another root ` +
      `(${JSON.stringify(job.ownerRootId)}).`
    );
  }
  if (agent.version !== CLAUDE_LEGACY_AGENT_VERSION) return agent;
  if (agent.activeJobId != null || !agent.selectedModel) return agent;
  const harnessId = job?.harnessId;
  const driverVersion = job?.driverVersion;
  if (!harnessId || !driverVersion || job?.harnessCapabilities == null) return agent;
  let capabilities;
  try {
    capabilities = validateHarnessCapabilities(
      job.harnessCapabilities,
      `Agent ${agent.agentId} capability snapshot`
    );
    assertHarnessId(harnessId);
  } catch {
    return agent;
  }
  const nativeSessionRef = legacyNativeSessionRef(agent);
  if (nativeSessionRef && nativeSessionRef.harnessId !== harnessId) return agent;
  if (nativeSessionRef) {
    // A legacy session pointer that cannot be expressed as a canonical neutral
    // reference stays on its version-one record rather than failing the
    // terminal write that carries completion delivery.
    try {
      canonicalNativeSessionRef(nativeSessionRef);
    } catch {
      return agent;
    }
  }
  const {
    claudeSessionId: _session,
    claudeConfigDir: _config,
    selectedEffort: _legacyEffort,
    ...rest
  } = agent;
  return {
    ...rest,
    version: CLAUDE_NEUTRAL_AGENT_VERSION,
    harnessId,
    driverVersion,
    capabilities,
    nativeSessionRef,
  };
}

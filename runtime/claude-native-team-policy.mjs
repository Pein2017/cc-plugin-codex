/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure semantic policy for the bounded Claude Native Agent Team. Transport,
 * process, environment, persistence, and retry owners consume this policy but
 * are intentionally not represented here.
 */
import { createHash } from "node:crypto";

export const NATIVE_TEAM_POLICY_REVISION = "cc-native-team-v1";

const LEAF = "leaf";
const ORCHESTRATOR = "claude_orchestrator";
const NATIVE_TEAM_LEAD = "native_team_lead";
const ORCHESTRATOR_MODELS = new Set(["claude-opus-5", "claude-fable-5"]);
const LEAF_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-fable-5",
]);

const COMMON_DENIED_TOOL_NAMES = Object.freeze([
  "Workflow",
  "ListAgents",
  "ListPeers",
  "ScheduleWakeup",
  "CronCreate",
  "CronDelete",
  "CronList",
  "CronUpdate",
  "RemoteTrigger",
  "PushNotification",
  "SendUserMessage",
  "SendUserFile",
  "SendFile",
  "EnterWorktree",
  "ExitWorktree",
]);

const TEAMMATE_DENIED_TOOL_NAMES = Object.freeze([
  ...COMMON_DENIED_TOOL_NAMES,
  "Agent",
]);

const LEAF_DENIED_TOOL_NAMES = Object.freeze([
  ...COMMON_DENIED_TOOL_NAMES,
  "Agent",
  "SendMessage",
]);

const NECESSARY_COORDINATION_TOOL_NAMES = Object.freeze([
  "Agent",
  "SendMessage",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
]);

const REQUIRED_DEFINITION_NAMES = Object.freeze(["haiku-scout", "sonnet", "opus"]);

const REVIEWED_NATIVE_TOOL_BASELINE = new Set([
  "Agent",
  "AskUserQuestion",
  "Bash",
  "Edit",
  "EnterPlanMode",
  "ExitPlanMode",
  "Glob",
  "Grep",
  "NotebookEdit",
  "Read",
  "SendMessage",
  "Skill",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
  "WebFetch",
  "WebSearch",
  "Write",
  ...COMMON_DENIED_TOOL_NAMES,
]);

const LIMITS = Object.freeze({
  maxSpawnDepth: 1,
  maxConcurrentTeammates: 3,
  maxCreations: 6,
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredText(value, description) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${description} must be non-empty text.`);
  return text;
}

function normalizeMode(value) {
  const mode = String(value ?? LEAF).trim().toLowerCase();
  if (mode !== LEAF && mode !== ORCHESTRATOR) {
    throw new Error("Unknown delegation mode. Use leaf or claude_orchestrator.");
  }
  return mode;
}

function normalizeModel(value) {
  return requiredText(value, "Claude model").toLowerCase();
}

function memberAuthority(name, write) {
  if (name === "haiku-scout") {
    return "You are a read-only scout: you must not mutate task, workspace, repository, or external state.";
  }
  return write
    ? "Mutation is behavioral authority only: change only the lead-assigned non-overlapping write surface."
    : "Read-only behavioral authority: do not mutate task, workspace, repository, or external state.";
}

function memberPrompt(name, model, write) {
  return [
    `You are the ${name} member using pinned model ${model}.`,
    memberAuthority(name, write),
    "Use the current Native Agent Team only. Omit call-level model and isolation overrides; do not use remote, worktree, or fork inputs.",
    "Do not delegate or use Agent/Workflow. You may use current-team shared tasks and SendMessage only for bounded evidence or blockers.",
    "Your brief must state intended effort, role, authority, write surface, acceptance evidence, and stop boundary; effective effort is inherited from the lead or unknown.",
    "Return bounded evidence or the exact blocker to the lead; do not claim final acceptance.",
  ].join(" ");
}

function teammateDefinitions(write) {
  return [
    ["haiku-scout", "claude-haiku-4-5"],
    ["sonnet", "claude-sonnet-5"],
    ["opus", "claude-opus-5"],
  ].map(([name, model]) => ({
    name,
    model,
    memory: "local",
    disallowedTools: [...TEAMMATE_DENIED_TOOL_NAMES],
    prompt: memberPrompt(name, model, write),
  }));
}

function leadPrompt(cohortLabel, write) {
  const authority = write
    ? "Task-scoped mutation is behavioral authority only; give each writing member a disjoint surface."
    : "Read-only behavioral authority applies to the lead and every member; only native local-memory maintenance may occur.";
  return [
    "Lead one fresh experimental Native Agent Team for this turn.",
    `Use cohort label ${cohortLabel} only for the current team; do not resume or address an earlier team.`,
    authority,
    "Use only named haiku-scout, sonnet, or opus definitions; omit call-level model, isolation, remote, worktree, and fork overrides.",
    "Give every teammate a self-contained brief with pinned model, intended effort, role, authority, write surface, acceptance evidence, and stop boundary.",
    "At most three concurrently active teammates and at most six teammate creations are behavioral cost and coordination budgets, not process-enforced limits.",
    "Keep SendMessage recipients in the current team; do not use cross-session recipients or peer-driven completed-member resume.",
    "Wait for required teammate outcomes, inspect deliverables and evidence, then return one synthesis that distinguishes intended from inherited or unknown effective effort.",
  ].join(" ");
}

function uniqueSortedNames(values, canonicalize = (value) => value) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map(canonicalize)
    .filter((value) => typeof value === "string" && value.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function isExtensionToolName(name) {
  return name.startsWith("mcp__");
}

/** Derive a stable, non-reversible current-team label from a durable job ID. */
export function deriveNativeCohortLabel(jobId) {
  const durableJobId = requiredText(jobId, "Native team policy requires a durable jobId");
  const digest = createHash("sha256").update(durableJobId).digest("hex").slice(0, 16);
  return `cc-native-team-${digest}`;
}

/**
 * Admit only semantically valid roles and describe their bounded team policy.
 * This is deliberately independent of command-line and child-process details.
 */
export function resolveNativeTeamPolicy({ model, delegationMode, write, jobId } = {}) {
  const exactModel = normalizeModel(model);
  const mode = normalizeMode(delegationMode);
  const allowsWrite = Boolean(write);

  if (exactModel === "claude-haiku-4-5" && allowsWrite) {
    throw new Error("Haiku is valid only as a write:false leaf scout.");
  }
  if (mode === ORCHESTRATOR && !ORCHESTRATOR_MODELS.has(exactModel)) {
    throw new Error(
      "claude_orchestrator delegation requires exact model claude-opus-5 or claude-fable-5."
    );
  }
  if (!LEAF_MODELS.has(exactModel)) {
    throw new Error(`Unsupported Claude model ${exactModel}.`);
  }

  if (mode === LEAF) {
    return deepFreeze({
      role: LEAF,
      cohortLabel: null,
      prompt: "Act as a leaf. Do not delegate; return one self-contained result with evidence or the exact blocker.",
      deniedToolNames: [...LEAF_DENIED_TOOL_NAMES],
      teammateDefinitions: [],
      necessaryCoordinationToolNames: [],
      limits: { ...LIMITS },
    });
  }

  const cohortLabel = deriveNativeCohortLabel(jobId);
  return deepFreeze({
    role: NATIVE_TEAM_LEAD,
    cohortLabel,
    prompt: leadPrompt(cohortLabel, allowsWrite),
    deniedToolNames: [...COMMON_DENIED_TOOL_NAMES],
    teammateDefinitions: teammateDefinitions(allowsWrite),
    necessaryCoordinationToolNames: [...NECESSARY_COORDINATION_TOOL_NAMES],
    limits: { ...LIMITS },
  });
}

/** Normalize the stream-json init name without changing unrelated tool names. */
export function canonicalizeInitToolName(name) {
  if (typeof name !== "string") return null;
  const normalized = name.trim();
  if (!normalized) return null;
  return normalized === "Task" ? "Agent" : normalized;
}

/**
 * Classify a complete observed init inventory. Callers may later bound stored
 * evidence, but must use this complete result to make admission decisions.
 */
export function assessObservedNativeSurface(input = {}) {
  const delegationMode = normalizeMode(input.delegationMode);
  const observed = Array.isArray(input.toolNames);
  const canonicalToolNames = uniqueSortedNames(input.toolNames, canonicalizeInitToolName)
    .filter((name) => !isExtensionToolName(name));
  const definitionNames = uniqueSortedNames(input.definitionNames);
  const deniedToolNames = delegationMode === LEAF
    ? LEAF_DENIED_TOOL_NAMES
    : COMMON_DENIED_TOOL_NAMES;
  const missingDefinitions = delegationMode === ORCHESTRATOR
    ? REQUIRED_DEFINITION_NAMES.filter((name) => !definitionNames.includes(name))
      .sort((left, right) => left.localeCompare(right))
    : [];
  const missingNecessaryCoordinationTools = delegationMode === ORCHESTRATOR
    ? NECESSARY_COORDINATION_TOOL_NAMES.filter((name) => !canonicalToolNames.includes(name))
    : [];
  const forbiddenTools = canonicalToolNames.filter((name) => deniedToolNames.includes(name));
  const unknownNativeTools = canonicalToolNames.filter(
    (name) => !REVIEWED_NATIVE_TOOL_BASELINE.has(name),
  );

  return deepFreeze({
    observed,
    delegationMode,
    definitionNames,
    canonicalToolNames,
    missingDefinitions,
    missingNecessaryCoordinationTools,
    forbiddenTools,
    unknownNativeTools,
    denySetLiveValidated: observed && forbiddenTools.length === 0,
    teamTransportLiveValidated: false,
  });
}

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Durable, root-scoped Agent Thread storage.  This module deliberately owns
 * registry, Agent mailbox, session-binding, and locking details so the public
 * runtime can reason in terms of one small Agent-store interface.
 */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  HARNESS_CAPABILITY_NAMES,
  validateHarnessCapabilities,
} from "./harness-capabilities.mjs";
import {
  V1_HARNESS_ID,
  assertHarnessId,
  canonicalNativeSessionRef,
  harnessSessionKey,
} from "./harness-contract.mjs";
import { resolvePluginStateRoot } from "./paths.mjs";
import { getProcessIdentity, validateProcessIdentity } from "./process-control.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";

// The registry container stays at version 1 so a root that still holds only
// version-1 Agents remains readable by a runtime without Harness support. A
// version-2 Agent record is what makes such a runtime fail closed.
export const AGENT_STORE_VERSION = 1;
export const AGENT_RECORD_VERSION = 2;
export const LEGACY_AGENT_RECORD_VERSION = 1;
export const AGENT_SESSION_BINDING_VERSION = 2;
export const AGENT_MAILBOX_VERSION = 1;

const SUPPORTED_AGENT_RECORD_VERSIONS = new Set([
  LEGACY_AGENT_RECORD_VERSION,
  AGENT_RECORD_VERSION,
]);
const SUPPORTED_SESSION_BINDING_VERSIONS = new Set([1, AGENT_SESSION_BINDING_VERSION]);

const REGISTRY_DIRECTORY = "agent-registry";
const ROOTS_DIRECTORY = "roots";
const SESSIONS_DIRECTORY = "session-bindings";
const REGISTRY_FILE = "registry.json";
const LOCK_TIMEOUT_MS = 15_000;
const LOCK_STALE_MS = 60_000;
const LOCK_RETRY_MS = 10;
const FINALIZED_JOB_ID_LIMIT = 128;
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "interrupted", "cancelled", "unknown"]);
const AGENT_STATUSES = new Set(["pending_init", "running", "completed", "interrupted", "errored"]);
const DELEGATION_MODES = new Set(["leaf", "claude_orchestrator"]);
const CONTINUATION_MODES = new Set(["exact_session", "safe_fresh", "blocked"]);
const MESSAGE_STATES = new Set(["queued", "assigned", "dispatched", "acknowledged"]);

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty text value.`);
  }
  return value.trim();
}

function assertOptionalText(value, label) {
  if (value == null) return null;
  return assertText(value, label);
}

function nowIso() {
  return new Date().toISOString();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function canonicalWorkspace(cwd) {
  return canonicalPath(resolveWorkspaceRoot(cwd));
}

function canonicalConfigDir(value) {
  return canonicalPath(value || path.join(os.homedir(), ".claude"));
}

function workspaceHash(cwd) {
  return digest(canonicalWorkspace(cwd)).slice(0, 16);
}

function rootHash(rootThreadId) {
  return digest(assertText(rootThreadId, "owner root ID")).slice(0, 32);
}

function normalizedName(value) {
  const text = assertText(value, "Agent name").normalize("NFKC").trim();
  if (text.includes("/") || text.includes("\\")) {
    throw new Error("Agent name must be one flat task-name segment.");
  }
  if (text === "." || text === "..") {
    throw new Error("Agent name must not be a relative path segment.");
  }
  return text.toLocaleLowerCase("en-US");
}

function displayName(value) {
  const text = assertText(value, "Agent name").normalize("NFKC").trim();
  normalizedName(text);
  return text;
}

function agentPath(name) {
  return `/root/${displayName(name)}`;
}

function generatedAgentId() {
  return `agent-${Date.now().toString(36)}-${randomBytes(9).toString("base64url")}`;
}

function generatedMessageId(agentId, sequence) {
  return `message-${digest(`${agentId}\0${sequence}`).slice(0, 24)}`;
}

function clone(value) {
  return structuredClone(value);
}

function protection(directory) {
  if (process.platform === "win32") {
    return {
      platform: "win32",
      protection: "not-verified",
      message: "Native Windows ACL verification is unavailable in this runtime; no owner-only ACL guarantee is claimed.",
    };
  }
  let mode = null;
  try { mode = fs.statSync(directory).mode & 0o777; } catch {}
  return {
    platform: "posix",
    protection: mode != null && (mode & 0o077) === 0 ? "owner-only" : "mode-not-verified",
    requestedDirectoryMode: "0700",
    requestedFileMode: "0600",
    effectiveDirectoryMode: mode == null ? null : mode.toString(8).padStart(4, "0"),
  };
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try { fs.chmodSync(directory, 0o700); } catch {}
  }
  return directory;
}

function fsyncDirectory(directory) {
  if (process.platform === "win32") return;
  let descriptor = null;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch {
    // Best effort: some filesystems do not expose a directory descriptor.
  } finally {
    if (descriptor != null) {
      try { fs.closeSync(descriptor); } catch {}
    }
  }
}

function writeAtomic(filePath, data) {
  const directory = path.dirname(filePath);
  ensureDirectory(directory);
  const temporary = path.join(
    directory,
    `${path.basename(filePath)}.tmp.${process.pid}.${Date.now().toString(36)}.${randomBytes(6).toString("hex")}`
  );
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporary, filePath);
    if (process.platform !== "win32") {
      try { fs.chmodSync(filePath, 0o600); } catch {}
    }
    fsyncDirectory(directory);
  } catch (error) {
    if (descriptor != null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function sleepSync(milliseconds) {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, milliseconds);
}

function fileIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function clearStaleLock(lockPath) {
  let observed = null;
  try {
    observed = fs.statSync(lockPath);
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (lock?.identity && validateProcessIdentity(lock.pid, lock.identity)) return false;
    if (!lock?.identity && Date.now() - observed.mtimeMs < LOCK_STALE_MS) return false;
  } catch {
    try {
      if (Date.now() - fs.statSync(lockPath).mtimeMs < LOCK_STALE_MS) return false;
    } catch {
      return false;
    }
  }
  try {
    const current = fs.statSync(lockPath);
    if (observed && !fileIdentity(observed, current)) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(directory, name) {
  ensureDirectory(directory);
  const lockPath = path.join(directory, name);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    clearStaleLock(lockPath);
    const token = randomBytes(16).toString("hex");
    const candidate = `${lockPath}.${process.pid}.${token}.candidate`;
    let descriptor = null;
    try {
      descriptor = fs.openSync(candidate, "wx", 0o600);
      let identity = null;
      try { identity = getProcessIdentity(process.pid); } catch {}
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, identity, token, createdAt: nowIso() }), "utf8");
      fs.fsyncSync(descriptor);
      const stat = fs.fstatSync(descriptor);
      fs.linkSync(candidate, lockPath);
      fs.unlinkSync(candidate);
      fs.closeSync(descriptor);
      return { lockPath, token, stat };
    } catch (error) {
      if (descriptor != null) {
        try { fs.closeSync(descriptor); } catch {}
      }
      try { fs.unlinkSync(candidate); } catch {}
      if (error?.code !== "EEXIST" || Date.now() >= deadline) {
        if (error?.code === "EEXIST") {
          throw Object.assign(new Error(`Timed out acquiring Agent-store lock ${lockPath}.`), { code: "ETIMEDOUT" });
        }
        throw error;
      }
      sleepSync(LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS));
    }
  }
}

function releaseLock(lock) {
  if (!lock) return;
  try {
    const stat = fs.statSync(lock.lockPath);
    const data = JSON.parse(fs.readFileSync(lock.lockPath, "utf8"));
    if (fileIdentity(lock.stat, stat) && data?.token === lock.token) fs.unlinkSync(lock.lockPath);
  } catch {}
}

function defaultRegistry(rootThreadId, workspaceRoot, directory) {
  const timestamp = nowIso();
  return {
    version: AGENT_STORE_VERSION,
    rootThreadId: assertText(rootThreadId, "owner root ID"),
    rootHash: rootHash(rootThreadId),
    workspaceRoot,
    agents: {},
    nameIndex: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    protection: protection(directory),
  };
}

/**
 * The neutral native-session reference for either schema. A version-1 record
 * carries the Claude config directory and session ID; it is interpreted as the
 * equivalent Claude Code reference without broadening its ownership.
 */
function internalNativeSessionRef(agent) {
  if (agent?.nativeSessionRef) return agent.nativeSessionRef;
  if (agent?.claudeSessionId && agent?.claudeConfigDir) {
    return {
      harnessId: V1_HARNESS_ID,
      instanceKey: agent.claudeConfigDir,
      nativeSessionId: agent.claudeSessionId,
    };
  }
  return null;
}

function interpretedHarnessId(agent) {
  return agent?.harnessId ?? V1_HARNESS_ID;
}

/** The Agent's immutable route, composed from its single-owner fields. */
function interpretedRoute(agent) {
  return {
    harnessId: interpretedHarnessId(agent),
    model: agent?.selectedModel ?? null,
    delegationMode: agent?.delegationMode ?? "leaf",
  };
}

function validateContinuation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent continuation must be an object.");
  }
  const mode = assertText(value.mode, "Agent continuation mode");
  if (!CONTINUATION_MODES.has(mode)) throw new Error(`Unsupported Agent continuation mode: ${mode}.`);
  const evidence = value.evidence && typeof value.evidence === "object" && !Array.isArray(value.evidence)
    ? value.evidence
    : null;
  if (!evidence) throw new Error("Agent continuation must carry evidence.");
  return { mode, evidence: clone(evidence) };
}

function validateMessage(message, agentId, previousSequence) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Agent mailbox contains an invalid message.");
  }
  if (message.version !== AGENT_MAILBOX_VERSION) {
    throw new Error(`Unsupported Agent mailbox message version: ${message.version}.`);
  }
  const sequence = Number(message.sequence);
  if (!Number.isSafeInteger(sequence) || sequence !== previousSequence + 1) {
    throw new Error("Agent mailbox sequence must be contiguous.");
  }
  if (message.agentId !== agentId || message.messageId !== generatedMessageId(agentId, sequence)) {
    throw new Error("Agent mailbox message identity is invalid.");
  }
  assertText(message.text, "Agent mailbox message text");
  if (!MESSAGE_STATES.has(message.state)) throw new Error(`Invalid Agent message state: ${message.state}.`);
  if (message.state === "queued" && message.assignedJobId != null) {
    throw new Error("Queued Agent mailbox message must not have an assigned job.");
  }
  if (["assigned", "dispatched", "acknowledged"].includes(message.state)) {
    assertText(message.assignedJobId, "Agent mailbox assigned job ID");
  }
  return sequence;
}

function validateAgent(agent, rootThreadId, workspaceRoot) {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    throw new Error("Agent record must be an object.");
  }
  if (!SUPPORTED_AGENT_RECORD_VERSIONS.has(agent.version)) {
    throw new Error(`Unsupported Agent record version: ${agent.version}.`);
  }
  assertText(agent.agentId, "Agent ID");
  if (agent.rootThreadId !== rootThreadId) throw new Error("Agent root does not match its registry.");
  if (agent.workspaceRoot !== workspaceRoot) throw new Error("Agent workspace does not match its registry.");
  const name = displayName(agent.name);
  if (agent.normalizedName !== normalizedName(name) || agent.path !== agentPath(name)) {
    throw new Error("Agent name or flat path is invalid.");
  }
  if (!AGENT_STATUSES.has(agent.status)) throw new Error(`Invalid Agent lifecycle status: ${agent.status}.`);
  validateContinuation(agent.continuation);
  if (agent.activeJobId != null) assertText(agent.activeJobId, "Agent active job ID");
  if (agent.latestJobId != null) assertText(agent.latestJobId, "Agent latest job ID");
  if (agent.selectedModel != null) assertText(agent.selectedModel, "Agent selected model");
  if (!DELEGATION_MODES.has(agent.delegationMode)) {
    throw new Error(`Invalid Agent delegation mode: ${agent.delegationMode}.`);
  }
  if (agent.finalizedJobIds != null) {
    if (!Array.isArray(agent.finalizedJobIds) || agent.finalizedJobIds.length > FINALIZED_JOB_ID_LIMIT) {
      throw new Error("Agent finalized job IDs must be a bounded array.");
    }
    const finalized = agent.finalizedJobIds.map((jobId) => assertText(jobId, "Agent finalized job ID"));
    if (new Set(finalized).size !== finalized.length) throw new Error("Agent finalized job IDs must be unique.");
  }
  if (agent.version === AGENT_RECORD_VERSION) {
    assertHarnessId(agent.harnessId);
    assertText(agent.driverVersion, "Agent Driver version");
    validateHarnessCapabilities(agent.capabilities, `Agent ${agent.agentId} capability snapshot`);
    if (agent.nativeSessionRef != null) {
      const nativeSession = canonicalNativeSessionRef(agent.nativeSessionRef);
      if (nativeSession.harnessId !== agent.harnessId) {
        throw new Error(
          `Agent native session belongs to Harness ${nativeSession.harnessId}, not ${agent.harnessId}.`
        );
      }
    }
    if (agent.claudeSessionId != null || agent.claudeConfigDir != null) {
      throw new Error("A version-2 Agent stores its native session only as a neutral reference.");
    }
  } else {
    if (
      agent.harnessId != null ||
      agent.driverVersion != null ||
      agent.nativeSessionRef != null ||
      agent.capabilities != null
    ) {
      throw new Error("A version-1 Agent must not carry Harness-neutral fields.");
    }
    if (agent.claudeSessionId != null) {
      assertText(agent.claudeSessionId, "Agent Claude session ID");
      assertText(agent.claudeConfigDir, "Agent Claude config directory");
    }
  }
  if (!agent.mailbox || typeof agent.mailbox !== "object" || Array.isArray(agent.mailbox)) {
    throw new Error("Agent mailbox must be an object.");
  }
  if (agent.mailbox.version !== AGENT_MAILBOX_VERSION) throw new Error("Unsupported Agent mailbox version.");
  let previous = 0;
  for (const message of agent.mailbox.messages ?? []) previous = validateMessage(message, agent.agentId, previous);
  if (Number(agent.mailbox.nextSequence) !== previous + 1) {
    throw new Error("Agent mailbox next sequence is inconsistent.");
  }
  return agent;
}

function validateRegistry(registry, rootThreadId, workspaceRoot, directory) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error("Agent registry must be an object.");
  }
  if (registry.version !== AGENT_STORE_VERSION) throw new Error(`Unsupported Agent registry version: ${registry.version}.`);
  const root = assertText(rootThreadId, "owner root ID");
  if (registry.rootThreadId !== root || registry.rootHash !== rootHash(root)) {
    throw new Error("Agent registry root identity is invalid.");
  }
  if (registry.workspaceRoot !== workspaceRoot) throw new Error("Agent registry workspace is invalid.");
  if (!registry.agents || typeof registry.agents !== "object" || Array.isArray(registry.agents)) {
    throw new Error("Agent registry agents index is invalid.");
  }
  if (!registry.nameIndex || typeof registry.nameIndex !== "object" || Array.isArray(registry.nameIndex)) {
    throw new Error("Agent registry name index is invalid.");
  }
  const expectedNames = {};
  const normalizedAgents = {};
  for (const [agentId, agent] of Object.entries(registry.agents)) {
    if (agentId !== agent.agentId) throw new Error("Agent registry ID index is invalid.");
    const normalizedAgent = {
      ...agent,
      delegationMode: agent.delegationMode ?? "leaf",
    };
    validateAgent(normalizedAgent, root, workspaceRoot);
    if (expectedNames[normalizedAgent.normalizedName]) throw new Error("Agent registry contains duplicate normalized names.");
    expectedNames[normalizedAgent.normalizedName] = agentId;
    normalizedAgents[agentId] = normalizedAgent;
  }
  if (JSON.stringify(Object.keys(expectedNames).sort()) !== JSON.stringify(Object.keys(registry.nameIndex).sort())) {
    throw new Error("Agent registry name index does not match records.");
  }
  for (const [name, agentId] of Object.entries(registry.nameIndex)) {
    if (expectedNames[name] !== agentId) throw new Error("Agent registry name index entry is invalid.");
  }
  return {
    ...registry,
    agents: normalizedAgents,
    protection: registry.protection ?? protection(directory),
  };
}

/**
 * Canonical `(harnessId, instanceKey, nativeSessionId)` binding identity. For
 * Claude Code this reproduces the version-1 `(config dir, session)` digest, so
 * a runtime on either schema resolves the same ownership record.
 */
function sessionBindingKey(reference) {
  return harnessSessionKey(reference);
}

function layout(cwd, rootThreadId) {
  const root = assertText(rootThreadId, "owner root ID");
  const pluginStateRoot = resolvePluginStateRoot();
  const base = path.join(pluginStateRoot, workspaceHash(cwd), REGISTRY_DIRECTORY);
  const rootDirectory = path.join(base, ROOTS_DIRECTORY, rootHash(root));
  return {
    base,
    rootDirectory,
    registryFile: path.join(rootDirectory, REGISTRY_FILE),
    // A native Claude session can be resumed from another workspace. Bind it
    // once for the whole checkout runtime, matching the global session lease
    // scope rather than accidentally duplicating authority per workspace.
    sessionsDirectory: path.join(pluginStateRoot, SESSIONS_DIRECTORY),
  };
}

function readRegistry(cwd, rootThreadId, create = false) {
  const workspaceRoot = canonicalWorkspace(cwd);
  const paths = layout(cwd, rootThreadId);
  const directory = create ? ensureDirectory(paths.rootDirectory) : paths.rootDirectory;
  try {
    return validateRegistry(JSON.parse(fs.readFileSync(paths.registryFile, "utf8")), rootThreadId, workspaceRoot, directory);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function withRegistry(cwd, rootThreadId, operation) {
  const paths = layout(cwd, rootThreadId);
  const directory = ensureDirectory(paths.rootDirectory);
  const lock = acquireLock(directory, "registry.lock");
  try {
    const workspaceRoot = canonicalWorkspace(cwd);
    const registry = readRegistry(cwd, rootThreadId, true) ?? defaultRegistry(rootThreadId, workspaceRoot, directory);
    const result = operation(registry, paths);
    if (!result || typeof result !== "object" || !("registry" in result)) {
      throw new Error("Agent registry mutation must return a registry result.");
    }
    const updated = {
      ...result.registry,
      version: AGENT_STORE_VERSION,
      rootThreadId: assertText(rootThreadId, "owner root ID"),
      rootHash: rootHash(rootThreadId),
      workspaceRoot,
      updatedAt: nowIso(),
      protection: protection(directory),
    };
    validateRegistry(updated, rootThreadId, workspaceRoot, directory);
    if (result.write !== false) writeAtomic(paths.registryFile, updated);
    return { ...result, registry: updated };
  } finally {
    releaseLock(lock);
  }
}

function publicAgent(agent) {
  const mailbox = agent.mailbox ?? { messages: [] };
  const nativeSessionRef = internalNativeSessionRef(agent);
  const claudeSession = nativeSessionRef?.harnessId === V1_HARNESS_ID ? nativeSessionRef : null;
  return {
    version: agent.version,
    agentId: agent.agentId,
    path: agent.path,
    name: agent.name,
    description: agent.description,
    harnessId: interpretedHarnessId(agent),
    route: interpretedRoute(agent),
    driverVersion: agent.driverVersion ?? null,
    capabilities: agent.capabilities ?? null,
    nativeSessionRef,
    selectedModel: agent.selectedModel ?? null,
    delegationMode: agent.delegationMode ?? "leaf",
    rootThreadId: agent.rootThreadId,
    workspaceRoot: agent.workspaceRoot,
    activeJobId: agent.activeJobId,
    latestJobId: agent.latestJobId,
    // The Claude Code projection of the neutral reference. Native history and
    // legacy model recovery still read these names.
    claudeSessionId: claudeSession?.nativeSessionId ?? null,
    claudeConfigDir: claudeSession?.instanceKey ?? null,
    status: agent.status,
    continuation: clone(agent.continuation),
    latestCompletionSequence: agent.latestCompletionSequence,
    mailbox: {
      nextSequence: mailbox.nextSequence,
      queuedCount: mailbox.messages.filter((message) => message.state === "queued").length,
      assignedCount: mailbox.messages.filter((message) => message.state === "assigned").length,
      dispatchedCount: mailbox.messages.filter((message) => message.state === "dispatched").length,
      acknowledgedCount: mailbox.messages.filter((message) => message.state === "acknowledged").length,
    },
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

function internalAgent(registry, target) {
  const reference = assertText(target, "Agent target");
  if (registry.agents[reference]) return registry.agents[reference];
  const byPath = Object.values(registry.agents).find((agent) => agent.path === reference);
  if (byPath) return byPath;
  const agentId = registry.nameIndex[normalizedName(reference)];
  if (agentId && registry.agents[agentId]) return registry.agents[agentId];
  throw new Error("No Agent with that exact ID, path, or name exists in this root.");
}

function continuation(mode, evidence) {
  return { mode, evidence: { ...evidence, observedAt: evidence?.observedAt ?? nowIso() } };
}

/**
 * The Harness contract a store may write. A read-only store (terminal session
 * binding, operator listing) needs only the interpretation of version-1 state;
 * a store that creates Agents must be given the resolved Driver's accepted
 * version and capability snapshot.
 */
function normalizeStoreHarness(harness, claudeConfigDir) {
  const harnessId = harness == null
    ? V1_HARNESS_ID
    : assertHarnessId(harness.harnessId);
  const requestedInstanceKey = harness?.instanceKey ?? claudeConfigDir;
  const instanceKey = harnessId === V1_HARNESS_ID
    ? canonicalConfigDir(requestedInstanceKey)
    : assertText(requestedInstanceKey, "Agent store Harness instance key");
  if (!harness) {
    return { harnessId: V1_HARNESS_ID, instanceKey, driverVersion: null, capabilities: null };
  }
  return {
    harnessId,
    instanceKey,
    driverVersion: harness.driverVersion == null
      ? null
      : assertText(harness.driverVersion, "Agent store Driver version"),
    capabilities: harness.capabilities == null
      ? null
      : validateHarnessCapabilities(harness.capabilities, "Agent store capability snapshot"),
  };
}

/**
 * A store that was not given a resolved Driver may read and bind existing
 * state, but it cannot create an Agent: there is no accepted contract to record.
 */
function creationHarnessContract(input, storeHarness) {
  for (const key of ["harnessId", "driverVersion", "capabilities"]) {
    if (input?.[key] != null) {
      throw new Error(
        `Agent creation does not accept ${key}; the resolved Agent store Driver contract is authoritative.`
      );
    }
  }
  const driverVersion = storeHarness.driverVersion;
  const capabilities = storeHarness.capabilities;
  if (!driverVersion || capabilities == null) {
    throw new Error(
      "Creating an Agent requires the resolved Harness Driver version and capability snapshot; " +
      "this Agent store was opened without one."
    );
  }
  return {
    driverVersion: assertText(driverVersion, "Agent Driver version"),
    capabilities: validateHarnessCapabilities(capabilities, "Agent capability snapshot"),
  };
}

function recordFromInput(input, rootThreadId, workspaceRoot, storeHarness) {
  const name = displayName(input?.taskName ?? input?.task_name ?? input?.name);
  const timestamp = nowIso();
  const agentId = generatedAgentId();
  const initialMessageText = input?.initialMessage == null
    ? null
    : assertText(input.initialMessage, "Agent initial message");
  const initialMessages = initialMessageText == null
    ? []
    : [{
        version: AGENT_MAILBOX_VERSION,
        messageId: generatedMessageId(agentId, 1),
        agentId,
        sequence: 1,
        text: initialMessageText,
        kind: "spawn_agent",
        state: "queued",
        assignedJobId: null,
        queuedAt: timestamp,
        assignedAt: null,
        deliveryIntent: null,
        dispatchedAt: null,
        acknowledgedAt: null,
      }];
  return {
    // New Agents are always written in the version-2 Harness-neutral schema.
    version: AGENT_RECORD_VERSION,
    agentId,
    rootThreadId,
    workspaceRoot,
    name,
    normalizedName: normalizedName(name),
    path: agentPath(name),
    description: input?.description == null ? null : assertText(input.description, "Agent description"),
    harnessId: storeHarness.harnessId,
    ...creationHarnessContract(input, storeHarness),
    selectedModel: input?.selectedModel == null
      ? null
      : assertText(input.selectedModel, "Agent selected model"),
    delegationMode: input?.delegationMode ?? "leaf",
    activeJobId: null,
    latestJobId: null,
    nativeSessionRef: null,
    status: "pending_init",
    continuation: continuation("safe_fresh", { reason: "new_agent_no_session" }),
    latestCompletionSequence: 0,
    lastTerminalJobId: null,
    finalizedJobIds: [],
    mailbox: {
      version: AGENT_MAILBOX_VERSION,
      nextSequence: initialMessages.length + 1,
      messages: initialMessages,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeJobId(value) {
  return assertText(value, "Agent job ID");
}

function jobSessionId(job) {
  const value = job?.threadId ?? job?.result?.sessionId ?? job?.recoverability?.exactSessionId ?? null;
  return value == null ? null : assertText(value, "Claude session ID");
}

function jobContinuation(job, priorSession) {
  const recoverability = job?.recoverability ?? {};
  const exactSessionId = recoverability?.resumable && recoverability.mode === "exact_session"
    ? (recoverability.exactSessionId ?? jobSessionId(job))
    : null;
  if (exactSessionId) {
    if (priorSession && priorSession !== exactSessionId) {
      return continuation("blocked", {
        reason: "session_drift",
        expectedSessionId: priorSession,
        observedSessionId: exactSessionId,
        jobId: job.id,
      });
    }
    return continuation("exact_session", {
      reason: recoverability.reason ?? "terminal_exact_session",
      sessionId: exactSessionId,
      jobId: job.id,
    });
  }
  const noSideEffects = job?.safeFresh === true || job?.recoverability?.mode === "safe_fresh" || job?.result?.noSideEffects === true;
  if (noSideEffects) {
    return continuation("safe_fresh", {
      reason: recoverability.reason ?? "receipt_proven_safe_fresh",
      jobId: job.id,
    });
  }
  return continuation("blocked", {
    reason: recoverability.reason ?? job?.errorMessage ?? "terminal_turn_not_proven_resumable",
    jobId: job.id,
  });
}

/**
 * Normalize a terminal, unowned version-1 record to version 2 on its next safe
 * write. An active or ownership-uncertain record is never rewritten: its
 * existing worker stays the lifecycle owner until terminal reconciliation, and
 * a record whose legacy model is still unproven keeps its mutable v1 shape.
 */
function normalizedTerminalRecord(agent, job) {
  if (agent.version === AGENT_RECORD_VERSION) return agent;
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
  const nativeSessionRef = internalNativeSessionRef(agent);
  if (nativeSessionRef && nativeSessionRef.harnessId !== harnessId) return agent;
  if (nativeSessionRef) {
    // A legacy session pointer that cannot be expressed as a canonical neutral
    // reference stays on its version-1 record rather than failing the terminal
    // write that carries completion delivery.
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
    version: AGENT_RECORD_VERSION,
    harnessId,
    driverVersion,
    capabilities,
    nativeSessionRef,
  };
}

/**
 * A Driver that does not declare exact continuation never produces an
 * exact-resume pointer. The accepted snapshot recorded on the Agent, not the
 * currently registered Driver, decides what its terminal session may claim.
 */
function boundedContinuation(agent, next) {
  const accepted = agent?.capabilities?.continuation ?? null;
  if (next.mode !== "exact_session" || !accepted || accepted === "exact_resume") return next;
  return continuation("safe_fresh", {
    ...next.evidence,
    reason: "driver_continuation_fresh_only",
    acceptedContinuation: accepted,
  });
}

function lifecycleFromJob(job) {
  if (job.status === "completed") return "completed";
  if (job.status === "interrupted") return "interrupted";
  return "errored";
}

function updateMailboxMessages(agent, updater) {
  const mailbox = clone(agent.mailbox);
  const messages = updater(mailbox.messages);
  return { ...agent, mailbox: { ...mailbox, messages }, updatedAt: nowIso() };
}

function redactedAgent(agent) {
  return {
    agentId: agent.agentId,
    path: agent.path,
    name: agent.name,
    rootHash: rootHash(agent.rootThreadId),
    harnessId: interpretedHarnessId(agent),
    status: agent.status,
    delegationMode: agent.delegationMode ?? "leaf",
    activeJobId: agent.activeJobId,
    latestJobId: agent.latestJobId,
    continuation: { mode: agent.continuation.mode },
    updatedAt: agent.updatedAt,
  };
}

function listRootRegistryFiles(cwd) {
  const base = path.join(resolvePluginStateRoot(), workspaceHash(cwd), REGISTRY_DIRECTORY, ROOTS_DIRECTORY);
  try {
    return fs.readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(base, entry.name, REGISTRY_FILE));
  } catch {
    return [];
  }
}

/**
 * Creates the sole Agent persistence seam used by the v0.2 runtime. ownerRootId
 * is a logical scope selected by the host bootstrap; it is not treated as a
 * security authorization primitive here.
 */
/**
 * @param {{ cwd?: string, ownerRootId?: string, claudeConfigDir?: string,
 *   harness?: { harnessId?: string, instanceKey?: string, driverVersion?: string,
 *   capabilities?: object } }} [options]
 */
export function createAgentStore({ cwd, ownerRootId, claudeConfigDir, harness } = {}) {
  const workspace = assertText(cwd, "workspace cwd");
  const root = assertText(ownerRootId, "owner root ID");
  const storeHarness = normalizeStoreHarness(harness, claudeConfigDir);
  const defaultClaudeConfigDir = storeHarness.instanceKey;

  function getRegistry() {
    return readRegistry(workspace, root, false);
  }

  function createAgent(input = {}) {
    const candidate = recordFromInput(input, root, canonicalWorkspace(workspace), storeHarness);
    const result = withRegistry(workspace, root, (registry) => {
      const conflictId = registry.nameIndex[candidate.normalizedName];
      if (conflictId) {
        const conflict = registry.agents[conflictId];
        throw new Error(`Agent name ${JSON.stringify(candidate.name)} already belongs to ${conflict.path} (${conflict.agentId}).`);
      }
      const agents = { ...registry.agents, [candidate.agentId]: candidate };
      const nameIndex = { ...registry.nameIndex, [candidate.normalizedName]: candidate.agentId };
      return { registry: { ...registry, agents, nameIndex }, agent: candidate };
    });
    return publicAgent(result.agent);
  }

  function readAgent(target) {
    const registry = getRegistry();
    if (!registry) return null;
    try { return publicAgent(internalAgent(registry, target)); } catch { return null; }
  }

  function resolveTarget(target) {
    const agent = readAgent(target);
    if (!agent) throw new Error("No Agent with that exact ID, path, or name exists in this root.");
    return agent;
  }

  function listAgents(options = {}) {
    const requestedPrefix = options.pathPrefix == null
      ? null
      : assertText(options.pathPrefix, "Agent path prefix");
    const prefix = requestedPrefix === "/root" ? null : requestedPrefix;
    if (prefix != null) {
      if (!prefix.startsWith("/root/")) {
        throw new Error("Agent path prefix must be /root or begin with /root/.");
      }
      const segments = prefix === "/root/"
        ? []
        : prefix.slice("/root/".length).split("/");
      if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
        throw new Error("Agent path prefix must be /root or a non-relative /root/... path.");
      }
    }
    const registry = getRegistry();
    if (!registry) return [];
    return Object.values(registry.agents)
      .filter((agent) => prefix == null || agent.path.startsWith(prefix))
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(publicAgent);
  }

  function listAllAgents() {
    return listRootRegistryFiles(workspace)
      .flatMap((filePath) => {
        try {
          const registry = JSON.parse(fs.readFileSync(filePath, "utf8"));
          return Object.values(registry.agents ?? {}).map(redactedAgent);
        } catch {
          return [];
        }
      })
      .sort((left, right) => left.path.localeCompare(right.path) || left.agentId.localeCompare(right.agentId));
  }

  function updateAgent(target, updater) {
    if (typeof updater !== "function") throw new Error("Agent updater must be a function.");
    const result = withRegistry(workspace, root, (registry) => {
      const current = internalAgent(registry, target);
      const next = updater(clone(current));
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        throw new Error("Agent updater must return an Agent record.");
      }
      const immutable = [
        "version",
        "agentId",
        "rootThreadId",
        "workspaceRoot",
        "name",
        "normalizedName",
        "path",
        "delegationMode",
        "createdAt",
        // A version-2 Agent's Harness and model route are fixed at creation.
        // Version-1 records still allow the legacy model backfill to complete.
        ...(current.version === AGENT_RECORD_VERSION
          ? ["harnessId", "driverVersion", "selectedModel"]
          : []),
      ];
      for (const key of immutable) {
        if (next[key] !== current[key]) throw new Error(`Agent updater must not change immutable field ${key}.`);
      }
      if (
        current.version === AGENT_RECORD_VERSION &&
        HARNESS_CAPABILITY_NAMES.some(
          (name) => next.capabilities?.[name] !== current.capabilities?.[name]
        )
      ) {
        throw new Error("Agent updater must not change immutable field capabilities.");
      }
      const agent = { ...next, updatedAt: nowIso() };
      return { registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } }, agent };
    });
    return publicAgent(result.agent);
  }

  function rollbackReservation(target, options = {}) {
    const result = withRegistry(workspace, root, (registry) => {
      const agent = internalAgent(registry, target);
      if (
        agent.status !== "pending_init" ||
        agent.activeJobId ||
        agent.latestJobId ||
        internalNativeSessionRef(agent)
      ) {
        return { registry, write: false, rolledBack: false, reason: "agent_already_launched" };
      }
      const removableMessageId = options.removableMessageId == null
        ? null
        : assertText(options.removableMessageId, "Agent removable message ID");
      const soleRemovableMessage = agent.mailbox.messages.length === 1 &&
        removableMessageId != null &&
        agent.mailbox.messages[0].messageId === removableMessageId &&
        agent.mailbox.messages[0].state === "queued";
      if (
        agent.mailbox.messages.length > 0 &&
        !soleRemovableMessage &&
        options.dropQueuedMessages !== true
      ) {
        return { registry, write: false, rolledBack: false, reason: "queued_messages_present" };
      }
      const agents = { ...registry.agents };
      const nameIndex = { ...registry.nameIndex };
      delete agents[agent.agentId];
      delete nameIndex[agent.normalizedName];
      return { registry: { ...registry, agents, nameIndex }, rolledBack: true, reason: "prelaunch_reservation" };
    });
    return { rolledBack: Boolean(result.rolledBack), reason: result.reason ?? null };
  }

  function reserveActivation(target, jobId, options = {}) {
    const id = normalizeJobId(jobId);
    const result = withRegistry(workspace, root, (registry) => {
      const current = internalAgent(registry, target);
      if (current.activeJobId) {
        return { registry, write: false, reserved: false, reason: "already_active", agent: current, assignedMessages: [] };
      }
      if (current.continuation.mode === "blocked") {
        return { registry, write: false, reserved: false, reason: "continuation_blocked", agent: current, assignedMessages: [] };
      }
      if (current.status === "pending_init" && options.initial !== true) {
        return { registry, write: false, reserved: false, reason: "initial_turn_required", agent: current, assignedMessages: [] };
      }
      const activationReservedAt = nowIso();
      const assignedMessages = current.mailbox.messages
        .filter((message) => message.state === "queued")
        .map((message) => ({
          ...message,
          state: "assigned",
          assignedJobId: id,
          assignedAt: activationReservedAt,
          // This reservation is the durable handoff to jobs.start(prompt).
          // Reconciliation must never reinterpret these entries as stream
          // steering while the job is being published.
          deliveryIntent: "initial_prompt",
        }));
      const assignedById = new Map(assignedMessages.map((message) => [message.messageId, message]));
      const agent = updateMailboxMessages({
        ...current,
        activeJobId: id,
        latestJobId: current.latestJobId,
        status: "running",
        continuation: continuation(current.continuation.mode, {
          ...current.continuation.evidence,
          activationJobId: id,
          activationKind: options.initial === true ? "initial" : "followup",
          activationReservedAt,
          activationPreviousStatus: current.status,
          activationPreviousContinuation: clone(current.continuation),
        }),
      }, (messages) => messages.map((message) => assignedById.get(message.messageId) ?? message));
      return {
        registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } },
        reserved: true,
        reason: null,
        agent,
        assignedMessages,
      };
    });
    return {
      reserved: Boolean(result.reserved),
      reason: result.reason,
      agent: publicAgent(result.agent),
      assignedMessages: clone(result.assignedMessages),
    };
  }

  function enqueueMessage(target, text, options = {}) {
    const messageText = assertText(text, "Agent message");
    const result = withRegistry(workspace, root, (registry) => {
      const current = internalAgent(registry, target);
      if (current.continuation.mode === "blocked") {
        throw new Error(`Agent ${current.path} has blocked continuation and cannot accept an undeliverable message.`);
      }
      const sequence = current.mailbox.nextSequence;
      const assignedJobId = current.activeJobId ?? null;
      const message = {
        version: AGENT_MAILBOX_VERSION,
        messageId: generatedMessageId(current.agentId, sequence),
        agentId: current.agentId,
        sequence,
        text: messageText,
        kind: options.kind ?? "message",
        state: assignedJobId ? "assigned" : "queued",
        assignedJobId,
        queuedAt: nowIso(),
        assignedAt: assignedJobId ? nowIso() : null,
        deliveryIntent: assignedJobId ? "steering" : null,
        dispatchedAt: null,
        acknowledgedAt: null,
      };
      const agent = updateMailboxMessages(current, (messages) => [...messages, message]);
      agent.mailbox.nextSequence = sequence + 1;
      return {
        registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } },
        agent,
        message,
        delivery: assignedJobId ? "assigned_active" : "queued_no_turn",
      };
    });
    return { agent: publicAgent(result.agent), message: clone(result.message), delivery: result.delivery };
  }

  function assignQueuedMessages(target, jobId) {
    const id = normalizeJobId(jobId);
    const result = withRegistry(workspace, root, (registry) => {
      const current = internalAgent(registry, target);
      if (current.activeJobId !== id) throw new Error(`Agent ${current.path} is not active for job ${id}.`);
      const assigned = [];
      const agent = updateMailboxMessages(current, (messages) => messages.map((message) => {
        if (message.state !== "queued") return message;
        const next = {
          ...message,
          state: "assigned",
          assignedJobId: id,
          assignedAt: nowIso(),
          deliveryIntent: "steering",
        };
        assigned.push(next);
        return next;
      }));
      return { registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } }, agent, assigned };
    });
    return { agent: publicAgent(result.agent), assignedMessages: clone(result.assigned) };
  }

  function listMessages(target, options = {}) {
    const registry = getRegistry();
    if (!registry) return [];
    const agent = internalAgent(registry, target);
    const state = options.state == null ? null : assertText(options.state, "Agent mailbox state");
    if (state != null && !MESSAGE_STATES.has(state)) throw new Error(`Invalid Agent mailbox state: ${state}.`);
    return agent.mailbox.messages
      .filter((message) => state == null || message.state === state)
      .map((message) => clone(message));
  }

  function mutateMessage(target, messageReference, expectedState, nextState, options = {}) {
    const result = withRegistry(workspace, root, (registry) => {
      const current = internalAgent(registry, target);
      const reference = assertText(messageReference, "Agent message reference");
      const message = current.mailbox.messages.find((candidate) => candidate.messageId === reference || String(candidate.sequence) === reference);
      if (!message) throw new Error("No Agent mailbox message with that exact ID or sequence exists.");
      if (options.jobId != null && message.assignedJobId !== normalizeJobId(options.jobId)) {
        throw new Error("Agent mailbox message is assigned to a different job.");
      }
      if (message.state === nextState) {
        return { registry, write: false, agent: current, message, changed: false };
      }
      if (message.state !== expectedState) {
        throw new Error(`Agent mailbox message is ${message.state}; expected ${expectedState}.`);
      }
      const timestampField = nextState === "dispatched" ? "dispatchedAt" : "acknowledgedAt";
      const agent = updateMailboxMessages(current, (messages) => messages.map((candidate) => candidate.messageId === message.messageId
        ? { ...candidate, state: nextState, [timestampField]: nowIso(), ...(options.receipt ? { receipt: clone(options.receipt) } : {}) }
        : candidate));
      const changed = agent.mailbox.messages.find((candidate) => candidate.messageId === message.messageId);
      return { registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } }, agent, message: changed, changed: true };
    });
    return { agent: publicAgent(result.agent), message: clone(result.message), changed: result.changed };
  }

  function markMessageDispatched(target, messageReference, options = {}) {
    return mutateMessage(target, messageReference, "assigned", "dispatched", options);
  }

  function acknowledgeMessage(target, messageReference, options = {}) {
    return mutateMessage(target, messageReference, "dispatched", "acknowledged", options);
  }

  function sessionBindingPath(reference) {
    const paths = layout(workspace, root);
    return {
      directory: ensureDirectory(paths.sessionsDirectory),
      filePath: path.join(paths.sessionsDirectory, `${sessionBindingKey(reference)}.json`),
    };
  }

  function readSessionBinding(reference) {
    const descriptor = sessionBindingPath(reference);
    let stored;
    try {
      stored = JSON.parse(fs.readFileSync(descriptor.filePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    if (!SUPPORTED_SESSION_BINDING_VERSIONS.has(stored?.version)) {
      throw new Error(`Unsupported native session binding version: ${stored?.version}.`);
    }
    // A version-1 binding names only a Claude config directory and session.
    return {
      ...stored,
      harnessId: stored.harnessId ?? V1_HARNESS_ID,
      instanceKey: stored.instanceKey ?? stored.claudeConfigDir,
      nativeSessionId: stored.nativeSessionId ?? stored.claudeSessionId,
    };
  }

  /**
   * Record the Agent's validated native session. A version-2 record owns the
   * neutral reference; a version-1 record keeps its Claude fields so an active
   * legacy worker is never rewritten into a schema it does not understand.
   */
  function applyAgentSessionRef(agent, reference) {
    if (agent.version === AGENT_RECORD_VERSION) {
      return { ...agent, nativeSessionRef: reference };
    }
    if (reference.harnessId !== V1_HARNESS_ID) {
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

  function markSessionDrift(target, expectedSessionId, observedSessionId, jobId) {
    return updateAgent(target, (agent) => ({
      ...agent,
      activeJobId: agent.activeJobId === jobId ? null : agent.activeJobId,
      latestJobId: jobId ?? agent.latestJobId,
      status: "errored",
      continuation: continuation("blocked", {
        reason: "session_drift",
        expectedSessionId,
        observedSessionId,
        jobId,
      }),
    }));
  }

  function bindSession(target, sessionId, options = {}) {
    const session = assertText(sessionId, "native session ID");
    const jobId = normalizeJobId(options.jobId);
    const targetAgent = resolveTarget(target);
    const harnessId = options.harnessId ?? targetAgent.harnessId;
    const requestedInstanceKey = options.instanceKey
      ?? options.claudeConfigDir
      ?? defaultClaudeConfigDir;
    const reference = canonicalNativeSessionRef({
      harnessId,
      // Claude Code's instance key is a filesystem path. Canonicalize it here
      // so a symlinked configuration directory cannot produce a second binding
      // identity for one native session. Another Harness owns its own
      // canonical derivation and its key is taken verbatim.
      instanceKey: harnessId === V1_HARNESS_ID
        ? canonicalConfigDir(requestedInstanceKey)
        : requestedInstanceKey,
      nativeSessionId: session,
    });
    if (targetAgent.activeJobId !== jobId && !(options.allowTerminal === true && targetAgent.activeJobId == null)) {
      throw new Error(`Agent ${targetAgent.path} is not active for job ${jobId}; session observation is rejected.`);
    }
    const priorSessionId = targetAgent.nativeSessionRef?.nativeSessionId ?? null;
    if (priorSessionId && priorSessionId !== session) {
      markSessionDrift(target, priorSessionId, session, jobId);
      throw new Error("Claude session drift detected; the prior Agent session pointer was preserved.");
    }
    const descriptor = sessionBindingPath(reference);
    const lock = acquireLock(descriptor.directory, `${path.basename(descriptor.filePath)}.lock`);
    try {
      const existing = readSessionBinding(reference);
      if (existing && (existing.rootThreadId !== root || existing.agentId !== targetAgent.agentId)) {
        throw new Error("Claude session is already bound to a different logical root or Agent.");
      }
      if (existing && existing.harnessId !== reference.harnessId) {
        throw new Error("Native session is already bound to a different Harness.");
      }
      const binding = existing ?? {
        version: AGENT_SESSION_BINDING_VERSION,
        key: sessionBindingKey(reference),
        harnessId: reference.harnessId,
        instanceKey: reference.instanceKey,
        nativeSessionId: reference.nativeSessionId,
        rootThreadId: root,
        agentId: targetAgent.agentId,
        createdAt: nowIso(),
      };
      writeAtomic(descriptor.filePath, { ...binding, updatedAt: nowIso() });
      const agent = updateAgent(targetAgent.agentId, (current) => {
        if (current.activeJobId !== jobId && !(options.allowTerminal === true && current.activeJobId == null)) {
          throw new Error(`Agent ${current.path} changed active job while binding a Claude session.`);
        }
        const currentRef = internalNativeSessionRef(current);
        if (currentRef && currentRef.nativeSessionId !== session) {
          throw new Error("Claude session drift detected during binding.");
        }
        return applyAgentSessionRef(current, reference);
      });
      return { binding: clone(binding), agent };
    } finally {
      releaseLock(lock);
    }
  }

  function finalizeFromJob(job) {
    if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("Agent terminal job must be an object.");
    if (!TERMINAL_JOB_STATUSES.has(job.status)) throw new Error(`Agent job ${job.id ?? "unknown"} is not terminal.`);
    const jobId = normalizeJobId(job.id);
    const target = assertText(job.agentId, "Agent-linked job agent ID");
    const agentBefore = resolveTarget(target);
    const observedSessionId = jobSessionId(job);
    let sessionBinding = null;
    let sessionBindingError = null;
    const candidateIsCurrent = agentBefore.activeJobId === jobId
      || (agentBefore.activeJobId == null && (agentBefore.latestJobId == null || agentBefore.latestJobId === jobId));
    if (candidateIsCurrent && observedSessionId && !agentBefore.nativeSessionRef) {
      try {
        sessionBinding = bindSession(target, observedSessionId, {
          jobId,
          claudeConfigDir: job.claudeConfigDir ?? defaultClaudeConfigDir,
          allowTerminal: true,
        });
      } catch (error) {
        sessionBindingError = error instanceof Error ? error.message : String(error);
      }
    }
    const result = withRegistry(workspace, root, (registry) => {
      const current = internalAgent(registry, target);
      const finalizedJobIds = Array.isArray(current.finalizedJobIds)
        ? current.finalizedJobIds
        : (current.lastTerminalJobId ? [current.lastTerminalJobId] : []);
      if (current.lastTerminalJobId === jobId || finalizedJobIds.includes(jobId)) {
        return { registry, write: false, reconciled: false, reason: "already_finalized", agent: current };
      }
      const nextFinalizedJobIds = [...finalizedJobIds, jobId].slice(-FINALIZED_JOB_ID_LIMIT);
      const isCurrentTerminal = current.activeJobId === jobId
        || (current.activeJobId == null && (current.latestJobId == null || current.latestJobId === jobId));
      if (!isCurrentTerminal) {
        const agent = {
          ...current,
          finalizedJobIds: nextFinalizedJobIds,
          updatedAt: nowIso(),
        };
        return {
          registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } },
          reconciled: true,
          reason: "stale_terminal_recorded",
          agent,
        };
      }
      const nextContinuation = boundedContinuation(
        current,
        sessionBindingError
          ? continuation("blocked", {
              reason: "session_binding_conflict",
              jobId,
              detail: sessionBindingError,
            })
          : jobContinuation(job, internalNativeSessionRef(current)?.nativeSessionId ?? null),
      );
      const blockedByIdentity = ["session_drift", "session_binding_conflict"]
        .includes(nextContinuation.evidence.reason);
      const agent = {
        ...normalizedTerminalRecord(
          { ...current, activeJobId: current.activeJobId === jobId ? null : current.activeJobId },
          job,
        ),
        activeJobId: current.activeJobId === jobId ? null : current.activeJobId,
        latestJobId: jobId,
        lastTerminalJobId: jobId,
        finalizedJobIds: nextFinalizedJobIds,
        latestCompletionSequence: Number(current.latestCompletionSequence ?? 0) + 1,
        status: blockedByIdentity ? "errored" : lifecycleFromJob(job),
        continuation: nextContinuation,
        updatedAt: nowIso(),
      };
      return { registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } }, reconciled: true, reason: null, agent };
    });
    return {
      reconciled: Boolean(result.reconciled),
      reason: result.reason,
      agent: publicAgent(result.agent),
      sessionBinding: sessionBinding?.binding ?? null,
    };
  }

  function reconcileFromJobs(jobs) {
    if (!Array.isArray(jobs)) throw new Error("Agent reconciliation requires an array of jobs.");
    const receipts = [];
    for (const job of jobs) {
      if (!job?.agentId || !TERMINAL_JOB_STATUSES.has(job.status)) continue;
      if (job.ownerRootId && job.ownerRootId !== root) continue;
      if (job.preClaudeLaunch === true) {
        const agent = readAgent(job.agentId);
        receipts.push({
          jobId: job.id,
          reconciled: false,
          reason: "pre_claude_diagnostic",
          agent,
        });
        continue;
      }
      if (job.agentProjectionReconciledAt) {
        receipts.push({
          jobId: job.id,
          reconciled: false,
          reason: "already_finalized",
          agent: resolveTarget(job.agentId),
        });
        continue;
      }
      try {
        receipts.push({ jobId: job.id, ...finalizeFromJob(job) });
      } catch (error) {
        receipts.push({
          jobId: job?.id ?? null,
          reconciled: false,
          reason: "reconciliation_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return receipts;
  }

  function recoverPreClaudeActivation(target, jobId) {
    const id = normalizeJobId(jobId);
    const result = withRegistry(workspace, root, (registry) => {
      const current = internalAgent(registry, target);
      const ownsActivation = current.activeJobId === id;
      const evidence = current.continuation?.evidence ?? {};
      const priorContinuation = evidence.activationPreviousContinuation;
      const priorStatus = evidence.activationPreviousStatus;
      let messagesChanged = false;
      const messages = current.mailbox.messages.map((message) => {
        if (
          message.assignedJobId !== id ||
          !["assigned", "dispatched", "acknowledged"].includes(message.state)
        ) {
          return message;
        }
        messagesChanged = true;
        const { receipt, ...withoutReceipt } = message;
        return {
          ...withoutReceipt,
          state: "queued",
          assignedJobId: null,
          assignedAt: null,
          deliveryIntent: null,
          dispatchedAt: null,
          acknowledgedAt: null,
        };
      });
      if (!ownsActivation && !messagesChanged) {
        return {
          registry,
          write: false,
          recovered: true,
          reason: "agent_already_advanced",
          agent: current,
        };
      }
      let restoredContinuation = current.continuation;
      if (ownsActivation) {
        if (priorContinuation) {
          restoredContinuation = validateContinuation(priorContinuation);
        } else {
          // Older prepared receipts predate the explicit snapshot but copied
          // the prior continuation evidence before appending activation
          // metadata. Strip only those metadata keys to recover that state.
          const legacyPrior = clone(current.continuation);
          for (const key of [
            "activationJobId",
            "activationKind",
            "activationReservedAt",
            "activationPreviousStatus",
            "activationPreviousContinuation",
          ]) {
            delete legacyPrior.evidence[key];
          }
          restoredContinuation = validateContinuation(legacyPrior);
        }
      }
      const restoredStatus = ownsActivation && AGENT_STATUSES.has(priorStatus)
        ? priorStatus
        : current.status;
      const agent = {
        ...current,
        ...(ownsActivation ? {
          activeJobId: null,
          status: restoredStatus,
          continuation: restoredContinuation,
        } : {}),
        mailbox: {
          ...current.mailbox,
          messages,
        },
        updatedAt: nowIso(),
      };
      return {
        registry: { ...registry, agents: { ...registry.agents, [agent.agentId]: agent } },
        recovered: true,
        reason: ownsActivation ? "activation_restored" : "stale_messages_requeued",
        agent,
      };
    });
    return {
      recovered: Boolean(result.recovered),
      reason: result.reason ?? null,
      agent: publicAgent(result.agent),
    };
  }

  return Object.freeze({
    createAgent,
    readAgent,
    listAgents,
    listAllAgents,
    updateAgent,
    reserveActivation,
    finalizeFromJob,
    enqueueMessage,
    listMessages,
    assignQueuedMessages,
    markMessageDispatched,
    acknowledgeMessage,
    bindSession,
    reconcileFromJobs,
    recoverPreClaudeActivation,
    rollbackReservation,
    resolveTarget,
    readSessionBinding,
    getProtection: () => protection(ensureDirectory(layout(workspace, root).rootDirectory)),
  });
}

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Operator-only usage evidence. This module deliberately has no public runtime
 * import: model-facing operations neither record dispositions nor read Codex
 * rollout history.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import { normalizeTerminalMetrics } from "./terminal-metrics.mjs";

export const OPERATOR_USAGE_VERSION = 1;
export const OPERATOR_DISPOSITIONS = Object.freeze([
  "accepted_first_pass",
  "accepted_after_correction",
  "rejected_or_escalated",
  "surface_failure",
]);

const DISPOSITION_SET = new Set(OPERATOR_DISPOSITIONS);
const DAY_MS = 24 * 60 * 60 * 1000;
const CANONICAL_TOOLS = Object.freeze([
  "spawn_agent",
  "send_message",
  "followup_task",
  "wait_agent",
  "interrupt_agent",
  "list_agents",
  "read_agent_messages",
]);
const CANONICAL_TOOL_SET = new Set(CANONICAL_TOOLS);
const MODELS = Object.freeze([
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-fable-5",
]);
const MODEL_SET = new Set(MODELS);
const EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
const EFFORT_SET = new Set(EFFORTS);
const DELEGATION_MODES = Object.freeze(["leaf", "claude_orchestrator"]);
const DELEGATION_MODE_SET = new Set(DELEGATION_MODES);
const TERMINAL_STATUSES = Object.freeze(["completed", "failed", "interrupted"]);
const TERMINAL_STATUS_SET = new Set(TERMINAL_STATUSES);
const PROVIDER_FIELDS = Object.freeze([
  "duration_ms",
  "duration_api_ms",
  "turn_count",
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "reported_cost_usd",
]);
const PLUGIN_FIELDS = Object.freeze([
  "tool_call_count",
  "attempt_count",
  "recovery_attempt_count",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function zeroCounts(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

function isoFrom(value, label) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a valid UTC timestamp.`);
  return new Date(milliseconds).toISOString();
}

function explicitUtcIso(value, label) {
  if (typeof value !== "string" || !value.trim() || !/[zZ]$/.test(value.trim())) {
    throw new Error(`${label} must be an explicit UTC timestamp ending in Z.`);
  }
  return isoFrom(value.trim(), label);
}

function nonEmptyOpaqueToken(value) {
  return typeof value === "string" && value.trim() && !value.includes("\0") && value.length <= 4096;
}

export function digestDeliveryToken(deliveryToken) {
  if (!nonEmptyOpaqueToken(deliveryToken)) {
    throw new Error("Delivery token must be non-empty opaque text.");
  }
  return createHash("sha256").update(deliveryToken, "utf8").digest("hex");
}

export function defaultDispositionLedgerFile(env = process.env) {
  const codexHome = path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  return path.join(codexHome, "plugins", "data", "cc", "operator", "usage-dispositions.v1.jsonl");
}

export function defaultCodexSessionsRoot(env = process.env) {
  const codexHome = path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  return path.join(codexHome, "sessions");
}

/** Append one bounded owner-only record. Existing history is never rewritten. */
export function appendDisposition(options = {}) {
  const deliveryToken = options.deliveryToken;
  const disposition = options.disposition;
  if (!DISPOSITION_SET.has(disposition)) {
    throw new Error(`Disposition must be one of ${OPERATOR_DISPOSITIONS.join(", ")}.`);
  }
  const recordedAt = isoFrom(options.now ?? new Date(), "Disposition timestamp");
  const record = {
    version: OPERATOR_USAGE_VERSION,
    delivery_token_sha256: digestDeliveryToken(deliveryToken),
    disposition,
    recorded_at: recordedAt,
  };
  const ledgerFile = path.resolve(options.ledgerFile ?? defaultDispositionLedgerFile(options.env));
  const directory = path.dirname(ledgerFile);
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const descriptor = fs.openSync(ledgerFile, "a", 0o600);
    try {
      fs.fchmodSync(descriptor, 0o600);
      fs.writeSync(descriptor, `${JSON.stringify(record)}\n`, null, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    throw new Error("Unable to append the operator disposition record.", { cause: error });
  }
  return { recorded: true, disposition, recorded_at: recordedAt };
}

function validDispositionRecord(value) {
  if (!exactKeys(value, ["version", "delivery_token_sha256", "disposition", "recorded_at"])) return null;
  if (value.version !== OPERATOR_USAGE_VERSION) return null;
  if (typeof value.delivery_token_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.delivery_token_sha256)) {
    return null;
  }
  if (!DISPOSITION_SET.has(value.disposition)) return null;
  let recordedAt;
  try {
    recordedAt = explicitUtcIso(value.recorded_at, "Disposition timestamp");
  } catch {
    return null;
  }
  if (recordedAt !== value.recorded_at) return null;
  return {
    digest: value.delivery_token_sha256,
    disposition: value.disposition,
    recordedAt,
  };
}

async function readDispositionState(ledgerFile) {
  const latest = new Map();
  const stats = { valid_records: 0, superseded_records: 0, malformed_records: 0 };
  let input;
  try {
    input = fs.createReadStream(ledgerFile, { encoding: "utf8" });
    await new Promise((resolve, reject) => {
      input.once("open", resolve);
      input.once("error", reject);
    });
  } catch (error) {
    if (error?.code === "ENOENT") return { latest, stats };
    throw new Error("Unable to read the operator disposition ledger.", { cause: error });
  }
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) {
        stats.malformed_records += 1;
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        stats.malformed_records += 1;
        continue;
      }
      const record = validDispositionRecord(parsed);
      if (!record) {
        stats.malformed_records += 1;
        continue;
      }
      stats.valid_records += 1;
      if (latest.has(record.digest)) stats.superseded_records += 1;
      latest.set(record.digest, record);
    }
  } catch (error) {
    throw new Error("Unable to stream the operator disposition ledger.", { cause: error });
  }
  return { latest, stats };
}

export function resolveUsageWindow(options = {}) {
  const days = options.days ?? 7;
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error("Usage report days must be a positive integer.");
  }
  const generatedAt = isoFrom(options.now ?? new Date(), "Report generation timestamp");
  const end = options.until == null
    ? generatedAt
    : explicitUtcIso(options.until, "Usage report --until");
  const endMs = Date.parse(end);
  const startMs = endMs - days * DAY_MS;
  if (!Number.isSafeInteger(startMs)) throw new Error("Usage report window is outside the supported range.");
  return {
    generatedAt,
    days,
    start: new Date(startMs).toISOString(),
    end,
    startMs,
    endMs,
  };
}

async function listSessionFiles(root) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT" && directory === root) return;
      throw new Error("Unable to enumerate Codex session evidence.", { cause: error });
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(candidate);
    }
  }
  await visit(root);
  // A parent rollout always predates a materialized fork path. Oldest-first
  // traversal lets the canonical occurrence reserve its call ID before a
  // rewritten fork copy is considered for the requested window.
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

async function readOwningSessionMeta(file) {
  let input;
  try {
    input = fs.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      lines.close();
      input.destroy();
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        return null;
      }
      const payload = record?.payload;
      const id = payload?.id ?? payload?.session_id;
      if (record?.type !== "session_meta" || typeof id !== "string" || !id.trim()) return null;
      if (payload.forked_from_id == null) return { id, parentId: null };
      return typeof payload.forked_from_id === "string" && payload.forked_from_id.trim()
        ? { id, parentId: payload.forked_from_id }
        : null;
    }
  } catch (error) {
    throw new Error("Unable to inspect Codex session provenance.", { cause: error });
  } finally {
    input?.destroy();
  }
  return null;
}

async function resolveSessionEvidence(files) {
  const byFile = new Map();
  const retainedIds = new Set();
  for (const file of files) {
    const meta = await readOwningSessionMeta(file);
    byFile.set(file, meta);
    if (meta) retainedIds.add(meta.id);
  }
  let unresolvedFiles = 0;
  const evidence = new Map();
  for (const file of files) {
    const meta = byFile.get(file);
    const kind = meta == null
      ? "unresolved"
      : meta.parentId == null
        ? "primary"
        : retainedIds.has(meta.parentId)
          ? "fork"
          : "unresolved";
    if (kind === "unresolved") unresolvedFiles += 1;
    evidence.set(file, kind);
  }
  return { evidence, unresolvedFiles };
}

function resultEvidence(result) {
  if (!isPlainObject(result)) return { kind: "malformed" };
  if (Object.hasOwn(result, "Err")) return { kind: "error" };
  if (!Object.hasOwn(result, "Ok") || !isPlainObject(result.Ok)) return { kind: "malformed" };
  const ok = result.Ok;
  if (Object.hasOwn(ok, "isError") && typeof ok.isError !== "boolean") return { kind: "malformed" };
  if (ok.isError === true) return { kind: "error" };
  if (ok.structuredContent != null) {
    return isPlainObject(ok.structuredContent)
      ? { kind: "success", receipt: ok.structuredContent }
      : { kind: "malformed" };
  }
  if (!Array.isArray(ok.content)) return { kind: "malformed" };
  for (const part of ok.content) {
    if (!isPlainObject(part) || part.type !== "text" || typeof part.text !== "string") continue;
    try {
      const parsed = JSON.parse(part.text);
      if (isPlainObject(parsed)) return { kind: "success", receipt: parsed };
    } catch {
      // Continue without retaining arbitrary text.
    }
  }
  return { kind: "malformed" };
}

function admittedSpawnRoute(argumentsValue) {
  if (!isPlainObject(argumentsValue)) return null;
  const model = argumentsValue.model;
  const effort = argumentsValue.reasoning_effort ?? "default";
  const delegationMode = argumentsValue.delegation_mode ?? "leaf";
  const write = argumentsValue.write;
  if (!MODEL_SET.has(model)) return null;
  if (effort !== "default" && !EFFORT_SET.has(effort)) return null;
  if (!DELEGATION_MODE_SET.has(delegationMode)) return null;
  if (typeof write !== "boolean") return null;
  return { model, effort, delegationMode, write };
}

function analyzeWaitReceipt(receipt) {
  if (!isPlainObject(receipt) || typeof receipt.timedOut !== "boolean") {
    return { outcome: "malformed", completions: [] };
  }
  const hasUpdate = Object.hasOwn(receipt, "update");
  const hasTargets = Object.hasOwn(receipt, "targets");
  if (hasUpdate && hasTargets) return { outcome: "malformed", completions: [] };

  if (receipt.timedOut) {
    if (hasUpdate) return { outcome: "malformed", completions: [] };
    if (hasTargets) {
      if (!Array.isArray(receipt.targets) || receipt.targets.some((target) => (
        !isPlainObject(target) || Object.hasOwn(target, "delivery_token")
      ))) return { outcome: "malformed", completions: [] };
    }
    return { outcome: "timeout", completions: [] };
  }

  if (hasUpdate) {
    if (!isPlainObject(receipt.update)) return { outcome: "malformed", completions: [] };
    if (receipt.update.kind === "completion") {
      return nonEmptyOpaqueToken(receipt.update.delivery_token)
        ? { outcome: "completion", completions: [receipt.update] }
        : { outcome: "malformed", completions: [] };
    }
    if (receipt.update.kind === "progress" && !Object.hasOwn(receipt.update, "delivery_token")) {
      return { outcome: "progress", completions: [] };
    }
    return { outcome: "malformed", completions: [] };
  }

  if (!hasTargets || !Array.isArray(receipt.targets) || receipt.targets.length === 0) {
    return { outcome: "malformed", completions: [] };
  }
  if (receipt.targets.some((target) => !isPlainObject(target))) {
    return { outcome: "malformed", completions: [] };
  }
  if (receipt.unresolved_targets != null && !Array.isArray(receipt.unresolved_targets)) {
    return { outcome: "malformed", completions: [] };
  }
  const nonJoinable = (receipt.unresolved_targets?.length ?? 0) > 0 ||
    receipt.targets.some((target) => target.state === "not_joinable");
  if (nonJoinable) {
    return receipt.targets.some((target) => Object.hasOwn(target, "delivery_token"))
      ? { outcome: "malformed", completions: [] }
      : { outcome: "non_joinable", completions: [] };
  }
  if (receipt.targets.some((target) => !["settled", "already_consumed"].includes(target.state))) {
    return { outcome: "malformed", completions: [] };
  }
  const settled = receipt.targets.filter((target) => target.state === "settled");
  if (
    settled.some((target) => !nonEmptyOpaqueToken(target.delivery_token)) ||
    receipt.targets.some((target) => (
      target.state === "already_consumed" && Object.hasOwn(target, "delivery_token")
    ))
  ) return { outcome: "malformed", completions: [] };
  return {
    outcome: receipt.targets.length > 1 ? "barrier" : "completion",
    completions: settled,
  };
}

function metricAggregate(fields, provider = false) {
  return Object.fromEntries(fields.map((field) => [field, {
    coverage: 0,
    total: 0,
    ...(provider && field === "reported_cost_usd" ? { label: "provider-reported" } : {}),
  }]));
}

function addMetrics(aggregate, metrics) {
  aggregate.unique_deliveries_with_metrics += 1;
  for (const field of PROVIDER_FIELDS) {
    const value = metrics.provider_reported?.[field];
    if (value == null) continue;
    aggregate.provider_reported[field].coverage += 1;
    aggregate.provider_reported[field].total += value;
  }
  for (const field of PLUGIN_FIELDS) {
    const value = metrics.plugin_observed?.[field];
    if (value == null) continue;
    aggregate.plugin_observed[field].coverage += 1;
    aggregate.plugin_observed[field].total += value;
  }
}

function initialReport(window) {
  return {
    version: OPERATOR_USAGE_VERSION,
    generated_at: window.generatedAt,
    window: { start: window.start, end: window.end, days: window.days },
    source: {
      scanned_files: 0,
      scanned_lines: 0,
      qualifying_calls: 0,
      calls_without_id: 0,
      replay_exclusions: 0,
    },
    diagnostics: {
      malformed_rollout_records: 0,
      malformed_call_ids: 0,
      unresolved_session_files: 0,
      unresolved_replay_records: 0,
      malformed_result_evidence: 0,
      unrecognized_tool_records: 0,
      malformed_delivery_tokens: 0,
      malformed_terminal_statuses: 0,
      malformed_metrics: 0,
      malformed_ledger_records: 0,
    },
    tools: Object.fromEntries(CANONICAL_TOOLS.map((tool) => [tool, { calls: 0, errors: 0 }])),
    waits: {
      completion: 0,
      progress: 0,
      timeout: 0,
      barrier: 0,
      non_joinable: 0,
      error: 0,
      malformed: 0,
    },
    spawn_routes: {
      total: 0,
      models: zeroCounts(MODELS),
      reasoning_efforts: zeroCounts([...EFFORTS, "default"]),
      delegation_modes: zeroCounts(DELEGATION_MODES),
      authority: { behavioral_read: 0, write: 0 },
      malformed: 0,
    },
    completions: {
      unique_deliveries: 0,
      redeliveries: 0,
      terminal_statuses: zeroCounts(TERMINAL_STATUSES),
      dispositions: { ...zeroCounts(OPERATOR_DISPOSITIONS), unknown: 0 },
    },
    metrics: {
      unique_deliveries_with_metrics: 0,
      provider_reported: metricAggregate(PROVIDER_FIELDS, true),
      plugin_observed: metricAggregate(PLUGIN_FIELDS),
    },
    ledger: { valid_records: 0, superseded_records: 0, malformed_records: 0 },
  };
}

function selectTimestamp(record) {
  if (typeof record?.timestamp !== "string" || !/[zZ]$/.test(record.timestamp)) return null;
  const milliseconds = Date.parse(record.timestamp);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function collectCompletion(report, deliveries, candidate) {
  if (!isPlainObject(candidate) || !Object.hasOwn(candidate, "delivery_token")) {
    report.diagnostics.malformed_delivery_tokens += 1;
    return;
  }
  const token = candidate.delivery_token;
  if (!nonEmptyOpaqueToken(token)) {
    report.diagnostics.malformed_delivery_tokens += 1;
    return;
  }
  const digest = digestDeliveryToken(token);
  const existing = deliveries.get(digest);
  if (existing) {
    report.completions.redeliveries += 1;
  }

  let status = null;
  if (TERMINAL_STATUS_SET.has(candidate.agent_status)) status = candidate.agent_status;
  else if (candidate.agent_status != null) report.diagnostics.malformed_terminal_statuses += 1;

  let metrics = null;
  if (candidate.metrics != null) {
    metrics = normalizeTerminalMetrics(candidate.metrics);
    if (!metrics) report.diagnostics.malformed_metrics += 1;
  }

  if (!existing) {
    deliveries.set(digest, { status, metrics });
  } else {
    if (existing.status == null && status != null) existing.status = status;
    if (existing.metrics == null && metrics != null) existing.metrics = metrics;
  }
}

function aggregateCall(report, deliveries, record) {
  const payload = record.payload;
  const tool = payload.invocation.tool;
  report.source.qualifying_calls += 1;
  if (!CANONICAL_TOOL_SET.has(tool)) {
    report.diagnostics.unrecognized_tool_records += 1;
    return;
  }
  report.tools[tool].calls += 1;

  if (tool === "spawn_agent") {
    const route = admittedSpawnRoute(payload.invocation.arguments);
    if (!route) report.spawn_routes.malformed += 1;
    else {
      report.spawn_routes.total += 1;
      report.spawn_routes.models[route.model] += 1;
      report.spawn_routes.reasoning_efforts[route.effort] += 1;
      report.spawn_routes.delegation_modes[route.delegationMode] += 1;
      report.spawn_routes.authority[route.write ? "write" : "behavioral_read"] += 1;
    }
  }

  const evidence = resultEvidence(payload.result);
  if (evidence.kind === "error") {
    report.tools[tool].errors += 1;
    if (tool === "wait_agent") report.waits.error += 1;
    return;
  }
  if (evidence.kind !== "success") {
    report.diagnostics.malformed_result_evidence += 1;
    if (tool === "wait_agent") report.waits.malformed += 1;
    return;
  }
  if (tool !== "wait_agent") return;
  const wait = analyzeWaitReceipt(evidence.receipt);
  report.waits[wait.outcome] += 1;
  if (wait.outcome === "malformed") {
    report.diagnostics.malformed_result_evidence += 1;
    return;
  }
  for (const candidate of wait.completions) {
    collectCompletion(report, deliveries, candidate);
  }
}

async function scanRolloutFile(file, sessionKind, window, report, seenCallIds, deliveries) {
  let input;
  try {
    input = fs.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      report.source.scanned_lines += 1;
      // Rollouts are append-only compact JSONL and only a tiny fraction of
      // records are CC MCP completions. Avoid parsing every reasoning, token,
      // message, and transcript row (some contain very large model payloads).
      // These literals are required by the admitted event shape below; they
      // are only a cheap prefilter, never the evidence source itself.
      const mayBeCcCall = line.includes("mcp_tool_call_end") && line.includes("cc_for_pein");
      if (!mayBeCcCall) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        report.diagnostics.malformed_rollout_records += 1;
        continue;
      }
      const payload = record?.payload;
      if (
        record?.type !== "event_msg" ||
        payload?.type !== "mcp_tool_call_end" ||
        payload?.invocation?.server !== "cc_for_pein"
      ) continue;
      const callId = payload.call_id;
      const hasCallId = typeof callId === "string" && Boolean(callId.trim());
      const timestamp = selectTimestamp(record);
      if (timestamp == null) {
        report.diagnostics.malformed_rollout_records += 1;
        if (hasCallId) seenCallIds.add(callId);
        continue;
      }
      const inWindow = timestamp >= window.startMs && timestamp < window.endMs;
      if (hasCallId) {
        if (seenCallIds.has(callId)) {
          if (inWindow) report.source.replay_exclusions += 1;
          continue;
        }
        // Reserve before applying the report window. Fork materialization
        // rewrites outer timestamps, so a canonical pre-window occurrence must
        // suppress its copied in-window record.
        seenCallIds.add(callId);
        // An unresolved file cannot contribute usage, but its valid IDs must
        // still reserve replay identity so a retained descendant cannot
        // resurrect the copied event as its own first occurrence.
        if (sessionKind === "unresolved") {
          if (inWindow) report.diagnostics.unresolved_replay_records += 1;
          continue;
        }
      } else {
        if (sessionKind === "unresolved") {
          if (inWindow) report.diagnostics.unresolved_replay_records += 1;
          continue;
        }
        if (callId != null && callId !== "") {
          if (!inWindow) continue;
          report.diagnostics.malformed_call_ids += 1;
          continue;
        }
        if (!inWindow) continue;
        // A no-ID record in a fork cannot be separated from imported parent
        // history, so it is never admitted as usage evidence.
        if (sessionKind !== "primary") {
          report.diagnostics.unresolved_replay_records += 1;
          continue;
        }
        report.source.calls_without_id += 1;
      }
      if (!inWindow) continue;
      aggregateCall(report, deliveries, record);
    }
  } catch (error) {
    throw new Error("Unable to stream Codex session evidence.", { cause: error });
  }
}

/**
 * Build an aggregate-only report. The only retained per-completion key is the
 * one-way digest needed for deduplication and disposition joining.
 */
export async function buildUsageReport(options = {}) {
  const window = resolveUsageWindow(options);
  const report = initialReport(window);
  const ledgerFile = path.resolve(options.ledgerFile ?? defaultDispositionLedgerFile(options.env));
  const dispositionState = await readDispositionState(ledgerFile);
  report.ledger = dispositionState.stats;
  report.diagnostics.malformed_ledger_records = dispositionState.stats.malformed_records;

  const sessionsRoot = path.resolve(options.sessionsRoot ?? defaultCodexSessionsRoot(options.env));
  const files = await listSessionFiles(sessionsRoot);
  report.source.scanned_files = files.length;
  const sessionEvidence = await resolveSessionEvidence(files);
  report.diagnostics.unresolved_session_files = sessionEvidence.unresolvedFiles;
  const seenCallIds = new Set();
  const deliveries = new Map();
  for (const file of files) {
    await scanRolloutFile(
      file,
      sessionEvidence.evidence.get(file),
      window,
      report,
      seenCallIds,
      deliveries,
    );
  }

  report.completions.unique_deliveries = deliveries.size;
  for (const [digest, delivery] of deliveries) {
    if (delivery.status != null) report.completions.terminal_statuses[delivery.status] += 1;
    const disposition = dispositionState.latest.get(digest)?.disposition ?? "unknown";
    report.completions.dispositions[disposition] += 1;
    if (delivery.metrics != null) addMetrics(report.metrics, delivery.metrics);
  }
  return report;
}

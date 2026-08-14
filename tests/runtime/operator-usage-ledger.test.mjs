import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  appendDisposition,
  buildUsageReport,
  defaultDispositionLedgerFile,
  digestDeliveryToken,
  resolveUsageWindow,
} from "../../runtime/operator-usage-ledger.mjs";

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATOR_CLI = path.join(SOURCE_ROOT, "runtime", "operator-cli.mjs");
const temporaryDirectories = [];

function temporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function okResult(receipt, fallback = receipt) {
  return {
    Ok: {
      content: [{ type: "text", text: JSON.stringify(fallback) }],
      ...(receipt === undefined ? {} : { structuredContent: receipt }),
    },
  };
}

function callEnd({
  timestamp,
  callId,
  server = "codex_harnessdock",
  tool,
  args = {},
  result = okResult({ status: "ok" }),
}) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "mcp_tool_call_end",
      ...(callId === undefined ? {} : { call_id: callId }),
      invocation: { server, tool, arguments: args },
      result,
    },
  };
}

function sessionMeta({ timestamp, id, forkedFromId }) {
  return {
    timestamp,
    type: "session_meta",
    payload: {
      id,
      timestamp,
      ...(forkedFromId == null ? {} : { forked_from_id: forkedFromId }),
    },
  };
}

function writeJsonl(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${records.map((record) => (
    typeof record === "string" ? record : JSON.stringify(record)
  )).join("\n")}\n`, "utf8");
}

const METRICS = Object.freeze({
  version: 1,
  provider_reported: {
    duration_ms: 10,
    duration_api_ms: null,
    turn_count: 2,
    input_tokens: 100,
    output_tokens: 20,
    cache_creation_input_tokens: 3,
    cache_read_input_tokens: 4,
    reported_cost_usd: 0.25,
  },
  plugin_observed: {
    tool_call_count: 5,
    attempt_count: 2,
    recovery_attempt_count: 1,
  },
});

describe("operator usage ledger", () => {
  it("appends only closed owner-readable token-digest records and uses latest valid disposition", async () => {
    const root = temporaryDirectory("cc-usage-ledger-");
    const ledgerFile = path.join(root, "operator", "dispositions.jsonl");
    const deliveryToken = "delivery-private-token";

    const first = appendDisposition({
      ledgerFile,
      deliveryToken,
      disposition: "accepted_first_pass",
      now: new Date("2026-08-02T00:00:00.000Z"),
    });
    const second = appendDisposition({
      ledgerFile,
      deliveryToken,
      disposition: "accepted_after_correction",
      now: new Date("2026-08-03T00:00:00.000Z"),
    });

    assert.deepEqual(first, {
      recorded: true,
      disposition: "accepted_first_pass",
      recorded_at: "2026-08-02T00:00:00.000Z",
    });
    assert.equal(second.disposition, "accepted_after_correction");
    assert.equal(fs.statSync(ledgerFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(ledgerFile)).mode & 0o777, 0o700);
    const stored = fs.readFileSync(ledgerFile, "utf8");
    assert.doesNotMatch(stored, new RegExp(deliveryToken));
    const records = stored.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(Object.keys(records[0]), [
      "version", "delivery_token_sha256", "disposition", "recorded_at",
    ]);
    assert.equal(records[0].delivery_token_sha256, digestDeliveryToken(deliveryToken));
    assert.throws(
      () => appendDisposition({ ledgerFile, deliveryToken, disposition: "unknown" }),
      /Disposition must be one of/,
    );

    const sessionsRoot = path.join(root, "sessions");
    writeJsonl(path.join(sessionsRoot, "one.jsonl"), [
      sessionMeta({ timestamp: "2026-08-04T00:00:00.000Z", id: "primary-one" }),
      callEnd({
        timestamp: "2026-08-04T00:00:00.000Z",
        callId: "wait-disposition",
        tool: "wait_agent",
        result: okResult({
          timedOut: false,
          update: {
            kind: "completion",
            agent_status: "completed",
            delivery_token: deliveryToken,
          },
        }),
      }),
    ]);
    const report = await buildUsageReport({
      sessionsRoot,
      ledgerFile,
      days: 7,
      until: "2026-08-08T00:00:00.000Z",
      now: new Date("2026-08-09T00:00:00.000Z"),
    });
    assert.equal(report.ledger.valid_records, 2);
    assert.equal(report.ledger.superseded_records, 1);
    assert.equal(report.completions.dispositions.accepted_after_correction, 1);
    assert.equal(report.completions.dispositions.accepted_first_pass, 0);
  });

  it("streams an exact UTC window, deduplicates global call IDs, and emits aggregate-only evidence", async () => {
    const root = temporaryDirectory("cc-usage-report-");
    const sessionsRoot = path.join(root, "sessions");
    const ledgerFile = path.join(root, "operator", "dispositions.jsonl");
    const firstToken = "delivery-sensitive-alpha";
    const secondToken = "delivery-sensitive-beta";
    const privacySentinels = [
      "PROMPT_SENTINEL_DO_NOT_REPORT",
      "FINAL_MESSAGE_SENTINEL_DO_NOT_REPORT",
      "SESSION_ID_SENTINEL_DO_NOT_REPORT",
      "JOB_ID_SENTINEL_DO_NOT_REPORT",
      "/absolute/private/workspace",
      "ENV_VALUE_SENTINEL_DO_NOT_REPORT",
    ];

    appendDisposition({
      ledgerFile,
      deliveryToken: firstToken,
      disposition: "accepted_first_pass",
      now: new Date("2026-08-02T00:00:00.000Z"),
    });
    appendDisposition({
      ledgerFile,
      deliveryToken: firstToken,
      disposition: "accepted_after_correction",
      now: new Date("2026-08-03T00:00:00.000Z"),
    });
    fs.appendFileSync(ledgerFile, `${JSON.stringify({
      version: 1,
      delivery_token_sha256: digestDeliveryToken(secondToken),
      disposition: "accepted_first_pass",
      recorded_at: "2026-08-04T00:00:00.000Z",
      prompt: privacySentinels[0],
    })}\n`, "utf8");

    const structuredCompletion = {
      timedOut: false,
      update: {
        kind: "completion",
        agent_status: "completed",
        delivery_token: firstToken,
        metrics: METRICS,
        completion_message: privacySentinels[1],
        session_id: privacySentinels[2],
        job_id: privacySentinels[3],
      },
    };
    const maliciousFallback = {
      timedOut: false,
      update: {
        kind: "completion",
        agent_status: "completed",
        delivery_token: "fallback-token-must-not-be-read",
        completion_message: privacySentinels[0],
      },
    };

    const firstFileRecords = [
      sessionMeta({ timestamp: "2026-08-01T00:00:00.000Z", id: "primary-report" }),
      callEnd({
        timestamp: "2026-08-01T00:00:00.000Z",
        callId: "spawn-at-start",
        tool: "spawn_agent",
        args: {
          task_name: "private_task",
          message: privacySentinels[0],
          model: "claude-sonnet-5",
          reasoning_effort: "high",
          delegation_mode: "leaf",
          write: false,
          cwd: privacySentinels[4],
          env: privacySentinels[5],
        },
        result: okResult({ agent_name: "/root/private", status: "working" }),
      }),
      callEnd({
        timestamp: "2026-08-02T00:00:00.000Z",
        callId: "completion-one",
        tool: "wait_agent",
        result: okResult(structuredCompletion, maliciousFallback),
      }),
      callEnd({
        timestamp: "2026-08-02T01:00:00.000Z",
        callId: "redelivery-one",
        tool: "wait_agent",
        result: okResult(structuredCompletion),
      }),
      callEnd({
        timestamp: "2026-08-03T00:00:00.000Z",
        callId: "progress-one",
        tool: "wait_agent",
        result: okResult(undefined, {
          timedOut: false,
          update: { kind: "progress", progress: { summary: privacySentinels[0] } },
        }),
      }),
      callEnd({
        timestamp: "2026-08-03T01:00:00.000Z",
        callId: "timeout-one",
        tool: "wait_agent",
        result: okResult({ timedOut: true, message: privacySentinels[0] }),
      }),
      callEnd({
        timestamp: "2026-08-04T00:00:00.000Z",
        callId: "barrier-one",
        tool: "wait_agent",
        result: okResult({
          timedOut: false,
          targets: [
            {
              agent_status: "failed",
              state: "settled",
              delivery_token: secondToken,
              metrics: { ...METRICS, prompt: privacySentinels[0] },
              completion_message: privacySentinels[1],
            },
            { agent_status: "completed", state: "already_consumed" },
          ],
        }),
      }),
      callEnd({
        timestamp: "2026-08-05T00:00:00.000Z",
        callId: "wait-error",
        tool: "wait_agent",
        result: { Err: { message: privacySentinels[0] } },
      }),
      callEnd({
        timestamp: "2026-08-05T01:00:00.000Z",
        callId: "wait-malformed",
        tool: "wait_agent",
        result: { Ok: { content: [{ type: "text", text: privacySentinels[0] }] } },
      }),
      callEnd({
        timestamp: "2026-08-05T02:00:00.000Z",
        callId: "wait-not-joinable",
        tool: "wait_agent",
        result: okResult({
          timedOut: false,
          targets: [{ agent_status: "failed", state: "not_joinable" }],
          unresolved_targets: ["/root/private"],
        }),
      }),
      callEnd({
        timestamp: "2026-08-06T00:00:00.000Z",
        tool: "list_agents",
      }),
      callEnd({
        timestamp: "2026-08-06T01:00:00.000Z",
        callId: "foreign-server",
        server: "codex_harnessdock_extra",
        tool: "spawn_agent",
        args: { model: "claude-opus-5", write: true },
      }),
      callEnd({
        timestamp: "2026-08-08T00:00:00.000Z",
        callId: "at-exclusive-end",
        tool: "spawn_agent",
        args: { model: "claude-opus-5", write: true },
      }),
      "mcp_tool_call_end codex_harnessdock not-json",
    ];
    writeJsonl(path.join(sessionsRoot, "2026", "08", "first.jsonl"), firstFileRecords);
    writeJsonl(path.join(sessionsRoot, "2026", "07", "original.jsonl"), [
      sessionMeta({ timestamp: "2026-07-30T00:00:00.000Z", id: "historical-parent" }),
      callEnd({
        timestamp: "2026-07-31T23:59:59.000Z",
        callId: "old-fork-replay",
        tool: "spawn_agent",
        args: {
          model: "claude-opus-5",
          reasoning_effort: "xhigh",
          delegation_mode: "leaf",
          write: false,
        },
      }),
    ]);
    writeJsonl(path.join(sessionsRoot, "replay.jsonl"), [
      sessionMeta({
        timestamp: "2026-08-07T00:00:00.000Z",
        id: "report-fork",
        forkedFromId: "historical-parent",
      }),
      callEnd({
        timestamp: "2026-08-07T00:00:00.000Z",
        callId: "spawn-at-start",
        tool: "spawn_agent",
        args: {
          model: "claude-fable-5",
          reasoning_effort: "max",
          delegation_mode: "claude_orchestrator",
          write: true,
        },
      }),
      callEnd({
        timestamp: "2026-08-07T01:00:00.000Z",
        callId: "old-fork-replay",
        tool: "spawn_agent",
        args: {
          model: "claude-opus-5",
          reasoning_effort: "xhigh",
          delegation_mode: "leaf",
          write: false,
        },
      }),
      callEnd({
        timestamp: "2026-08-07T02:00:00.000Z",
        tool: "list_agents",
      }),
    ]);
    writeJsonl(path.join(sessionsRoot, "2026", "08", "rollout-2026-08-07T03-00-orphan.jsonl"), [
      sessionMeta({
        timestamp: "2026-08-07T03:00:00.000Z",
        id: "orphan-fork",
        forkedFromId: "missing-parent",
      }),
      callEnd({
        timestamp: "2026-08-07T03:01:00.000Z",
        callId: "unresolved-orphan-call",
        tool: "spawn_agent",
        args: {
          model: "claude-opus-5",
          reasoning_effort: "xhigh",
          delegation_mode: "leaf",
          write: false,
        },
      }),
    ]);
    writeJsonl(path.join(sessionsRoot, "2026", "08", "rollout-2026-08-07T04-00-child.jsonl"), [
      sessionMeta({
        timestamp: "2026-08-07T04:00:00.000Z",
        id: "orphan-child",
        forkedFromId: "orphan-fork",
      }),
      callEnd({
        timestamp: "2026-08-07T04:01:00.000Z",
        callId: "unresolved-orphan-call",
        tool: "spawn_agent",
        args: {
          model: "claude-opus-5",
          reasoning_effort: "xhigh",
          delegation_mode: "leaf",
          write: false,
        },
      }),
    ]);

    const report = await buildUsageReport({
      sessionsRoot,
      ledgerFile,
      days: 7,
      until: "2026-08-08T00:00:00.000Z",
      now: new Date("2026-08-09T12:34:56.000Z"),
    });

    assert.deepEqual(report.window, {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-08-08T00:00:00.000Z",
      days: 7,
    });
    assert.equal(report.generated_at, "2026-08-09T12:34:56.000Z");
    assert.equal(report.source.scanned_files, 5);
    assert.equal(report.source.replay_exclusions, 3);
    assert.equal(report.source.calls_without_id, 1);
    assert.equal(report.diagnostics.unresolved_session_files, 1);
    assert.equal(report.diagnostics.unresolved_replay_records, 2);
    assert.equal(report.tools.spawn_agent.calls, 1);
    assert.equal(report.spawn_routes.total, 1);
    assert.equal(report.spawn_routes.models["claude-sonnet-5"], 1);
    assert.equal(report.spawn_routes.reasoning_efforts.high, 1);
    assert.equal(report.spawn_routes.delegation_modes.leaf, 1);
    assert.equal(report.spawn_routes.authority.behavioral_read, 1);
    assert.deepEqual(report.waits, {
      completion: 2,
      progress: 1,
      timeout: 1,
      barrier: 1,
      non_joinable: 1,
      error: 1,
      malformed: 1,
    });
    assert.equal(report.completions.unique_deliveries, 2);
    assert.equal(report.completions.redeliveries, 1);
    assert.deepEqual(report.completions.terminal_statuses, {
      completed: 1,
      failed: 1,
      interrupted: 0,
    });
    assert.equal(report.completions.dispositions.accepted_after_correction, 1);
    assert.equal(report.completions.dispositions.unknown, 1);
    assert.equal(report.metrics.unique_deliveries_with_metrics, 1);
    assert.deepEqual(report.metrics.provider_reported.reported_cost_usd, {
      coverage: 1,
      total: 0.25,
      label: "provider-reported",
    });
    assert.equal(report.metrics.provider_reported.input_tokens.coverage, 1);
    assert.equal(report.metrics.provider_reported.input_tokens.total, 100);
    assert.equal(report.metrics.plugin_observed.tool_call_count.total, 5);
    assert.equal(report.diagnostics.malformed_metrics, 1);
    assert.equal(report.diagnostics.malformed_ledger_records, 1);
    assert.equal(report.diagnostics.malformed_rollout_records, 1);
    assert.equal(report.diagnostics.malformed_result_evidence, 1);

    const serialized = JSON.stringify(report);
    for (const sentinel of [...privacySentinels, firstToken, secondToken, "fallback-token-must-not-be-read"]) {
      assert.doesNotMatch(serialized, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(
      serialized,
      /"(?:session_id|job_id|root_id|delivery_token|workspaceRoot|sessionsRoot|ledgerFile)"/,
    );
  });

  it("validates reproducible UTC bounds", () => {
    assert.deepEqual(resolveUsageWindow({
      now: new Date("2026-08-08T00:00:00.000Z"),
    }).days, 7);
    assert.deepEqual(resolveUsageWindow({
      days: 2,
      until: "2026-08-08T12:00:00.000Z",
      now: new Date("2026-08-09T00:00:00.000Z"),
    }), {
      generatedAt: "2026-08-09T00:00:00.000Z",
      days: 2,
      start: "2026-08-06T12:00:00.000Z",
      end: "2026-08-08T12:00:00.000Z",
      startMs: Date.parse("2026-08-06T12:00:00.000Z"),
      endMs: Date.parse("2026-08-08T12:00:00.000Z"),
    });
    assert.throws(() => resolveUsageWindow({ days: 0 }), /positive integer/);
    assert.throws(
      () => resolveUsageWindow({ days: 1, until: "2026-08-08T12:00:00+00:00" }),
      /ending in Z/,
    );
  });

  it("admits retained legacy calls only before an accepted identity cutover", async () => {
    const root = temporaryDirectory("cc-usage-identity-");
    const sessionsRoot = path.join(root, "sessions");
    const ledgerFile = path.join(root, "operator", "dispositions.jsonl");
    writeJsonl(path.join(sessionsRoot, "identity.jsonl"), [
      sessionMeta({ timestamp: "2026-08-01T00:00:00.000Z", id: "identity-primary" }),
      callEnd({
        timestamp: "2026-08-02T00:00:00.000Z",
        callId: "legacy-before-cutover",
        server: "cc_for_pein",
        tool: "list_agents",
      }),
      callEnd({
        timestamp: "2026-08-05T00:00:00.000Z",
        callId: "legacy-after-cutover",
        server: "cc_for_pein",
        tool: "list_agents",
      }),
      callEnd({
        timestamp: "2026-08-06T00:00:00.000Z",
        callId: "current-after-cutover",
        server: "codex_harnessdock",
        tool: "list_agents",
      }),
    ]);

    const report = await buildUsageReport({
      sessionsRoot,
      ledgerFile,
      days: 7,
      until: "2026-08-08T00:00:00.000Z",
      identityCutoverAt: "2026-08-04T00:00:00.000Z",
    });
    assert.equal(report.identity_cutover_at, "2026-08-04T00:00:00.000Z");
    assert.deepEqual(report.namespaces, { codex_harnessdock: 1, cc_for_pein: 1 });
    assert.deepEqual(report.identity.qualifying_calls, { codex_harnessdock: 1, cc_for_pein: 1 });
    assert.equal(report.identity.legacy_coverage, "admitted_pre_cutover");
    assert.equal(report.identity.identity_drift_events, 1);
    assert.equal(report.source.qualifying_calls, 2);

    const unavailable = await buildUsageReport({
      sessionsRoot,
      ledgerFile,
      days: 7,
      until: "2026-08-08T00:00:00.000Z",
    });
    assert.equal(unavailable.identity_cutover_at, null);
    assert.equal(unavailable.identity.legacy_coverage, "unavailable");
    assert.equal(unavailable.identity.identity_drift_events, 0);
    assert.deepEqual(unavailable.namespaces, { codex_harnessdock: 1, cc_for_pein: 0 });
    await assert.rejects(
      buildUsageReport({
        sessionsRoot,
        ledgerFile,
        identityCutoverAt: "2026-08-04T00:00:00+00:00",
      }),
      /ending in Z/,
    );
  });

  it("fails closed for malformed IDs and contradictory wait evidence", async () => {
    const root = temporaryDirectory("cc-usage-malformed-");
    const sessionsRoot = path.join(root, "sessions");
    const ledgerFile = path.join(root, "operator", "dispositions.jsonl");
    const tokens = ["bad-id-token", "timeout-token", "is-error-token", "pending-token"];
    for (const token of tokens) {
      appendDisposition({
        ledgerFile,
        deliveryToken: token,
        disposition: "accepted_first_pass",
        now: new Date("2026-08-04T00:00:00.000Z"),
      });
    }
    writeJsonl(path.join(sessionsRoot, "one.jsonl"), [
      sessionMeta({ timestamp: "2026-08-04T00:00:00.000Z", id: "malformed-primary" }),
      callEnd({
        timestamp: "2026-08-04T01:00:00.000Z",
        callId: 42,
        tool: "wait_agent",
        result: okResult({
          timedOut: false,
          update: { kind: "completion", delivery_token: tokens[0] },
        }),
      }),
      callEnd({
        timestamp: "2026-08-04T02:00:00.000Z",
        callId: "contradictory-timeout",
        tool: "wait_agent",
        result: okResult({
          timedOut: true,
          update: { kind: "completion", delivery_token: tokens[1] },
        }),
      }),
      callEnd({
        timestamp: "2026-08-04T03:00:00.000Z",
        callId: "malformed-is-error",
        tool: "wait_agent",
        result: {
          Ok: {
            isError: "false",
            structuredContent: {
              timedOut: false,
              update: { kind: "completion", delivery_token: tokens[2] },
            },
          },
        },
      }),
      callEnd({
        timestamp: "2026-08-04T04:00:00.000Z",
        callId: "pending-with-token",
        tool: "wait_agent",
        result: okResult({
          timedOut: false,
          targets: [{ state: "pending", delivery_token: tokens[3] }],
          unresolved_targets: [],
        }),
      }),
    ]);

    const report = await buildUsageReport({
      sessionsRoot,
      ledgerFile,
      days: 7,
      until: "2026-08-08T00:00:00.000Z",
      now: new Date("2026-08-09T00:00:00.000Z"),
    });
    assert.equal(report.diagnostics.malformed_call_ids, 1);
    assert.equal(report.diagnostics.malformed_result_evidence, 3);
    assert.equal(report.waits.malformed, 3);
    assert.equal(report.completions.unique_deliveries, 0);
    assert.equal(report.completions.dispositions.accepted_first_pass, 0);
  });
});

describe("operator usage CLI", () => {
  function run(codexHome, args) {
    return spawnSync(process.execPath, [OPERATOR_CLI, ...args], {
      cwd: SOURCE_ROOT,
      env: { ...process.env, CODEX_HOME: codexHome, CODEX_HARNESSDOCK_RUNTIME_HOME: "" },
      encoding: "utf8",
    });
  }

  it("records a disposition without echoing or storing its raw token", () => {
    const codexHome = temporaryDirectory("cc-usage-cli-record-");
    const token = "delivery-cli-private";
    const result = run(codexHome, [
      "record-disposition",
      "--delivery-token", token,
      "--disposition", "accepted_first_pass",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).disposition, "accepted_first_pass");
    assert.doesNotMatch(result.stdout, new RegExp(token));
    const ledgerFile = defaultDispositionLedgerFile({ CODEX_HOME: codexHome });
    assert.equal(fs.existsSync(ledgerFile), true);
    assert.doesNotMatch(fs.readFileSync(ledgerFile, "utf8"), new RegExp(token));
  });

  it("redacts the absolute ledger path when disposition append fails", () => {
    const codexHome = temporaryDirectory("PRIVATE_CODEX_HOME-");
    const blockingFile = path.join(codexHome, "plugins", "data", "codex-harnessdock", "operator");
    fs.mkdirSync(path.dirname(blockingFile), { recursive: true });
    fs.writeFileSync(blockingFile, "not-a-directory", "utf8");
    const token = "private-failing-token";
    const result = run(codexHome, [
      "record-disposition",
      "--delivery-token", token,
      "--disposition", "accepted_first_pass",
      "--json",
    ]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), "Unable to append the operator disposition record.");
    assert.doesNotMatch(result.stderr, new RegExp(codexHome));
    assert.doesNotMatch(result.stderr, new RegExp(token));
  });

  it("requires explicit report scope and rejects irreproducible bounds and unknown dispositions", () => {
    const codexHome = temporaryDirectory("cc-usage-cli-validation-");
    const valid = run(codexHome, [
      "usage-report", "--all", "--days", "3", "--until", "2026-08-08T00:00:00.000Z", "--json",
    ]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout).window, {
      start: "2026-08-05T00:00:00.000Z",
      end: "2026-08-08T00:00:00.000Z",
      days: 3,
    });

    const missingAll = run(codexHome, ["usage-report"]);
    assert.equal(missingAll.status, 1);
    assert.match(missingAll.stderr, /requires explicit --all/);

    const badDays = run(codexHome, ["usage-report", "--all", "--days", "0"]);
    assert.equal(badDays.status, 1);
    assert.match(badDays.stderr, /positive integer/);

    const nonUtc = run(codexHome, [
      "usage-report", "--all", "--until", "2026-08-08T00:00:00+00:00",
    ]);
    assert.equal(nonUtc.status, 1);
    assert.match(nonUtc.stderr, /ending in Z/);

    const privateToken = "token-must-not-echo-on-error";
    const unknown = run(codexHome, [
      "record-disposition", "--delivery-token", privateToken, "--disposition", "unknown",
    ]);
    assert.equal(unknown.status, 1);
    assert.doesNotMatch(unknown.stderr, new RegExp(privateToken));
  });
});

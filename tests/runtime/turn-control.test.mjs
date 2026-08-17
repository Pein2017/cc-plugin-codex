/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * OpenSpec `generalize-multi-harness-agent-control-plane` tasks 5.1-5.2.
 *
 * `runtime/turn-control.mjs` is the narrow single owner of the durable
 * control-command state machine: closed command identity/binding, the three
 * independent axes (request acknowledgement, settlement, native turn state),
 * idempotent isolated-caller enqueue, and worker-only claim/ack/settlement
 * recording. It has no dependency on any Driver module.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import {
  closeControlStreamForAttempt,
  CONTROL_REQUEST_STATES,
  CONTROL_SETTLEMENT_VALUES,
  claimControlCommand,
  enqueueControlCommand,
  readControlStreamClosure,
  expireControlCommandDeadline,
  listControlCommands,
  readControlCommand,
  recordControlSettlement,
  recordRequestAcknowledgement,
  resolveControlStreamDirectory,
} from "../../runtime/turn-control.mjs";
import { NATIVE_TURN_STATES } from "../../runtime/turn-settlement.mjs";
import { waitForDurableActivity } from "../../runtime/durable-activity-wakeup.mjs";
import { versionThreeRoute } from "./fixtures/version-three-state.mjs";

const contentionFixture = fileURLToPath(
  new URL("./fixtures/turn-control-contender.mjs", import.meta.url)
);

const priorHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
const roots = [];

afterEach(() => {
  if (priorHome == null) delete process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
  else process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = priorHome;
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-control-"));
  roots.push(root);
  process.env.CODEX_HARNESSDOCK_RUNTIME_HOME = path.join(root, "state-home");
  return { root };
}

function binding(overrides = {}) {
  return {
    ownerRootId: "root-1",
    agentId: "agent-1",
    jobId: "job-1",
    route: versionThreeRoute(),
    ...overrides,
  };
}

function nativeTurnRef(overrides = {}) {
  return {
    version: 1,
    harnessId: "fake-service",
    driverVersion: "fake-service@1",
    instanceKey: "tenant-alpha",
    locatorVersion: 1,
    locator: { turnId: "t-1" },
    ...overrides,
  };
}

function commandInput(overrides = {}) {
  return {
    commandId: "cmd-1",
    kind: "interrupt",
    ...binding(),
    nativeTurnRef: nativeTurnRef(),
    ...overrides,
  };
}

/**
 * A minimal settlement-shaped evidence fixture, mirroring the lease test's
 * `publishableResult()`. Defaults to carrying the exact same `nativeTurnRef`
 * as `commandInput()`'s default command, so an ordinary settlement test is
 * automatically an "exact-bound" (matching) case unless it deliberately
 * overrides `nativeTurnRef` to prove a binding-mismatch scenario.
 */
function settlementEvidence(overrides = {}) {
  return {
    status: "completed",
    nativeTurn: "terminal",
    executionWorld: { continuity: "not_applicable", settlement: "settled" },
    continuation: { mode: "none" },
    nativeTurnRef: nativeTurnRef(),
    ...overrides,
  };
}

describe("turn control: closed command identity and axes", () => {
  it("enqueues a command with the closed default axes", () => {
    setup();
    const record = enqueueControlCommand(commandInput());
    assert.equal(record.version, 1);
    assert.equal(record.commandId, "cmd-1");
    assert.equal(record.kind, "interrupt");
    assert.equal(record.sequence, 1);
    assert.equal(record.ownerRootId, "root-1");
    assert.equal(record.agentId, "agent-1");
    assert.equal(record.jobId, "job-1");
    assert.deepEqual(record.route, versionThreeRoute());
    assert.equal(record.nativeTurnRef.locator.turnId, "t-1");
    assert.equal(record.requestState, "none");
    assert.equal(record.settlement, "pending");
    assert.equal(record.nativeTurnState, "active");
    assert.equal(record.lastEvidenceAt, null);
    assert.equal(record.claimedByAttemptId, null);
    assert.ok(record.requestedAt);
    assert.ok(record.deadlineAt);
    assert.ok(Date.parse(record.deadlineAt) > Date.parse(record.requestedAt));
  });

  it("exposes exactly the closed request-state and settlement vocabularies", () => {
    assert.deepEqual(CONTROL_REQUEST_STATES, ["none", "accepted", "rejected", "unsupported"]);
    assert.deepEqual(CONTROL_SETTLEMENT_VALUES, ["pending", "settled", "unknown"]);
    assert.deepEqual(NATIVE_TURN_STATES, ["active", "terminal", "unknown"]);
  });

  it("assigns monotonic sequence numbers to distinct commands in one job stream", () => {
    setup();
    const first = enqueueControlCommand(commandInput({ commandId: "cmd-a" }));
    const second = enqueueControlCommand(commandInput({ commandId: "cmd-b" }));
    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
  });

  it("rejects an unsupported command kind", () => {
    setup();
    assert.throws(() => enqueueControlCommand(commandInput({ kind: "cancel" })), /Unsupported control command kind/);
  });

  it("rejects a nativeTurnRef that does not belong to the bound route's Harness/instance", () => {
    setup();
    assert.throws(
      () => enqueueControlCommand(commandInput({ nativeTurnRef: nativeTurnRef({ harnessId: "other-harness" }) })),
      /does not match its bound route/
    );
  });

  it("always persists nativeTurnState=active and does not accept it as caller input at all", () => {
    setup();
    const record = enqueueControlCommand(commandInput());
    assert.equal(record.nativeTurnState, "active");
  });

  it("fails closed if a caller attempts to pass nativeTurnState=terminal; that value never becomes durable", () => {
    setup();
    assert.throws(
      () => enqueueControlCommand(commandInput({ nativeTurnState: "terminal" })),
      /unsupported field.*nativeTurnState/s
    );
    // Fail-closed at the boundary: nothing was ever persisted for this commandId.
    assert.equal(readControlCommand({ ...binding(), commandId: "cmd-1" }), null);
  });

  it("fails closed if a caller attempts to pass nativeTurnState=unknown; that value never becomes durable", () => {
    setup();
    assert.throws(
      () => enqueueControlCommand(commandInput({ nativeTurnState: "unknown" })),
      /unsupported field.*nativeTurnState/s
    );
    assert.equal(readControlCommand({ ...binding(), commandId: "cmd-1" }), null);
  });

  it("fails closed on any other unsupported enqueue input field, not only nativeTurnState", () => {
    setup();
    assert.throws(
      () => enqueueControlCommand(commandInput({ claimedByAttemptId: "attempt-1" })),
      /unsupported field/
    );
  });
});

describe("turn control: idempotent and fail-closed identity", () => {
  it("is idempotent for a repeated identical commandId", () => {
    setup();
    const first = enqueueControlCommand(commandInput());
    const second = enqueueControlCommand(commandInput());
    assert.deepEqual(first, second);
    assert.equal(listControlCommands(binding()).length, 1);
  });

  it("fails closed on conflicting reuse of the same commandId without rewriting the stored record", () => {
    setup();
    const original = enqueueControlCommand(commandInput());
    assert.throws(
      () => enqueueControlCommand(commandInput({ nativeTurnRef: nativeTurnRef({ locator: { turnId: "different" } }) })),
      /identity mismatch/
    );
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.deepEqual(stored, original);
  });

  it("fails closed when claiming with a mismatched route", () => {
    setup();
    enqueueControlCommand(commandInput());
    assert.throws(
      () => claimControlCommand({
        ...binding({ route: versionThreeRoute({ model: "a-different-model" }) }),
        commandId: "cmd-1",
        nativeTurnRef: nativeTurnRef(),
        workerAttemptId: "attempt-1",
      }),
      /identity mismatch/
    );
  });

  it("fails closed when acknowledging with a mismatched native turn reference", () => {
    setup();
    enqueueControlCommand(commandInput());
    assert.throws(
      () => recordRequestAcknowledgement({
        ...binding(),
        commandId: "cmd-1",
        nativeTurnRef: nativeTurnRef({ locator: { turnId: "stale-turn" } }),
        requestState: "accepted",
      }),
      /identity mismatch/
    );
  });

  it("fails closed for a cross-job read (different jobId never resolves another job's command)", () => {
    setup();
    enqueueControlCommand(commandInput());
    assert.equal(readControlCommand({ ...binding({ jobId: "job-2" }), commandId: "cmd-1" }), null);
  });
});

describe("turn control: bounded deadline", () => {
  it("rejects a deadline outside the bounded window", () => {
    setup();
    assert.throws(() => enqueueControlCommand(commandInput({ deadlineMs: 0 })), /deadline must be between/);
    assert.throws(() => enqueueControlCommand(commandInput({ deadlineMs: 10 * 60 * 1000 })), /deadline must be between/);
  });
});

describe("turn control: malformed, exotic, and secret-bearing fields fail closed", () => {
  it("refuses a Proxy route", () => {
    setup();
    const proxyRoute = new Proxy(versionThreeRoute(), {});
    assert.throws(() => enqueueControlCommand(commandInput({ route: proxyRoute })), /Proxy/);
  });

  it("refuses a __proto__-carrying native turn reference locator", () => {
    setup();
    const malicious = JSON.parse('{"turnId":"t-1","__proto__":{"polluted":true}}');
    assert.throws(
      () => enqueueControlCommand(commandInput({ nativeTurnRef: nativeTurnRef({ locator: malicious }) })),
      /not admitted/
    );
  });

  it("refuses a secret-shaped locator field", () => {
    setup();
    assert.throws(
      () => enqueueControlCommand(commandInput({
        nativeTurnRef: nativeTurnRef({ locator: { turnId: "t-1", apiKey: "sk-live-abc" } }),
      })),
      /forbidden secret-shaped key/
    );
  });

  it("refuses an accessor-defined field on the native turn reference envelope", () => {
    setup();
    const exotic = {};
    Object.defineProperty(exotic, "version", { get() { return 1; }, enumerable: true });
    Object.defineProperty(exotic, "harnessId", { value: "fake-service", enumerable: true });
    Object.defineProperty(exotic, "driverVersion", { value: "fake-service@1", enumerable: true });
    Object.defineProperty(exotic, "instanceKey", { value: "tenant-alpha", enumerable: true });
    Object.defineProperty(exotic, "locatorVersion", { value: 1, enumerable: true });
    Object.defineProperty(exotic, "locator", { value: { turnId: "t-1" }, enumerable: true });
    assert.throws(() => enqueueControlCommand(commandInput({ nativeTurnRef: exotic })), /plain data property/);
  });

  it("rejects an unstable-identity commandId", () => {
    setup();
    assert.throws(
      () => enqueueControlCommand(commandInput({ commandId: "cmd​1" })),
      /bounded identity text/
    );
  });
});

describe("turn control: corrupt and partial durable records", () => {
  it("fails closed on invalid JSON without deleting the file", () => {
    setup();
    enqueueControlCommand(commandInput());
    const streamDir = resolveControlStreamDirectory(binding());
    const [fileName] = fs.readdirSync(streamDir).filter((entry) => entry.endsWith(".json"));
    const filePath = path.join(streamDir, fileName);
    const originalBytes = fs.readFileSync(filePath);
    fs.writeFileSync(filePath, "not json");
    assert.throws(() => readControlCommand({ ...binding(), commandId: "cmd-1" }), /corrupt/);
    assert.deepEqual(fs.readFileSync(filePath), Buffer.from("not json"));
    fs.writeFileSync(filePath, originalBytes);
  });

  it("fails closed on a zero-byte partial write without deleting the file", () => {
    setup();
    enqueueControlCommand(commandInput());
    const streamDir = resolveControlStreamDirectory(binding());
    const [fileName] = fs.readdirSync(streamDir).filter((entry) => entry.endsWith(".json"));
    const filePath = path.join(streamDir, fileName);
    const originalBytes = fs.readFileSync(filePath);
    fs.writeFileSync(filePath, "");
    assert.throws(() => readControlCommand({ ...binding(), commandId: "cmd-1" }), /corrupt/);
    fs.writeFileSync(filePath, originalBytes);
  });

  it("fails closed on an unsupported schema version", () => {
    setup();
    const record = enqueueControlCommand(commandInput());
    const streamDir = resolveControlStreamDirectory(binding());
    const filePath = path.join(streamDir, fs.readdirSync(streamDir).find((entry) => entry.endsWith(".json")));
    fs.writeFileSync(filePath, JSON.stringify({ ...record, version: 99 }));
    assert.throws(() => readControlCommand({ ...binding(), commandId: "cmd-1" }), /unsupported schema version/);
  });

  it("fails closed on an identity-drifted (hand-copied) record", () => {
    setup();
    enqueueControlCommand(commandInput());
    enqueueControlCommand(commandInput({ commandId: "cmd-2" }));
    const streamDir = resolveControlStreamDirectory(binding());
    const files = fs.readdirSync(streamDir).filter((entry) => entry.endsWith(".json"));
    const [a, b] = files.sort();
    const contentA = fs.readFileSync(path.join(streamDir, a), "utf8");
    fs.writeFileSync(path.join(streamDir, b), contentA);
    assert.throws(() => listControlCommands(binding()), /does not live at the directory\/filename its own identity derives/);
  });
});

/** Enqueue `cmd-1` and claim it for `attempt-1`, the shared setup ack/settlement tests build on. */
function enqueueAndClaim(attemptId = "attempt-1") {
  enqueueControlCommand(commandInput());
  return claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: attemptId });
}

describe("turn control: request acknowledgement never rewrites settlement or native turn state", () => {
  for (const requestState of ["accepted", "rejected", "unsupported"]) {
    it(`records requestState=${requestState} without touching settlement or nativeTurnState`, () => {
      setup();
      enqueueAndClaim();
      const updated = recordRequestAcknowledgement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState,
      });
      assert.equal(updated.requestState, requestState);
      assert.equal(updated.settlement, "pending");
      assert.equal(updated.nativeTurnState, "active");
      assert.ok(updated.acknowledgedAt);
    });
  }

  it("is idempotent for a repeated identical acknowledgement from the exact claiming attempt", () => {
    setup();
    enqueueAndClaim();
    const first = recordRequestAcknowledgement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted",
    });
    const second = recordRequestAcknowledgement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted",
    });
    assert.deepEqual(first, second);
  });

  it("fails closed on a conflicting second acknowledgement value", () => {
    setup();
    enqueueAndClaim();
    recordRequestAcknowledgement({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted" });
    assert.throws(
      () => recordRequestAcknowledgement({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "rejected" }),
      /already recorded requestState/
    );
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.equal(stored.requestState, "accepted");
  });

  it("refuses an unclaimed command: an isolated caller cannot impersonate a worker", () => {
    setup();
    enqueueControlCommand(commandInput());
    assert.throws(
      () => recordRequestAcknowledgement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted",
      }),
      /has not been claimed/
    );
  });

  it("refuses a cross-attempt acknowledgement: a different worker attempt cannot record an outcome for a command it did not claim", () => {
    setup();
    enqueueAndClaim("attempt-1");
    assert.throws(
      () => recordRequestAcknowledgement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-2", requestState: "accepted",
      }),
      /claimed by worker attempt/
    );
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.equal(stored.requestState, "none");
  });
});

describe("turn control: settlement classification reuses classifyTurnSettlement exactly", () => {
  it("keeps settlement pending while the native turn is still active", () => {
    setup();
    enqueueAndClaim();
    const updated = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence({ status: "failed", nativeTurn: "active", executionWorld: { continuity: "preserved", settlement: "active" } }),
    });
    assert.equal(updated.settlement, "pending");
    assert.equal(updated.nativeTurnState, "active");
  });

  it("becomes settled only for publishable terminal evidence", () => {
    setup();
    enqueueAndClaim();
    const updated = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence(),
    });
    assert.equal(updated.settlement, "settled");
    assert.equal(updated.nativeTurnState, "terminal");
  });

  it("becomes unknown for an unknown native turn", () => {
    setup();
    enqueueAndClaim();
    const updated = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence({ status: "failed", nativeTurn: "unknown", executionWorld: { continuity: "unknown", settlement: "unknown" } }),
    });
    assert.equal(updated.settlement, "unknown");
    assert.equal(updated.nativeTurnState, "unknown");
  });

  it("becomes unknown for terminal-but-unsettled contradictory evidence, never rejected/settled", () => {
    setup();
    enqueueAndClaim();
    const updated = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence({ status: "completed", nativeTurn: "active" }),
    });
    assert.equal(updated.settlement, "unknown");
    assert.notEqual(updated.settlement, "settled");
  });

  it("refuses evidence that is not settlement-shaped at all", () => {
    setup();
    enqueueAndClaim();
    assert.throws(
      () => recordControlSettlement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", normalizedTerminalResult: { interrupted: true },
      }),
      /not settlement-shaped/
    );
  });

  it("is monotonic: settled never regresses on a later contradictory observation", () => {
    setup();
    enqueueAndClaim();
    recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", normalizedTerminalResult: settlementEvidence(),
    });
    const after = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence({ status: "failed", nativeTurn: "active", executionWorld: { continuity: "preserved", settlement: "active" } }),
    });
    assert.equal(after.settlement, "settled");
    assert.equal(after.nativeTurnState, "terminal");
  });

  it("refuses an unclaimed command: settlement recording is not a reconciler bypass in this generation", () => {
    setup();
    enqueueControlCommand(commandInput());
    assert.throws(
      () => recordControlSettlement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
        normalizedTerminalResult: settlementEvidence(),
      }),
      /has not been claimed/
    );
  });

  it("refuses a cross-attempt settlement observation", () => {
    setup();
    enqueueAndClaim("attempt-1");
    assert.throws(
      () => recordControlSettlement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-2",
        normalizedTerminalResult: settlementEvidence(),
      }),
      /claimed by worker attempt/
    );
  });

  it("accepts settlement evidence that exactly matches this command's bound native turn reference (valid exact-bound terminal result)", () => {
    setup();
    enqueueAndClaim();
    const updated = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence({ nativeTurnRef: nativeTurnRef() }),
    });
    assert.equal(updated.settlement, "settled");
    assert.equal(updated.nativeTurnState, "terminal");
  });

  it("refuses settlement evidence for a foreign turn: same Harness/instance/Driver, different accepted turn", () => {
    setup();
    enqueueAndClaim();
    assert.throws(
      () => recordControlSettlement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
        normalizedTerminalResult: settlementEvidence({
          nativeTurnRef: nativeTurnRef({ locator: { turnId: "a-different-turn-entirely" } }),
        }),
      }),
      /does not exactly match this command's bound native turn reference/
    );
    // Refusal never mutates the record: settlement stays exactly as enqueued.
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.equal(stored.settlement, "pending");
  });

  it("refuses settlement evidence for a foreign Harness/instance/Driver version", () => {
    setup();
    enqueueAndClaim();
    for (const foreignField of [
      { harnessId: "another-harness" },
      { instanceKey: "another-instance" },
      { driverVersion: "another-driver@2" },
    ]) {
      assert.throws(
        () => recordControlSettlement({
          ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
          normalizedTerminalResult: settlementEvidence({ nativeTurnRef: nativeTurnRef(foreignField) }),
        }),
        /foreign Harness, logical instance, or Driver version/,
        `expected refusal for ${JSON.stringify(foreignField)}`
      );
    }
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.equal(stored.settlement, "pending");
  });

  it("refuses settlement evidence missing its native turn reference binding entirely", () => {
    setup();
    enqueueAndClaim();
    assert.throws(
      () => recordControlSettlement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
        normalizedTerminalResult: settlementEvidence({ nativeTurnRef: undefined }),
      }),
      /does not carry a native turn reference/
    );
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.equal(stored.settlement, "pending");
  });

  it("refuses hook-bearing, Proxy, accessor, and cyclic settlement locators before comparison", () => {
    const cases = [
      ["toJSON spoof", () => ({
        turnId: "a-different-turn",
        toJSON() { return { turnId: "t-1" }; },
      }), /must not carry a function or callback/],
      ["accessor locator", () => {
        const locator = {};
        Object.defineProperty(locator, "turnId", {
          enumerable: true,
          get() { throw new Error("settlement locator getter must not execute"); },
        });
        return locator;
      }, /plain data property/],
      ["Proxy locator", () => new Proxy({ turnId: "t-1" }, {
        get() { throw new Error("settlement locator Proxy trap must not execute"); },
      }), /must not be a Proxy/],
      ["cyclic locator", () => {
        const locator = { turnId: "t-1" };
        locator.self = locator;
        return locator;
      }, /contains a cycle/],
    ];

    for (const [label, makeLocator, expectedError] of cases) {
      setup();
      enqueueAndClaim();
      assert.throws(
        () => recordControlSettlement({
          ...binding(),
          commandId: "cmd-1",
          nativeTurnRef: nativeTurnRef(),
          workerAttemptId: "attempt-1",
          normalizedTerminalResult: settlementEvidence({
            nativeTurnRef: nativeTurnRef({ locator: makeLocator() }),
          }),
        }),
        expectedError,
        label
      );
      const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
      assert.equal(stored.settlement, "pending", label);
      assert.equal(stored.nativeTurnState, "active", label);
    }
  });

  it("never lets foreign-turn evidence update nativeTurnState either, not only settlement", () => {
    setup();
    enqueueAndClaim();
    assert.throws(
      () => recordControlSettlement({
        ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
        normalizedTerminalResult: settlementEvidence({
          status: "failed",
          nativeTurn: "active",
          executionWorld: { continuity: "preserved", settlement: "active" },
          nativeTurnRef: nativeTurnRef({ harnessId: "another-harness" }),
        }),
      }),
      /foreign Harness, logical instance, or Driver version/
    );
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.equal(stored.nativeTurnState, "active");
    assert.equal(stored.settlement, "pending");
  });

  it("never regresses unknown to pending: an active observation after a deadline stays unknown, only publishable terminal evidence later settles it", () => {
    setup();
    const record = enqueueAndClaim();
    recordRequestAcknowledgement({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted" });
    const expired = expireControlCommandDeadline({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(),
      now: () => Date.parse(record.deadlineAt) + 1,
    });
    assert.equal(expired.settlement, "unknown");

    const stillActive = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence({ status: "failed", nativeTurn: "active", executionWorld: { continuity: "preserved", settlement: "active" } }),
    });
    assert.equal(stillActive.settlement, "unknown");
    assert.equal(stillActive.nativeTurnState, "active");

    const settled = recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence(),
    });
    assert.equal(settled.settlement, "settled");
    assert.equal(settled.nativeTurnState, "terminal");
  });
});

describe("turn control: deadline expiry moves only settlement to unknown", () => {
  it("does nothing before the deadline", () => {
    setup();
    const record = enqueueControlCommand(commandInput());
    const result = expireControlCommandDeadline({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(),
      now: () => Date.parse(record.requestedAt),
    });
    assert.equal(result.expired, false);
    assert.equal(result.settlement, "pending");
  });

  it("moves settlement to unknown, leaving requestState and nativeTurnState untouched", () => {
    setup();
    const record = enqueueControlCommand(commandInput());
    claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    recordRequestAcknowledgement({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted" });
    const result = expireControlCommandDeadline({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(),
      now: () => Date.parse(record.deadlineAt) + 1,
    });
    assert.equal(result.expired, true);
    assert.equal(result.settlement, "unknown");
    assert.equal(result.requestState, "accepted");
    assert.equal(result.nativeTurnState, "active");
    assert.notEqual(result.settlement, "rejected");
    assert.notEqual(result.nativeTurnState, "terminal");
  });

  it("is a no-op once settlement is already decided", () => {
    setup();
    const record = enqueueControlCommand(commandInput());
    claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    recordControlSettlement({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", normalizedTerminalResult: settlementEvidence(),
    });
    const result = expireControlCommandDeadline({
      ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(),
      now: () => Date.parse(record.deadlineAt) + 1,
    });
    assert.equal(result.expired, false);
    assert.equal(result.settlement, "settled");
  });
});

describe("turn control: claim ordering, exactly-once, and restart redelivery", () => {
  it("claims a pending command, is idempotent for the same attempt, and never implies the request was accepted", () => {
    setup();
    enqueueControlCommand(commandInput());
    const first = claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    const second = claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    assert.equal(first.claimedByAttemptId, "attempt-1");
    assert.equal(first.requestState, "none");
    assert.equal(first.settlement, "pending");
    assert.deepEqual(first, second);
  });

  it("fails closed when a different worker attempt tries to claim a command while a claim already exists", () => {
    setup();
    enqueueControlCommand(commandInput());
    claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    assert.throws(
      () => claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-2" }),
      /already claimed by worker attempt/
    );
    // The original claim is unchanged; there is no silent transfer.
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    assert.equal(stored.claimedByAttemptId, "attempt-1");
  });

  it("refuses to claim a command that is already acknowledged", () => {
    setup();
    enqueueAndClaim();
    recordRequestAcknowledgement({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted" });
    assert.throws(
      () => claimControlCommand({ ...binding(), commandId: "cmd-1", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" }),
      /already acknowledged/
    );
  });

  it("refuses to claim out of sequence order while an earlier command is unacknowledged", () => {
    setup();
    enqueueControlCommand(commandInput({ commandId: "cmd-a" }));
    enqueueControlCommand(commandInput({ commandId: "cmd-b" }));
    assert.throws(
      () => claimControlCommand({ ...binding(), commandId: "cmd-b", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" }),
      /cannot be claimed before unacknowledged command/
    );
    // The earlier command remains claimable and claiming it in order succeeds.
    const claimedA = claimControlCommand({ ...binding(), commandId: "cmd-a", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    assert.equal(claimedA.commandId, "cmd-a");
  });

  it("allows claiming the next command once the earlier one is acknowledged", () => {
    setup();
    enqueueControlCommand(commandInput({ commandId: "cmd-a" }));
    enqueueControlCommand(commandInput({ commandId: "cmd-b" }));
    claimControlCommand({ ...binding(), commandId: "cmd-a", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    recordRequestAcknowledgement({ ...binding(), commandId: "cmd-a", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1", requestState: "accepted" });
    const claimedB = claimControlCommand({ ...binding(), commandId: "cmd-b", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    assert.equal(claimedB.commandId, "cmd-b");
  });

  it("a claimed-but-never-acknowledged command blocks the rest of the job's stream, and deadline expiry does not unblock it", () => {
    setup();
    const commandA = enqueueControlCommand(commandInput({ commandId: "cmd-a" }));
    enqueueControlCommand(commandInput({ commandId: "cmd-b" }));
    // A worker claims cmd-a, then is lost -- it never records an acknowledgement.
    claimControlCommand({ ...binding(), commandId: "cmd-a", nativeTurnRef: nativeTurnRef(), workerAttemptId: "lost-attempt" });
    assert.throws(
      () => claimControlCommand({ ...binding(), commandId: "cmd-b", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-2" }),
      /cannot be claimed before unacknowledged command/
    );
    // Deadline expiry only ever touches settlement, never requestState, so it
    // cannot relieve the block either: cmd-b remains unclaimable afterward.
    const expired = expireControlCommandDeadline({
      ...binding(), commandId: "cmd-a", nativeTurnRef: nativeTurnRef(),
      now: () => Date.parse(commandA.deadlineAt) + 1,
    });
    assert.equal(expired.settlement, "unknown");
    assert.equal(expired.requestState, "none");
    assert.throws(
      () => claimControlCommand({ ...binding(), commandId: "cmd-b", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-2" }),
      /cannot be claimed before unacknowledged command/
    );
  });
});

describe("turn control: durable wake is a hint only, never proof of a command", () => {
  it("a caller that reads after an already-persisted enqueue never needs to wait", () => {
    setup();
    enqueueControlCommand(commandInput());
    // The durable record is visible immediately; a late waiter must not block
    // on a watcher event it already missed.
    assert.equal(listControlCommands(binding()).length, 1);
  });

  it("a wake hint from directory lock churn alone is not proof of a command; the reread after the wake is authoritative", async (t) => {
    if (process.platform !== "linux") {
      t.skip("filesystem event gate is Linux-only");
      return;
    }
    setup();
    const streamDir = resolveControlStreamDirectory(binding());
    fs.mkdirSync(streamDir, { recursive: true });
    const pending = waitForDurableActivity({
      desiredPaths: [streamDir],
      stateRoot: process.env.CODEX_HARNESSDOCK_RUNTIME_HOME,
      deadline: Date.now() + 2_000,
      recoveryIntervalMs: 60_000,
    });
    setTimeout(() => {
      // Simulate exactly the kind of filesystem churn `acquireDirectoryLock()`
      // produces on this same directory -- a create-then-rename-away, with no
      // command ever appended -- to prove a wake event alone carries no
      // information about *what* happened, only that *something* did.
      const lockLikeFile = path.join(streamDir, ".lock");
      fs.writeFileSync(lockLikeFile, "{}");
      fs.unlinkSync(lockLikeFile);
    }, 25);
    const result = await pending;
    assert.equal(result.wakeReason, "watcher");
    // The reread is authoritative and finds nothing: the wake was lock churn,
    // not a command. This is the only claim durable wake is allowed to
    // support -- never that the triggering event was itself the command.
    assert.equal(listControlCommands(binding()).length, 0);
  });

  it("wakes a real waiter from real filesystem activity before the recovery interval, and the reread after the wake finds the durable command with no loss", async (t) => {
    if (process.platform !== "linux") {
      t.skip("filesystem event gate is Linux-only");
      return;
    }
    setup();
    const streamDir = resolveControlStreamDirectory(binding());
    fs.mkdirSync(streamDir, { recursive: true });
    const pending = waitForDurableActivity({
      desiredPaths: [streamDir],
      stateRoot: process.env.CODEX_HARNESSDOCK_RUNTIME_HOME,
      deadline: Date.now() + 2_000,
      recoveryIntervalMs: 60_000,
    });
    setTimeout(() => {
      // `enqueueControlCommand()` runs fully synchronously (lock acquire,
      // write, lock release all happen before this callback returns), so by
      // the time any filesystem event it produces reaches the watcher below,
      // the command is already durably written -- this test does not, and
      // cannot, prove which specific internal event (lock-file creation, the
      // final atomic rename, or lock-file removal) is what actually fired the
      // watcher; only that a wake happened and a reread afterward is complete.
      enqueueControlCommand(commandInput());
    }, 25);
    const result = await pending;
    assert.equal(result.wakeReason, "watcher");
    // The wake is only a hint: the waiter must re-read durable state itself,
    // and that reread must lose no command.
    const commands = listControlCommands(binding());
    assert.equal(commands.length, 1);
    assert.equal(commands[0].commandId, "cmd-1");
  });

  it("a waiter that registers after the command already landed resolves via post-registration, never missing it", async () => {
    setup();
    enqueueControlCommand(commandInput());
    const streamDir = resolveControlStreamDirectory(binding());
    const result = await waitForDurableActivity({
      desiredPaths: [streamDir],
      stateRoot: process.env.CODEX_HARNESSDOCK_RUNTIME_HOME,
      deadline: Date.now() + 2_000,
      afterRegister: () => listControlCommands(binding()).length > 0,
    });
    assert.equal(result.wakeReason, "post-registration");
  });
});

describe("turn control: concurrent isolated enqueues (real processes, no lost command)", () => {
  it("admits every distinct command from independent processes with no gap or duplicate sequence", async () => {
    setup();
    const stateHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
    const commandIds = Array.from({ length: 6 }, (_, index) => `race-cmd-${index}`);
    const runs = commandIds.map(
      (commandId) => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [contentionFixture, "enqueue", commandId], {
          env: { ...process.env, CODEX_HARNESSDOCK_RUNTIME_HOME: stateHome },
        });
        let stdout = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.on("error", reject);
        child.on("close", () => resolve(stdout.trim()));
      })
    );
    const results = await Promise.all(runs);
    assert.ok(results.every((result) => result === "ok"), `unexpected contention results: ${results.join(",")}`);
    const stored = listControlCommands(binding());
    assert.equal(stored.length, commandIds.length);
    const sequences = stored.map((record) => record.sequence).sort((a, b) => a - b);
    assert.deepEqual(sequences, Array.from({ length: commandIds.length }, (_, index) => index + 1));
    const storedIds = new Set(stored.map((record) => record.commandId));
    for (const commandId of commandIds) assert.ok(storedIds.has(commandId), `lost command ${commandId}`);
  });
});

describe("turn control: exactly-once worker claim/ack recording under contention (real processes)", () => {
  it("lets exactly one of two competing worker attempts claim and acknowledge; the other observes the closed conflict", async () => {
    setup();
    enqueueControlCommand(commandInput());
    const stateHome = process.env.CODEX_HARNESSDOCK_RUNTIME_HOME;
    const runOne = (workerAttemptId, requestState) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [contentionFixture, "claim-and-ack", "cmd-1", workerAttemptId, requestState], {
        env: { ...process.env, CODEX_HARNESSDOCK_RUNTIME_HOME: stateHome },
      });
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.on("error", reject);
      child.on("close", () => resolve(stdout.trim()));
    });
    const [resultA, resultB] = await Promise.all([
      runOne("attempt-a", "accepted"),
      runOne("attempt-b", "rejected"),
    ]);
    const outcomes = [resultA, resultB];
    assert.equal(outcomes.filter((value) => value === "ok").length, 1, `expected exactly one winner: ${outcomes.join(",")}`);
    assert.equal(outcomes.filter((value) => value.startsWith("conflict")).length, 1, `expected exactly one conflict: ${outcomes.join(",")}`);
    const stored = readControlCommand({ ...binding(), commandId: "cmd-1" });
    // Whichever attempt won the claim is the only one whose acknowledgement
    // could ever be recorded: the winner's requestState and claimedByAttemptId
    // must agree, never a mix of one attempt's claim with the other's ack.
    assert.ok(["attempt-a", "attempt-b"].includes(stored.claimedByAttemptId));
    const expectedRequestState = stored.claimedByAttemptId === "attempt-a" ? "accepted" : "rejected";
    assert.equal(stored.requestState, expectedRequestState);
    assert.equal(stored.settlement, "pending");
    assert.equal(stored.nativeTurnState, "active");
  });
});

describe("turn control: durable stream closure (live-ownership barrier)", () => {
  it("settles every bound command, including one never claimed or requested", () => {
    setup();
    enqueueControlCommand(commandInput({ commandId: "cmd-claimed" }));
    enqueueControlCommand(commandInput({ commandId: "cmd-never-touched" }));
    claimControlCommand({ ...binding(), commandId: "cmd-claimed", nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1" });
    recordRequestAcknowledgement({
      ...binding(), commandId: "cmd-claimed", nativeTurnRef: nativeTurnRef(),
      workerAttemptId: "attempt-1", requestState: "accepted",
    });

    const receipt = closeControlStreamForAttempt({
      ...binding(),
      nativeTurnRef: nativeTurnRef(),
      workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence(),
    });
    assert.equal(receipt.closed, true);
    assert.deepEqual([...receipt.settledCommandIds].sort(), ["cmd-claimed", "cmd-never-touched"]);
    assert.deepEqual(receipt.skipped, []);

    const commands = listControlCommands(binding());
    const claimed = commands.find((entry) => entry.commandId === "cmd-claimed");
    const untouched = commands.find((entry) => entry.commandId === "cmd-never-touched");
    assert.equal(claimed.requestState, "accepted");
    assert.equal(claimed.settlement, "settled");
    assert.equal(claimed.nativeTurnState, "terminal");
    // Never requested is stated exactly: no invented acceptance, no invented
    // rejection, and above all not left claiming the turn is still active.
    assert.equal(untouched.requestState, "none");
    assert.equal(untouched.settlement, "settled");
    assert.equal(untouched.nativeTurnState, "terminal");

    const closure = readControlStreamClosure(binding());
    assert.equal(closure.closedByAttemptId, "attempt-1");
    assert.equal(closure.settlement, "settled");
  });

  it("refuses every later enqueue and claim on a closed stream", () => {
    setup();
    closeControlStreamForAttempt({
      ...binding(),
      nativeTurnRef: nativeTurnRef(),
      workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence(),
    });
    assert.throws(
      () => enqueueControlCommand(commandInput({ commandId: "cmd-late" })),
      (error) => error.code === "stream_closed"
    );
    assert.deepEqual(listControlCommands(binding()), []);
  });

  it("closes only on publishable evidence that names this exact turn", () => {
    setup();
    enqueueControlCommand(commandInput());
    assert.throws(
      () => closeControlStreamForAttempt({
        ...binding(),
        nativeTurnRef: nativeTurnRef(),
        workerAttemptId: "attempt-1",
        normalizedTerminalResult: settlementEvidence({ nativeTurn: "unknown" }),
      }),
      (error) => error.code === "not_publishable"
    );
    assert.throws(
      () => closeControlStreamForAttempt({
        ...binding(),
        nativeTurnRef: nativeTurnRef(),
        workerAttemptId: "attempt-1",
        normalizedTerminalResult: settlementEvidence({ nativeTurnRef: nativeTurnRef({ locator: { turnId: "t-other" } }) }),
      }),
      (error) => error.code === "foreign_evidence"
    );
    // Nothing was touched by either refusal.
    assert.equal(readControlStreamClosure(binding()), null);
    assert.equal(listControlCommands(binding())[0].settlement, "pending");
  });

  it("is idempotent for its own attempt and refuses a foreign one", () => {
    setup();
    const first = closeControlStreamForAttempt({
      ...binding(), nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence(),
    });
    const repeat = closeControlStreamForAttempt({
      ...binding(), nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence(),
    });
    assert.equal(first.closed, true);
    assert.equal(repeat.closed, true);
    assert.throws(
      () => closeControlStreamForAttempt({
        ...binding(), nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-2",
        normalizedTerminalResult: settlementEvidence(),
      }),
      (error) => error.code === "closed_by_other_attempt"
    );
  });

  it("leaves a foreign-turn command exactly as its own owner wrote it", () => {
    setup();
    const foreignRef = nativeTurnRef({ locator: { turnId: "t-foreign" } });
    enqueueControlCommand(commandInput({ commandId: "cmd-foreign", nativeTurnRef: foreignRef }));
    const receipt = closeControlStreamForAttempt({
      ...binding(), nativeTurnRef: nativeTurnRef(), workerAttemptId: "attempt-1",
      normalizedTerminalResult: settlementEvidence(),
    });
    assert.deepEqual(receipt.settledCommandIds, []);
    assert.deepEqual(receipt.skipped, [{ commandId: "cmd-foreign", reason: "foreign_native_turn" }]);
    const command = listControlCommands(binding())[0];
    assert.equal(command.settlement, "pending");
    assert.equal(command.claimedByAttemptId, null);
  });

  it("identifies a native turn by value, not by locator key order", () => {
    setup();
    enqueueControlCommand(commandInput());
    // Same turn, same values, different key insertion order in the envelope.
    const reordered = {
      locator: { turnId: "t-1" },
      locatorVersion: 1,
      instanceKey: "tenant-alpha",
      driverVersion: "fake-service@1",
      harnessId: "fake-service",
      version: 1,
    };
    const claimed = claimControlCommand({
      ...binding(), commandId: "cmd-1", nativeTurnRef: reordered, workerAttemptId: "attempt-1",
    });
    assert.equal(claimed.claimedByAttemptId, "attempt-1");
  });
});

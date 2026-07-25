import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderJobStatus, renderStoredResult } from "../../runtime/render.mjs";

describe("runtime rendering", () => {
  it("shows lifecycle, exact session, recovery, steering, and partial output", () => {
    const rendered = renderJobStatus({
      id: "cc-1",
      status: "running",
      phase: "reconnect_backoff",
      threadId: "session-1",
      recoveryAttempts: 2,
      partialOutput: "partial answer",
      steering: { pendingCount: 1, latestAcknowledgedSequence: 3 },
    });
    assert.match(rendered, /status: running/);
    assert.match(rendered, /phase: reconnect_backoff/);
    assert.match(rendered, /Claude session: session-1/);
    assert.match(rendered, /recovery attempts: 2/);
    assert.match(rendered, /pending steering: 1/);
    assert.match(rendered, /latest steering ack: 3/);
    assert.match(rendered, /Partial output \(latest\)[\s\S]*partial answer/);
  });

  it("does not duplicate partial output in a stored final result", () => {
    const rendered = renderStoredResult({
      id: "cc-1",
      status: "completed",
      partialOutput: "same answer",
      rendered: "same answer",
    });
    assert.equal(rendered.match(/same answer/g)?.length, 1);
  });
});

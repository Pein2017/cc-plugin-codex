/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * A separate process that contends for one owner root's version-three job
 * directory lock.
 *
 * `persist()` in `runtime/v3-job-store.mjs` is a read-modify-write of a durable
 * lifecycle record, so its directory lock is the only thing standing between a
 * concurrent uncertainty write and a terminal one. Nothing inside a single
 * process can prove that lock holds: this runs the same public store calls from
 * outside, so the contention is real.
 *
 * Modes:
 *   uncertain  repeatedly attempts the running -> unknown transition
 *   mark       repeatedly attempts the projection marks
 *   read       repeatedly reads and validates the record
 *
 * Every attempt's outcome is reported on stdout as bounded JSON. An attempt
 * that is refused is a success for this fixture: it means the store's own
 * lifecycle gate spoke, not that the lock leaked.
 */

import {
  markVersionThreeTurnProjected,
  readVersionThreeJobRecord,
  recordVersionThreeTurnUncertain,
} from "../../../runtime/v3-job-store.mjs";

const [mode, rawPayload] = process.argv.slice(2);
const payload = JSON.parse(rawPayload);
const identity = {
  ownerRootId: payload.ownerRootId,
  agentId: payload.agentId,
  jobId: payload.jobId,
};

const attempts = [];
const deadline = Date.now() + payload.windowMs;

while (Date.now() < deadline && attempts.length < payload.maxAttempts) {
  try {
    if (mode === "uncertain") {
      const record = recordVersionThreeTurnUncertain({
        generation: payload.generation,
        ...identity,
        attemptId: payload.attemptId,
        reason: "contender_probe",
        detail: null,
      });
      attempts.push({ ok: true, status: record.status });
    } else if (mode === "mark") {
      const record = markVersionThreeTurnProjected({
        generation: payload.generation,
        ...identity,
        agentProjected: false,
        completionPublished: false,
      });
      attempts.push({ ok: true, status: record.status });
    } else {
      const record = readVersionThreeJobRecord(identity);
      attempts.push({ ok: true, status: record?.status ?? null });
    }
  } catch (error) {
    attempts.push({ ok: false, code: error?.code ?? "error" });
  }
  // Stop as soon as the record has settled terminally: everything after that
  // is the same observation repeated.
  if (payload.stopOnTerminal && attempts.at(-1)?.status === "completed") break;
}

process.stdout.write(JSON.stringify(attempts));

/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * A separate-process contender for the version-three settlement barrier.
 *
 * The barrier's whole claim is that it is durable rather than in-process: a
 * caller in *another* process, holding no worker state, must not be able to
 * bind a message or a control command to a turn that is being settled. A
 * same-process timer can never prove that -- the settlement sequence is
 * synchronous between the terminal result and disposal, so nothing in this
 * process can interleave with it. This contender can.
 *
 * It hammers the two isolated-caller entry points until it has observed the
 * barrier take effect (or its window expires) and reports what each attempt
 * did, so the test can assert the invariant over every outcome: a message is
 * either delivered, or queued for a later turn -- never stranded on the
 * terminal job -- and a command is either settled against terminal evidence or
 * refused outright, never left falsely active.
 *
 * Stopping on the first observed barrier hit is what keeps the race both
 * deterministic and quick: the test completes the turn once this process is
 * demonstrably live, and this process keeps writing until it can prove it was
 * still writing after the barrier closed.
 */

import { createAgentStore } from "../../../runtime/agent-store.mjs";
import { FUTURE_WRITE_GENERATION } from "../../../runtime/durable-state-v3.mjs";
import { enqueueControlCommand } from "../../../runtime/turn-control.mjs";

const [, , mode, payloadText] = process.argv;
const payload = JSON.parse(payloadText);

function enqueueMessages() {
  const store = createAgentStore({
    cwd: payload.cwd,
    ownerRootId: payload.ownerRootId,
    writeGeneration: FUTURE_WRITE_GENERATION,
  });
  const attempts = [];
  const deadline = Date.now() + payload.windowMs;
  let index = 0;
  let afterBarrier = 0;
  while (Date.now() < deadline && afterBarrier < 3) {
    index += 1;
    try {
      const { message, delivery } = store.enqueueMessage(payload.agentId, `contender message ${index}`);
      attempts.push({ messageId: message.messageId, state: message.state, delivery });
      // `queued_no_turn` while a turn was active means the durable quiesce
      // barrier is in force: keep writing a little longer to prove it holds.
      if (delivery === "queued_no_turn") afterBarrier += 1;
    } catch (error) {
      attempts.push({ refused: error?.message ?? String(error) });
      afterBarrier += 1;
    }
  }
  return attempts;
}

function enqueueCommands() {
  const attempts = [];
  const deadline = Date.now() + payload.windowMs;
  let index = 0;
  let afterBarrier = 0;
  while (Date.now() < deadline && afterBarrier < 3) {
    index += 1;
    try {
      const record = enqueueControlCommand({
        commandId: `${payload.commandPrefix}-${index}`,
        kind: "interrupt",
        ownerRootId: payload.ownerRootId,
        agentId: payload.agentId,
        jobId: payload.jobId,
        route: payload.route,
        nativeTurnRef: payload.nativeTurnRef,
        deadlineMs: 30_000,
      });
      attempts.push({ commandId: record.commandId, accepted: true });
    } catch (error) {
      attempts.push({ commandId: `${payload.commandPrefix}-${index}`, accepted: false, code: error?.code ?? null });
      afterBarrier += 1;
    }
  }
  return attempts;
}

const result = mode === "messages" ? enqueueMessages() : enqueueCommands();
process.stdout.write(JSON.stringify(result));

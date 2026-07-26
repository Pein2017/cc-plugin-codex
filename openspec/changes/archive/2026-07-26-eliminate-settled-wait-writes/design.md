## Context

`wait_agent` reconciles root-owned jobs once before blocking and once after the internal wait. Two settled facts currently re-enter mutation paths on every pass:

- `reconcileFromJobs()` reports a terminal job with `agentProjectionReconciledAt` as `already_finalized`, after which `AgentRuntime.reconcile()` nevertheless patches the same marker again.
- `reconcileTerminalJobCompletion()` calls the locked append path even when the deterministic completion event is already delivered or acknowledged and therefore immutable.

The 500 ms inner polling loop is already observation-only when no progress is claimable. The ownership boundary to repair is therefore idempotent reconciliation, not the polling schedule.

## Goals / Non-Goals

**Goals:**

- Make a complete quiet `wait_agent` call write-free when every relevant completion event and Agent projection is already settled.
- Preserve crash repair and all state transitions that genuinely require durable mutation.
- Retain deterministic concurrency behavior for unfrozen completion correction and first delivery.

**Non-Goals:**

- Change wait deadlines, polling cadence, progress backoff, public receipts, or root scope.
- Remove reconciliation from the wait boundary.
- Make recovery, acknowledgement, progress claiming, or first delivery write-free.

## Decisions

1. **Inspect before locking, then compare-and-set under the job lock.** `already_finalized` can mean either that the job already carries `agentProjectionReconciledAt`, or that the registry finalized before a crash prevented the job marker write. `AgentRuntime.reconcile()` will skip the first case without locking. In the crash window it will call a job-store helper that reacquires the current job under its mutation lock and writes only if the marker is still absent. Concurrent recovery processes may both inspect the stale missing-marker snapshot, but only one can perform the durable repair; later settled passes remain observation-only.

2. **Use a validated immutable snapshot fast path for completion append.** Before taking the inbox lock, `appendCompletionEvent()` may return an existing deterministic event only when that event has already been first-delivered or acknowledged. Those states make the payload immutable under the existing contract, so no competing valid writer can correct it. Unfrozen and unacknowledged events continue through lock-and-reread, even when their current payload appears equal.

3. **Measure the public call, not only helper functions.** A regression test will prepare a normally settled terminal Agent, freeze and acknowledge its completion, instrument persistence mutation primitives, and assert that a timed-out `wait_agent` performs none. Focused inbox tests will separately prove that immutable reconciliation is lock-free while an unfrozen correction still locks and persists.

Alternatives rejected:

- Removing pre/post reconciliation would reduce writes but weaken crash recovery and late job projection.
- Lengthening the 500 ms poll interval would not address the observed writes, which occur outside the loop.
- Treating every matching snapshot as lock-free would introduce a race while an unfrozen event is still legally correctable.

## Risks / Trade-offs

- **[Risk] A stale immutable snapshot is compacted concurrently.** → An acknowledged event is already delivered by definition; returning its idempotent existing receipt remains safe. An unacknowledged first-delivered event is not eligible for acknowledged compaction.
- **[Risk] The fast path hides an identity collision.** → Perform the same owner/job/Agent identity validation before returning from the snapshot.
- **[Risk] A necessary projection marker repair is skipped.** → Pair each receipt with the job snapshot: an already-finalized registry plus a missing job marker still performs one repair write, while a present marker skips the write.
- **[Risk] Two recovery processes both repair from stale missing-marker snapshots.** → Recheck the marker under the job lock and make the repair a compare-and-set operation; cover it with synchronized multi-process regression evidence.
- **[Risk] A missing marker keeps an old terminal job past retention and later recreates its compacted acknowledged completion.** → Add a crash-window regression that repairs the marker, proves the old job can be pruned before acknowledged-tail compaction, then verifies no completion resurrection.
- **[Trade-off] Unfrozen duplicate reconciliation still acquires a lock.** → This is intentional to preserve correction serialization before first public exposure.

## Migration Plan

No persisted schema or user migration is required. Deploy the checkout-owned runtime change, run focused and full local verification, archive/sync the OpenSpec change, then refresh the local plugin snapshot only if discovery metadata changed (none is expected).

## Open Questions

None. The measured mutation sources and safe immutability boundary are explicit.

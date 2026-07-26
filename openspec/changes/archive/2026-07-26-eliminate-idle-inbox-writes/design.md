## Context

`ClaudeRuntime.wait()` polls every 500 ms and calls `readUnreadAgentCompletionSummaries()`. That function currently performs one validated read and then unconditionally enters `withInboxLock()` whenever an inbox file exists. Lock acquisition creates and fsyncs a candidate ownership record, even if there is no unread Agent completion and even if the only selected completion already has immutable `firstDeliveredAt` state. The current 10-minute default therefore permits roughly 1200 unnecessary lock fsyncs per quiet wait.

The completion inbox owns root isolation, append ordering, first-delivery freezing, acknowledgement, correction, and compaction. This change must remove observation-only writes without weakening those ownership or durability boundaries.

## Goals / Non-Goals

**Goals:**

- Keep the 500 ms completion observation cadence and immediate return behavior.
- Make quiet reads and already-frozen redelivery use only a validated snapshot, with zero lock acquisition and zero fsync.
- Keep first-delivery freezing atomic with respect to append, reconciliation, and acknowledgement.
- Preserve identical public completion payloads and delivery tokens across redelivery.

**Non-Goals:**

- Changing public lifecycle operations, arguments, timeout bounds, progress pacing, or stored inbox schema.
- Replacing filesystem persistence, adding a resident watcher, or depending on host callbacks.
- Broadly optimizing Agent registry or job-store polling.

## Decisions

### 1. Use the validated inbox snapshot as the observation gate

The reader will parse and validate the inbox once, select the unread Agent-linked prefix from that snapshot, and return immediately when the selection is empty. This avoids a write lock for the overwhelmingly common quiet path. A new append immediately after the snapshot remains visible on the next 500 ms poll, which is the same race boundary as an append immediately after the current locked read.

An mtime-only or existence-only probe was rejected because it would introduce cache invalidation state and could conceal malformed durable data. The existing validated file remains the sole read authority.

### 2. Redeliver an already-frozen prefix directly from the snapshot

If every selected event already has `firstDeliveredAt`, its public payload is immutable by contract. The reader can project that snapshot without locking or writing. A concurrent acknowledgement may make this response a final duplicate, but the token and payload were valid at snapshot time and two-phase delivery already permits at-least-once duplicates; the acknowledgement cursor never regresses.

For a multi-event diagnostic batch, a racing acknowledgement may advance only an already-returned prefix while the snapshot still contains the whole frozen batch. A later acknowledgement of that snapshot therefore treats its already-acknowledged token prefix idempotently and validates only the remaining suffix against the oldest unread Agent-linked events. It still cannot skip an unread event or acknowledge tokens out of durable order.

Taking a read lock for redelivery was rejected because the lock itself is implemented through a durable candidate record and recreates the fsync cost despite no state mutation.

### 3. Lock, reread, and freeze only an unexposed selection

If the snapshot contains any selected event without `firstDeliveredAt`, the existing lock path remains authoritative. It rereads after acquiring the lock, reselects the prefix, stamps only still-unfrozen events, writes atomically when changed, and projects the locked state. This preserves first-delivery immutability under competing waiters, acknowledgement, reconciliation, and append.

### 4. Prove the IO contract directly

Focused tests will instrument Node's filesystem `fsyncSync` boundary after fixture setup. Repeated quiet reads and frozen redelivery must perform zero fsyncs, while first delivery and acknowledgement must still persist their state and existing concurrency tests must remain green. A before/after 200-read probe records the practical reduction without turning timing into a flaky pass criterion.

## Risks / Trade-offs

- [A completion is appended just after a quiet snapshot] → It is observed on the next unchanged 500 ms poll; no larger latency bound is introduced.
- [Acknowledgement races a snapshot-based redelivery] → At most one valid duplicate with the same frozen token/payload is returned; the durable acknowledgement cursor remains monotonic.
- [Partial acknowledgement races a multi-event frozen snapshot] → Later acknowledgement accepts the already-acknowledged prefix idempotently and advances only the exact oldest unread suffix.
- [A future mutation bypasses first-delivery immutability] → Keep reconciliation and correction rules unchanged and cover identical redelivery after attempted correction.
- [Tests accidentally count fixture setup fsyncs] → Install the fsync counter only around the observation calls being asserted.

## Migration Plan

No data migration is required because the inbox schema and stored events are unchanged. Deploy as a checkout-hot runtime change, run focused completion/concurrency tests and the full release gate, then refresh the plugin discovery snapshot only for versioned installation consistency. Rollback is a direct function-level revert; existing inboxes remain readable by either version.

## Open Questions

None. The user approved preserving 500 ms responsiveness while removing observation-only persistence writes.

## Why

`wait_agent` polls for completion every 500 ms, but the current Agent-completion read path acquires a durable lock and fsyncs its lock record even when the inbox is quiet or the same frozen completion is merely being redelivered. A measured 200-read probe produced 200 fsyncs in both cases, so the new 10-minute default can create avoidable disk churn without improving correctness or latency.

## What Changes

- Add a validated read-only fast path when no unread Agent completion exists.
- Return an already-frozen unread completion from the validated snapshot without acquiring the inbox write lock.
- Preserve the existing lock-and-reread path for first delivery, where `firstDeliveredAt` freezes the public payload.
- Preserve locked acknowledgement, append, reconciliation, correction, and compaction semantics.
- Prove zero fsync calls for repeated quiet reads and frozen redelivery while retaining the 500 ms completion observation cadence and two-phase at-least-once delivery.
- Non-goals: changing the public Agent API, timeout defaults, polling cadence, progress heartbeat, completion ordering, or durable payload format.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-delivery`: Require observation-only completion reads to avoid persistence mutation unless first delivery must freeze an unread payload.

## Impact

- Affected implementation: `runtime/completion-inbox.mjs` and completion wait tests.
- Public API and stored schema: unchanged.
- Dependencies: none.
- Supported platform and release gates remain Linux and `npm run check`.

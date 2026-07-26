## Why

Repeated `list_agents` and reconciliation calls currently acquire the completion-inbox write lock and call `fsync` even when the validated inbox already contains the exact same normalized completion fact. This turns a stable state snapshot into persistence traffic and multiplies lock contention across retained terminal jobs without improving durability.

## What Changes

- Treat reconciliation of an existing byte-equivalent normalized completion fact as observation-only, including when the event is unread and has not yet been exposed.
- Keep lock-and-reread behavior for a missing event and for a genuinely different unacknowledged fact that may require correction.
- Keep first model-facing delivery responsible for durably freezing an unfrozen completion payload.
- Add whole-call I/O regression coverage proving repeated `list_agents` calls over settled unread Agent-linked and quarantined legacy completion facts do not acquire persistence locks, call `fsync`, or write durable state.
- Non-goals: no public API change, no completion acknowledgement or redelivery change, no relaxation of immutable delivered-event rules, and no removal of crash-window completion repair.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-delivery`: Make idempotent reconciliation of an already-identical completion fact observation-only before first delivery as well as after publication or acknowledgement.

## Impact

- Runtime: `runtime/completion-inbox.mjs` snapshot fast path.
- Verification: completion-inbox concurrency/correction tests and full-call Agent listing persistence tests.
- Public lifecycle, on-disk schema, dependencies, model policy, and installation metadata remain unchanged.

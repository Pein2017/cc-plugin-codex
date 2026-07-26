## Context

Completion reconciliation normalizes a terminal job into one deterministic inbox event. The current snapshot fast path returns without a write lock only after the event has been delivered or acknowledged. If an unread, unfrozen event already matches the normalized job fact exactly, reconciliation still creates and fsyncs a lock candidate, rereads the inbox, and returns `already-present` without changing the inbox. Because `list_agents` reconciles retained terminal facts before rendering the registry, this no-op path turns repeated state snapshots into persistence traffic.

The inbox remains the durable owner of completion delivery and freezing. The terminal job remains the fact source for crash repair. This change must preserve both boundaries and must not make `list_agents` a completion-delivery operation.

## Goals / Non-Goals

**Goals:**

- Make exact-fact completion reconciliation observation-only regardless of delivery state.
- Preserve atomic append, genuine correction, immutable delivery, and first-exposure freezing behavior.
- Make repeated `list_agents` calls over already-reconciled terminal state acquire no persistence lock, call no `fsync`, and write no durable state.
- Cover both Agent-linked completions and quarantined legacy records because both pass through workspace reconciliation.

**Non-Goals:**

- Changing the six public lifecycle operations or their result schema.
- Bypassing reconciliation of a missing event or an unacknowledged completion whose normalized fact actually differs.
- Changing acknowledgement, redelivery, retention, or Agent projection-marker semantics.
- Refreshing Plugin discovery metadata; this is checkout-hot runtime behavior.

## Decisions

1. **Return a same-fact snapshot before acquiring the inbox lock.** After validating deterministic identity, reconciliation compares all normalized durable fields. An exact match is a completed idempotent operation, so it returns the existing event directly whether or not `firstDeliveredAt` is present. This is preferable to locking every unread event because no serialized mutation exists to protect.

2. **Keep lock-and-reread for real corrections.** If the snapshot differs and the event is still mutable, reconciliation follows the existing locked path and decides against the latest inbox state. If the snapshot differs but delivery or acknowledgement has made it immutable, it returns the existing immutable payload without locking. Thus only same-fact observation becomes cheaper; correction ordering is unchanged.

3. **Do not special-case `list_agents` by skipping reconciliation.** Skipping completion repair during Agent projection could create a crash window where the registry marker becomes durable and retention removes the only detailed job before its completion event exists. Optimizing the idempotent inbox primitive keeps every caller safe while preserving missing-event repair ordering.

4. **Test the public whole-call boundary and the primitive boundary.** A whole-call I/O counter will assert zero writes/locks/fsync for repeated `list_agents` over both an unread Agent completion and a legacy completion. Focused completion tests will prove an exact mutable fact avoids the lock while a different unacknowledged fact still corrects durably.

## Risks / Trade-offs

- **[A concurrent writer changes the event after the snapshot comparison]** → The returned reconciliation receipt is internal and cannot expose or freeze completion payloads. The concurrent mutation remains serialized by its own lock, and future reconciliation rereads the durable state. This is the same observation race as any read-only snapshot and cannot lose a required write from the same-fact caller.
- **[A too-weak equality check mistakes a correction for an exact fact]** → Reuse the full normalized durable-field comparison already used by locked reconciliation and retain identity validation before the fast return.
- **[The optimization hides missing-event recovery]** → The fast path is available only when the deterministic event already exists; absent events still enter the locked append path.
- **[Tests prove only the helper, not model-facing behavior]** → Count persistence calls around the complete `listAgents()` invocation in addition to direct inbox tests.

## Migration Plan

No on-disk migration or Plugin reinstall is required. Deploy the runtime-only checkout change after focused and full validation. Rollback is a source revert; existing inbox files remain schema-compatible.

## Open Questions

None.

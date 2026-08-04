## Context

`wait_agent` currently mirrors Codex Multi-Agent V2's root-wide activity wait, but CC completion content is delivered through a separate durable FIFO inbox. The inbox exposes one Agent-linked event per call and acknowledges only the oldest contiguous prefix. This preserves at-least-once delivery, but an unrelated completion can wake a targeted critical path and must be consumed before a later target event can be acknowledged.

The existing owners remain correct: `runtime/index.mjs` is the public lifecycle seam, `AgentRuntime` owns Agent/job resolution, the internal runtime owns bounded observation, and `completion-inbox.mjs` owns durable delivery. The design changes selection and acknowledgement inside those owners instead of adding a second coordinator. The independently specified `replace-wait-polling-with-event-wakeup` change is implemented and accepted first; targeted observation reuses that wake primitive rather than adding another notifier.

## Goals / Non-Goals

**Goals:**

- Let a lead wait for one exact Agent turn or for a fixed set of exact turns.
- Preserve the no-target root-wide path and its Codex-V2-shaped next-activity behavior.
- Keep unrelated completion facts unread and undisturbed by a targeted join.
- Preserve freeze-before-delivery, at-least-once redelivery, full final messages, root isolation, and crash recovery.
- Return one aggregate barrier result so the lead does not track remaining Agents or consume one completion per wait call.

**Non-Goals:**

- Add another public tool, persisted barrier lifecycle, subset-any mode, automatic follow-up, cancellation, or cross-root join.
- Use target joins as a progress polling surface; `wake_on_progress` and `targets` are mutually exclusive in this generation.
- Change Claude process lifetime, background-task semantics, or native session ownership.
- Silently evict unread completion events to control storage growth.

## Decisions

### Extend `wait_agent` with one optional exact target set

The existing operation gains `targets`, a non-empty array of at most eight unique exact current-root Agent identifiers. Omission preserves the current path. One target means a targeted join; two or more mean an all-settled barrier. A separate `join` mode is rejected because untargeted wait already supplies next-any semantics and no demonstrated case requires subset-any. Eight covers the demonstrated parallel-team width while bounding aggregate structure and simultaneous complete-message fan-in; final messages themselves retain the existing no-truncation contract.

Strict validation rejects an empty set, duplicates, foreign or unknown Agents, `targets` combined with `wake_on_progress`, and target counts above eight before delivery state changes.

### Snapshot Agent and turn identity once

At call entry, after reconciliation, each target resolves to `{agentId, jobId}`. A working Agent binds `activeJobId`; an already terminal Agent binds its `latestJobId`. A target with neither is immediately `not_joinable`. The snapshot never follows a later activation, so a follow-up cannot extend an in-flight barrier and an old completion from the same Agent cannot satisfy the wrong turn.

An implementation that filters only by `agentId` is invalid because durable Agent identity spans multiple turns.

### Treat all terminal outcomes as settled

`completed`, `failed`, and `interrupted` jobs settle a target. A blocked/non-resumable terminal Agent is returned with its frozen blocking triple. A missing concrete turn or irreconcilable target/job link returns immediately as non-joinable rather than consuming the one-hour window.

A barrier waits until every joinable snapshotted job is terminal. It then returns one stable entry per requested target in caller order. Unread completions include their frozen full handoff and delivery token; a completion already acknowledged in this root is represented as `already_consumed` with terminal status and no reconstructed final message. If any target is non-joinable, the call returns a partial aggregate immediately and does not activate or repair a new turn.

### Do not partially deliver on a barrier timeout

Before all targets settle, a timeout returns per-target logical status and the unresolved target names but does not freeze, return, or acknowledge partial completion payloads. Reissuing the same barrier can therefore deliver the final aggregate once without forcing the lead to merge batches. Completion visible at the existing final-observation linearization point wins over timeout.

### Move acknowledgement from a global prefix rule to per-event facts

Inbox v2 records acknowledgement per Agent-linked event. Acknowledging a previously delivered token is idempotent and may select events independently of older unrelated unread events. The stored `acknowledgedThrough` value becomes a derived compaction watermark: the highest sequence below which every Agent-linked event is acknowledged or a quarantined legacy event is skipped.

First delivery still freezes each completion payload under its own opaque token. A completed barrier returns its tokens as one ordered `acknowledge_tokens` batch; a later wait may echo that batch exactly once. This retains loss-safe redelivery without inventing an unsafe implicit acknowledgement. Untargeted delivery remains one oldest unread Agent-linked event at a time.

Version-one inboxes read forward by treating every Agent-linked event at or below the old cursor as acknowledged and later events as unacknowledged. Migration occurs under the existing atomic inbox writer; old frozen payloads and tokens remain unchanged.

### Filter observation at the durable job identity

Targeted observation selects completions by snapshotted `jobId`, not merely by public Agent status. Unrelated events are neither frozen nor returned and cannot wake the call. The final zero-time observation uses the same fixed selection. The no-target path retains current completion-first and opt-in progress behavior.

### Keep implementation ownership serialized and verification independent

Inbox schema, Agent resolution, and public receipt changes share one lifecycle seam and therefore use one explicit Codex builder/integrator. The preferred route is Luna at high or xhigh behind deterministic tests if the live interface exposes it; otherwise Terra/high is the bounded builder. A provider-independent Claude Opus/high reviewer examines the fixed diff for token loss, wrong-turn satisfaction, and restart races. The Codex lead owns integration, runs `npm run check`, and decides acceptance. This is role-shaped evidence, not a model ranking experiment.

## Risks / Trade-offs

- [Per-event acknowledgement can pin compaction behind an old unread hole] -> Derive and test the watermark, retain unread events without silent eviction, and expose operator-only diagnostics before adding a cleanup policy.
- [A follow-up races barrier entry] -> Bind the concrete job under the existing reconciled Agent snapshot and test completion/activation interleavings.
- [Two waiters freeze or acknowledge overlapping events] -> Reuse lock-reread first-delivery freezing and make per-token acknowledgement idempotent.
- [Aggregate final messages can be large] -> Bound target count, not Agent final-message content; the existing no-truncation contract remains authoritative.
- [Targeting diverges from Codex V2] -> Preserve no-target V2 behavior and justify targeting only as a CC durable-delivery extension.
- [The new MCP field is invisible to existing tasks] -> Classify the change as a public generation change and require a new Codex task after promotion.

## Migration Plan

1. Accept `replace-wait-polling-with-event-wakeup` and freeze its internal notification seam.
2. Add inbox-v2 read-forward validation and migration tests before changing selection.
3. Implement per-event acknowledgement and derived compaction while preserving the old untargeted API.
4. Add fixed-turn target resolution, barrier observation, and aggregate receipts behind the runtime seam using the accepted notification helper.
5. Add the strict MCP field, Skill guidance, CLI diagnostics, and plugin contract tests.
6. Run focused concurrency/restart tests and `npm run check`; then promote through the developer-to-main gate as a restart-required public generation.

Rollback restores the prior model-facing schema and no-target implementation, but an inbox written as v2 must remain readable without discarding per-event acknowledgement. Therefore the storage migration is forward-only; rollback code must retain the v2 reader or release is held.

## Open Questions

- Decide whether operator diagnostics need an unread-hole warning in this change or a later storage-maintenance change. This does not block the delivery contract.

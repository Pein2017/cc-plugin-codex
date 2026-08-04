## 1. Freeze Delivery And Migration Invariants

- [x] 1.0 Confirm `replace-wait-polling-with-event-wakeup` is implemented and accepted on this developer tree; reuse its internal wake primitive and do not add a second notifier.
- [x] 1.1 Add inbox-v2 fixtures that derive per-event acknowledgement from a version-one contiguous cursor without changing frozen payloads, tokens, or quarantined legacy events.
- [x] 1.2 Add deterministic tests for out-of-order selected acknowledgement, idempotent repeats, unread holes, derived compaction watermark, concurrent appends, and restart redelivery.
- [x] 1.3 Fix the public target-count bound at eight from demonstrated team width and aggregate fan-in evidence, and record it in the design/spec before exposing the schema.

## 2. Implement Per-Event Completion Ownership

- [x] 2.1 Migrate completion inbox validation and atomic persistence to per-Agent-event acknowledgement while retaining the derived contiguous compaction watermark.
- [x] 2.2 Extend completion selection/freezing so a fixed job set can be delivered atomically without touching unrelated events.
- [x] 2.3 Preserve the existing one-event oldest-first untargeted path and prove its byte-for-byte public receipt compatibility with focused tests.

## 3. Implement Fixed-Turn Target And Barrier Join

- [x] 3.1 Resolve each exact current-root target once to `{agentId, jobId}` after reconciliation, rejecting unknown, duplicate, foreign, or empty inputs before waiting and returning known Agents without a concrete turn as `not_joinable`.
- [x] 3.2 Implement one-target and all-target observation on the accepted durable-activity wake primitive, including terminal/blocked aggregation, timeout snapshots, no partial delivery, and the existing final-observation linearization point.
- [x] 3.3 Add race tests for completion during snapshot, same-Agent follow-up after snapshot, unrelated older completion, abort during barrier, already-consumed target, and process/runtime restart.

## 4. Expose The Minimal Public Generation

- [x] 4.1 Add bounded optional `targets` to the strict MCP and direct runtime/CLI contracts, reject `targets` with `wake_on_progress`, and add no new tool or join-mode selector.
- [x] 4.2 Update wait Skill guidance, metadata, README, generated contract assertions, and release-smoke discovery so required multi-Agent joins prefer one fixed barrier over repeated root-wide waits.
- [x] 4.3 Verify existing no-target callers and operator diagnostics remain compatible and that public receipts expose no job IDs, native sessions, inbox metadata, or foreign-root state.

## 5. Routed Review And Lead Acceptance

- [x] 5.1 Route one explicit Codex builder/integrator over the shared storage/runtime seam, preferring live Luna high/xhigh behind the deterministic verifier and using Terra/high only for a demonstrated route mismatch; do not run competing writers on these files.
- [ ] 5.2 After the builder fixes one exact tree, run a fresh Claude Opus/high read-only review for token loss, wrong-turn satisfaction, acknowledgement holes, starvation, and restart races; treat auth/quota/plugin failures as surface evidence rather than model quality. **Blocked 2026-08-04:** the exact-tree Agent failed before review with `401 OAuth access token has expired` and `operator_required`; no retry or provider substitution was made.
- [x] 5.3 Let the Codex lead disposition every finding, rerun affected focused tests plus `npm run check`, and record a concise route evaluation in the implementation handoff; update `agent-routing` priors only if the evidence changes a routing decision.
- [x] 5.4 Hold promotion and release; hand back the verified developer-tree result for an explicit later release decision because the MCP generation requires a new Codex task.

## Implementation handoff

- Luna/xhigh completed the shared inbox/runtime/schema seam without a route mismatch; no Terra reroute was warranted.
- Lead review fixed one watcher-registration barrier-ready latency window and strengthened abort, final-observation, restart, root-isolation, acknowledgement, and malformed-v2 evidence.
- The route result does not justify a durable `agent-routing` prior change from this single task.

## Context

The baseline separates durable plugin job state from Claude Code's own session artifacts, but completion is still primarily pull-based through status/result and ownership filtering is concentrated in listing paths. A long-running worker can finish after the initiating Codex turn has ended; the result remains durable, but nothing records whether that root has seen the completion. At the same time, terminal jobs already release their Claude session lease and process fields, so adding a logical Agent identity later must not reintroduce resident idle processes.

This change hardens those foundations while the old public job API still exists. It deliberately precedes the breaking canonical V2 API migration so the later Agent layer can reuse proven completion, authorization, recovery, and residency primitives.

## Goals / Non-Goals

**Goals:**

- Make every terminal transition produce exactly one durable completion event for its Codex root.
- Support bounded wait and next-turn unread delivery without assuming unsolicited Codex execution.
- Enforce trusted-root scoping consistently and preserve explicit cross-root listing only for operator diagnostics.
- Make resumability an explicit receipt-derived state rather than an inference from any session ID.
- Prove that terminal jobs release workers, Claude processes, and leases.
- Measure 1/3/6 concurrent jobs before deciding whether runtime admission control is necessary.

**Non-Goals:**

- Wake a stopped Codex task without a supported host callback.
- Introduce a resident daemon, logical Agent registry, archive action, or model-managed garbage collection.
- Rename the public lifecycle operations or preserve them after the later breaking migration.
- Promise unbounded plugin audit history or control Claude Code's artifact retention/compaction.

## Decisions

### 1. Store completion events in a root-owned durable inbox

Each first transition into a terminal job status appends one immutable completion event under the Codex owner root. An event contains a monotonic sequence, event ID, owner ID, job ID, terminal status, completion timestamp, short summary, resumability classification, and pointers to the retained result. A separate atomic cursor records the highest contiguously acknowledged sequence.

Unread events are never removed merely because the associated job exceeds normal terminal-job retention. A read/wait call returns the oldest unread contiguous batch plus opaque delivery tokens but does not advance the cursor in the same response-producing call. A later wait explicitly echoes those tokens; only a contiguous acknowledged prefix advances atomically. Acknowledged events may then be compacted to a bounded tail. This gives at-least-once delivery across a crash between runtime return and Codex receipt.

Alternative considered: infer unread completions by comparing job timestamps. Rejected because it cannot distinguish already surfaced results and becomes incorrect when job retention prunes older records.

### 2. Split completion into runtime, mailbox, and host responsibilities

The worker owns terminal detection and event append. The public runtime owns `wait` and two-phase unread delivery/acknowledgement primitives. Skills or a future Agent API surface unread completions at the beginning of the next Codex turn and echo prior delivery tokens only after Codex has demonstrably received them. Proactive wakeup is an optional future host adapter that consumes the same inbox; no runtime correctness property depends on it.

Alternative considered: keep a forwarding subagent or background terminal alive solely to wake Codex. Rejected because it couples correctness to resident host state and recreates the upstream lifecycle burden.

### 3. Canonicalize and authorize one owner root identity

The hardened state field is `ownerRootId`. Normal plugin execution receives it immutably from the trusted Codex bootstrap/host boundary, sourced from the host's canonical thread identity; model-facing skills and commands cannot supply or override it. `CC_OWNER_SESSION_ID` and an explicit owner flag remain available only to a separate operator/test harness, never to the model-facing route. New records persist `ownerRootId`; a legacy `job.sessionId` equal to the current trusted root is upgraded on the next atomic write, while foreign legacy values remain visible only to operator diagnostics. The future Agent registry's `rootThreadId` is exactly this `ownerRootId`, not a second mapping.

All normal job lookups and mutations resolve within the caller's non-empty trusted `ownerRootId`. `--all` moves to a separate operator-only read-only diagnostic CLI across owner roots in the same workspace. It is not accepted by model-facing skills and does not grant cross-owner steering, interruption, follow-up, cancellation, or acknowledgement.

Alternatives considered: accept a model-supplied owner flag, silently prefer `CC_OWNER_SESSION_ID` over a differing host thread ID, or treat knowledge of a job ID as authorization. Rejected because the first two allow spoofing or split one root's inbox/retention/Agent registry, and the third makes leaked durable IDs into capabilities.

### 4. Persist a four-way recoverability classification

Terminal state alone does not decide continuation:

- `completed`: resumable when the exact Claude session is present and ownership is valid;
- `interrupted`: resumable with preserved partial output and the exact Claude session;
- `failed`: resumable only when the failure classifier and receipt explicitly say so;
- `cancelled`: non-resumable and destructive.

Follow-up checks this classification, session lease, and session-drift contract before creating a new job. The later canonical API may remove public cancellation, but this change keeps baseline cancellation only long enough to establish its non-resumable meaning.

Alternative considered: permit follow-up whenever any Claude session ID is present. Rejected because protocol drift, ownership failure, or destructive cancellation can leave an ID that is unsafe or semantically wrong to resume.

### 5. Define terminal state as non-resident

Before publishing a terminal completion, the supervisor verifies that the Claude child or signalled process group exited, clears durable worker/child process identities, and releases the Claude session lease. The supervisor worker exits immediately after the durable terminal publication and does not enter a resident wait loop. Logical identity and artifacts remain durable; no Claude process is retained for possible follow-up.

Alternative considered: expose `close` or `archive` to release memory. Rejected because terminal jobs already have no intended resident process; such an action would add ceremony without releasing resources.

### 6. Make concurrency policy evidence-driven

A controlled probe runs equivalent bounded read-only Claude work at concurrency 1, 3, and 6. It records host baseline memory, per-process and aggregate peak RSS, startup/completion latency, failure/transport outcomes, lease conflicts, and post-terminal process cleanup. The change introduces an admission cap only if the evidence identifies a concrete safe threshold or failure boundary; otherwise concurrency remains externally bounded and the evidence is retained.

Alternative considered: copy Codex's concurrency limit or choose a constant from intuition. Rejected because Claude process memory and host limits differ from Codex Agent residency.

## Risks / Trade-offs

- [Completion event exists after its job receipt is pruned] → Preserve self-contained summary/resumability fields and make a missing detailed result explicit rather than dropping unread notification.
- [Concurrent readers acknowledge out of order or crash before Codex receives output] → Deliver the oldest contiguous batch with opaque tokens and advance the cursor only when a later call echoes a contiguous prefix.
- [A worker crashes between job transition and event append] → Reconciliation scans terminal jobs for missing deterministic event IDs and appends them idempotently.
- [`--all` exposes diagnostic metadata] → Keep it outside model-facing skills in an explicit operator-only CLI, read-only and redacted.
- [Concurrency probe itself consumes subscription capacity] → Use bounded prompts, fixed stop conditions, and stop escalation if level 3 already crosses a safety threshold.
- [Claude Code artifact retention is upstream-owned] → Promise only that plugin cleanup never targets those artifacts; test exact-session resume using currently retained sessions.

## Migration Plan

1. Require the archived baseline specs as the comparison point and materialize a resolved requirement matrix against those stable specs.
2. Add the inbox schema/store and terminal-transition reconciliation with focused crash/idempotency tests.
3. Inject canonical `ownerRootId` from the trusted bootstrap, remove model-facing owner overrides, migrate matching legacy records, centralize root resolution, and move explicit `--all` to the read-only operator CLI.
4. Add recoverability classification and update follow-up validation.
5. Add terminal cleanup assertions and run fake-Claude lifecycle tests.
6. Run the controlled 1/3/6 real-Claude probe and record the capacity decision.
7. Run full checks and one completion/restart/next-turn real smoke before syncing and archiving.

Rollback keeps baseline job behavior readable: stop producing/reading the new inbox records, remove any evidence-derived admission policy, and leave existing job/Claude artifacts intact.

## Open Questions

None. A proactive host wake adapter remains intentionally deferred until Codex exposes a supported integration surface.

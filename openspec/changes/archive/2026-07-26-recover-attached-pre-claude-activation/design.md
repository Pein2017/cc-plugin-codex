## Context

Agent activation currently crosses several durable boundaries: public option
validation, Agent and mailbox creation, prepared-job attachment, detached worker
startup, Claude child spawn, initial stdin delivery, and terminal projection.
The implementation validates part of the execution profile only inside the
worker and clears `preClaudeLaunch` before it has durably recorded the Claude
child. A crash in either window can leave a newly created Agent blocked, consume
mailbox entries Claude never saw, bind a session, or publish a false completion.

The initial `spawn_agent` message is also passed directly to the launcher rather
than stored as an Agent mailbox entry. Recovery therefore cannot reconstruct
message identity and ordering without inventing data. The fix must keep the six
public operations and exact-session rules unchanged, preserve root isolation,
and avoid replay after input might have reached Claude.

## Goals / Non-Goals

**Goals:**

- Reject invalid model, effort, execution-profile, and permission combinations
  before public activation mutates an Agent, mailbox, job, or steering record.
- Make the Agent mailbox the durable owner of the first-turn prompt and all
  messages racing with activation.
- Clear the pre-Claude marker only in the same durable compare-and-swap that
  accepts a concrete Claude child identity, before any prompt bytes are written.
- Recover any terminal receipt that still has `preClaudeLaunch=true` as a
  non-turn diagnostic: release its lease, restore prior Agent state, requeue its
  messages, and suppress session binding and completion publication.
- Keep recovery idempotent and make only recovered diagnostics retention-
  eligible.

**Non-Goals:**

- Changing the six public APIs or their names.
- Replaying work after a durable child-launch receipt, even if no prompt write
  is later observed.
- Adopting foreign Claude sessions, changing Claude artifacts, or adding an
  automatic retry policy.
- Solving the separate detached-worker PID publication window or adding queued-
  activation interruption semantics.

## Decisions

### Validate one pure execution profile before every durable activation

`execution-profile.mjs` will expose a pure validator that owns normalization and
all model, effort, profile, and permission compatibility checks.
`createExecutionProfile` will call it before creating temporary sandbox
settings. Public `spawn_agent` and any `followup_task` path that can activate a
turn will call the same validator before readiness, Agent creation, mailbox
append, job preparation, or steering mutation. `prepareStart` will repeat the
pure check as a defense-in-depth invariant.

Duplicating selected checks in public methods was rejected because it lets the
worker and API drift. Treating an asynchronous worker failure as validation was
rejected because the caller has already received a false successful spawn.

### Persist the first spawn prompt as mailbox sequence one

Agent creation will atomically include the initial spawn message as the first
queued mailbox entry. Activation reservation assigns that entry and any
concurrently queued messages to the winning prepared job in sequence order; the
launcher receives only the text derived from those assigned entries. After the
detached worker is launched, those entries become `dispatched` with
`initial_prompt` intent under their existing identities.

If synchronous preparation fails, rollback removes the new Agent and name only
when its mailbox still contains solely that spawn message and no job or session
was established. If another sender raced, the Agent and the complete ordered
mailbox remain available rather than deleting unrelated input. Reconstructing
the initial prompt only during recovery was rejected because it cannot preserve
stable message IDs, order, or exactly-once acknowledgement.

### Treat `preClaudeLaunch` as the sole replay-safety boundary

The canonical pre-Claude predicate is `job.preClaudeLaunch === true`, regardless
of whether the prepared job was attached to an Agent. Attachment establishes
ownership but does not prove Claude execution. `activationAttached` remains
diagnostic metadata and is not a launch boundary.

`launchPreparedStart` will no longer clear the marker. The Claude adapter will
spawn the child without writing stdin, obtain a valid PID identity, and invoke a
launch-acceptance callback. The job runner accepts the child only by atomically
transitioning the still-current running job to record PID evidence while
clearing `preClaudeLaunch` and `safeFreshRetry`. Only an accepted callback may
allow the initial prompt or any input pump to write. Rejection, exception, or
missing PID terminates the child and writes zero prompt bytes. Supervisor phase
`running_attempt` is recorded only after acceptance.

Recording the marker through the current post-write `onSpawn` callback was
rejected because a crash after stdin write but before persistence would falsely
permit replay. Clearing it before spawning the child was rejected because a
crash in that window produces a false ambiguous turn.

### Reconcile pre-Claude diagnostics before generic Agent projection

Session binding and completion reconciliation will skip every terminal job that
still has the pre-Claude marker. `AgentRuntime` will scan those receipts before
calling generic `reconcileFromJobs`. Its dedicated recovery transaction will:

- remove the receipt from the Agent's active turn only if that pointer still
  targets the failed activation;
- restore the reservation's prior lifecycle, continuation, session, and latest
  job evidence without regressing a newer Agent turn;
- return mailbox entries still assigned or dispatched to this job to `queued`
  in original sequence order without incrementing attempts or acknowledging
  them; and
- write an Agent-projection reconciliation marker on the diagnostic receipt.

If the Agent has already advanced, recovery cleans only messages still tied to
the old job and marks the diagnostic processed. It never overwrites newer
lifecycle or session evidence. Generic completion projection then sees no
unprocessed pre-Claude receipt, so recovery is restart-idempotent and creates no
completion sequence.

### Retain unrecovered diagnostics and prune only proven recovered ones

An attached terminal pre-Claude receipt without an Agent reconciliation marker
is not retention-eligible, even though it intentionally lacks a completion
event. Once recovered, its projection marker is sufficient for bounded cleanup.
An unattached prepared receipt may be cleaned under the existing unbound rule.
This prevents an old unrecovered activation from disappearing while avoiding an
unbounded diagnostic leak after recovery.

## Risks / Trade-offs

- **Risk: callback acceptance and prompt writes race** → Keep all writes behind
  the awaited callback result and add fake-child tests asserting zero stdin on
  rejection, exception, and missing PID.
- **Risk: recovery regresses a newer Agent turn** → Compare active/latest job
  pointers and restore prior state only when the failed reservation still owns
  them; otherwise clean only its linked messages.
- **Risk: concurrent mailbox traffic is lost during spawn rollback** → Delete
  the Agent only when the original spawn message is its sole durable entry;
  otherwise preserve the complete mailbox.
- **Risk: pre-launch and post-launch failures are confused** → Use exactly one
  persisted marker cleared with child PID evidence; never infer safety from
  attachment, worker PID, timestamps, or absence of a session.
- **Trade-off: a child accepted before prompt write is conservatively ambiguous**
  → Do not replay it; durable child acceptance means input could have been
  delivered even if a later receipt does not prove the write.
- **Risk: diagnostics bypass the 100-receipt bound forever** → Preserve only
  unrecovered attached diagnostics; mark recovered receipts and test cleanup
  beyond the retention window.

## Migration Plan

No persisted schema migration is required; all new behavior uses existing
optional receipt fields plus the existing Agent projection marker. On the first
owner-scoped reconciliation after upgrade, terminal receipts with
`preClaudeLaunch=true` are recovered before normal projection. Post-launch
receipts continue through the existing path. Rollback is the code commit only;
already requeued messages remain valid durable mailbox entries.

## Open Questions

None for this change. Detached-worker parent PID publication and interruption of
a queued prepared activation remain separate follow-up investigations.

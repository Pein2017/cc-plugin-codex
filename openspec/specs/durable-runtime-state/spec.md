# durable-runtime-state Specification

## Purpose

Define atomic control-plane state, process identity, bounded recovery, retention, stale reaping, and session leases.
## Requirements
### Requirement: Process control requires verified identity
The runtime SHALL require a matching deterministic process identity for every signal, termination, and liveness-ownership decision, including session-conflict cleanup and stale-state reaping. It SHALL refuse a raw PID when identity is missing or mismatched.

#### Scenario: PID has been reused
- **WHEN** an interrupt or cancellation target has a different process identity from the stored job
- **THEN** the runtime refuses to signal that process and records the control failure

#### Scenario: Internal conflict cleanup lacks identity
- **WHEN** session-conflict cleanup has a Claude PID but no process identity
- **THEN** it refuses to signal the PID, marks the job for attention, and records the missing identity

#### Scenario: Reaper sees PID without identity
- **WHEN** stale-job reaping has only a recorded PID
- **THEN** it does not treat that PID as proof of ownership or liveness

#### Scenario: PID identity matches
- **WHEN** process control has a live PID and its deterministic identity matches the stored receipt
- **THEN** the requested platform-appropriate signal or termination may proceed

### Requirement: Transport recovery is bounded and exact-session
The supervisor SHALL treat reconnect attempts as one logical job, use bounded backoff, preserve cumulative receipts, and resume only the captured Claude session when automatic replay is safe.

#### Scenario: Transport closes after a session ID is captured
- **WHEN** the failure is classified as transport-resumable and retry budget remains
- **THEN** the supervisor starts a bounded reconnect attempt with `--resume` for that exact session

#### Scenario: Possible side effects occur without a session ID
- **WHEN** transport fails after write mode or observed tool side effects and no Claude session ID was captured
- **THEN** the runtime refuses automatic replay and marks the job as requiring attention

### Requirement: Terminal job retention is bounded per Codex owner root
The runtime SHALL retain all active jobs and the newest 100 terminal job records per Codex owner root. Cleanup SHALL remove only pruned plugin job records and their default logs, SHALL preserve unread completion metadata, and SHALL never target Claude Code artifacts.

#### Scenario: Owner root exceeds terminal retention
- **WHEN** an owner root has more than 100 terminal jobs
- **THEN** the oldest excess terminal job records and default logs are pruned while all active jobs remain

#### Scenario: Pruned job has an unread completion
- **WHEN** cleanup removes a detailed job record whose completion is still unread
- **THEN** the self-contained completion event remains visible until acknowledged

#### Scenario: Plugin jobs are pruned
- **WHEN** cleanup removes an old plugin job
- **THEN** no Claude Code session artifact under `CLAUDE_CONFIG_DIR` is deleted

### Requirement: Terminal records carry explicit recoverability evidence
Every terminal Agent turn and completion event SHALL record Agent identity and resumability as an explicit classification with the supporting exact Claude session ID or blocking reason.

#### Scenario: Failure lacks safe resume evidence
- **WHEN** the terminal classifier cannot prove exact-session continuation is safe
- **THEN** the Agent becomes errored, its prior valid session pointer is preserved when appropriate, and the completion records the blocking reason

### Requirement: Completion reconciliation is idempotent
The runtime SHALL derive a deterministic completion-event identity from owner and job identity so restart reconciliation cannot publish duplicate terminal notifications.

#### Scenario: Reconciliation runs repeatedly
- **WHEN** multiple processes or restarts scan the same terminal job
- **THEN** at most one completion event exists for that job

### Requirement: Stale active state is reaped conservatively
The runtime SHALL use verified process identity and grace periods to distinguish active workers from orphaned pending, running, or interrupting Agent turns after restart. It SHALL treat legacy cancelling records as diagnostics rather than an active v1 lifecycle.

#### Scenario: Persisted active job has no living owner
- **WHEN** the reaper confirms that the recorded worker and Claude process identities are no longer active after the grace period
- **THEN** it transitions the stale Agent-linked job to an honest terminal failure state with recovery evidence

#### Scenario: New runtime sees a legacy cancelling record
- **WHEN** no verified live process owns the historical record
- **THEN** it is retained for diagnostics or normal bounded cleanup and is not resumed as an active Agent turn

### Requirement: Session leases survive worker boundaries
Session leases SHALL be stored outside individual worker memory and SHALL be released when a current Agent turn becomes completed, failed/errored, or interrupted. Legacy cancelled records SHALL not create new leases.

#### Scenario: Worker exits normally
- **WHEN** its internal job becomes completed, failed, or interrupted
- **THEN** the matching active Claude session lease is released while the durable Agent session binding remains

### Requirement: Agent registry updates are atomic and restart-safe
The runtime SHALL persist Agent records, Agent mailbox entries, and root/name indexes with atomic compare/update semantics and SHALL reconcile them against linked jobs and completion events after restart. Durable internal job receipts are the fact source; Agent and completion records are rebuildable projections.

#### Scenario: Process crashes after job completion
- **WHEN** the job is terminal but the Agent record still says running
- **THEN** reconciliation advances the Agent to the evidence-backed terminal state without changing its stable identity or valid session pointer

### Requirement: Internal and Agent statuses have one explicit mapping
Internal jobs SHALL continue to use execution statuses such as `completed`, `failed`, and `interrupted`, while Agent state SHALL map them deterministically to `completed`, `errored`, and `interrupted`. Removed legacy `cancelling/cancelled` records SHALL be diagnostic-only and SHALL NOT become active Agent states.

#### Scenario: Internal job fails
- **WHEN** an Agent-linked internal job reaches `failed`
- **THEN** reconciliation publishes an `errored` Agent completion with the same failure and resumability evidence

#### Scenario: Legacy cancelled job is scanned
- **WHEN** startup encounters a historical `cancelling` or `cancelled` record
- **THEN** it remains a legacy diagnostic artifact and does not activate or transition an Agent

### Requirement: Agent metadata outlives bounded job receipts
The runtime SHALL retain root-owned Agent identity, Agent mailbox, latest job pointer, and latest validated Claude session pointer independently from the newest-100 terminal-job receipt bucket.

#### Scenario: All detailed jobs for an old Agent are pruned
- **WHEN** the Agent remains in the root registry with a valid Claude session pointer
- **THEN** it remains discoverable and eligible for exact-session follow-up

### Requirement: Legacy job records remain non-destructive diagnostics
Migration SHALL NOT delete existing job records or Claude artifacts, SHALL NOT auto-promote legacy jobs into Agents, and SHALL allow normal bounded job cleanup to remove them later.

#### Scenario: Version 0.2 starts with legacy job files
- **WHEN** the new runtime initializes its Agent registry
- **THEN** it leaves those files intact, excludes them from the Agent API, and can expose them only through explicit diagnostics

### Requirement: Plugin-created Claude session bindings are durable and root-owned
The runtime SHALL persist canonical config/session-to-root/Agent bindings independently from process leases and SHALL require the binding for model-facing exact-session follow-up. Version 0.2 SHALL NOT adopt foreign or Terminal-created sessions.

#### Scenario: Lease is released after a turn
- **WHEN** an Agent turn becomes terminal
- **THEN** the active lease is released while the durable root/Agent binding remains for sequential follow-up

#### Scenario: Bound session is requested by another root
- **WHEN** another trusted root attempts to resume the same Claude session
- **THEN** the runtime rejects it even when no active process lease exists

### Requirement: Linux runtime control state is durable and owner-only
On supported Linux systems, the runtime SHALL persist control state using atomic
replacement and owner-only POSIX modes.

#### Scenario: Linux lifecycle state changes
- **WHEN** an atomic state update is committed on Linux
- **THEN** readers observe either the previous complete record or the new complete record, and state directories/files remain owner-only

### Requirement: Linux completion inbox is atomically persisted per owner root
On supported Linux systems, the runtime SHALL persist Agent-linked completion
events, delivery tokens, and contiguous acknowledgement cursors outside process
memory, keyed by the trusted Codex root thread and protected by owner-only POSIX
modes.

#### Scenario: Linux runtime restarts with unread events
- **WHEN** the owner root invokes the runtime after a Linux process restart
- **THEN** its unread sequence and acknowledgement cursor are recovered without consulting another root

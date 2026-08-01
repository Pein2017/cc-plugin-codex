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
The supervisor SHALL treat Driver-authorized reconnect attempts as one logical job, use bounded backoff, preserve cumulative receipts, and resume only the captured native session when the persisted capability snapshot declares `automaticRecovery=exact_session_transport` and the Driver proves replay safe. No recovery SHALL change Harness, route, Driver version, capability meaning, root owner, Agent, or native session target.

#### Scenario: Transport closes after an exact native session is captured
- **WHEN** the Driver classifies the failure as transport-resumable, its persisted capability snapshot admits exact-session recovery, and retry budget remains
- **THEN** the supervisor permits that Driver to start a bounded reconnect attempt for the same Harness session and route

#### Scenario: Possible side effects occur without exact session evidence
- **WHEN** transport fails after observed or possible side effects and the Driver cannot prove an exact native session target
- **THEN** the runtime refuses automatic replay and marks the job as requiring attention

#### Scenario: Driver does not admit automatic recovery
- **WHEN** a turn's persisted snapshot declares `automaticRecovery=none`
- **THEN** the supervisor publishes the classified terminal failure without asking the Driver or another Harness to replay it

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
Every terminal Agent turn and completion event SHALL record Agent identity, immutable Harness route, Driver version, capability snapshot, and continuation as an explicit classification with the supporting exact native-session reference or blocking reason. Opaque Driver receipts SHALL NOT be the sole evidence used to claim generic resumability.

#### Scenario: Failure lacks safe continuation evidence
- **WHEN** the terminal classifier cannot prove continuation is safe under the persisted Driver capabilities
- **THEN** the Agent becomes errored, its prior valid native-session reference is preserved when appropriate, and the completion records the blocking reason

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
Native-session leases SHALL be stored outside individual worker memory, keyed by canonical `(harnessId, instanceKey, nativeSessionId)`, and bound to the owning root, Agent, and job. They SHALL be released when the current Agent turn becomes completed, failed/errored, or interrupted. Legacy cancelled records SHALL not create new leases.

#### Scenario: Harness worker exits normally
- **WHEN** its internal job becomes completed, failed, or interrupted
- **THEN** the matching active Harness session lease is released while any valid durable Agent session binding remains

#### Scenario: Another Harness uses the same native ID text
- **WHEN** two admitted Harnesses independently report the same native session ID string
- **THEN** their different Harness IDs or instance keys prevent the leases and durable bindings from colliding

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
The runtime SHALL retain root-owned Agent identity, immutable Harness route, accepted Driver contract, Agent mailbox, latest job pointer, and latest validated native-session reference independently from the newest-100 terminal-job receipt bucket.

#### Scenario: All detailed jobs for an old Agent are pruned
- **WHEN** the Agent remains in the root registry with continuation evidence valid under its persisted Driver capabilities
- **THEN** it remains discoverable and eligible for that exact capability-valid continuation path

### Requirement: Legacy job records remain non-destructive diagnostics
Migration SHALL NOT delete existing job records or Claude artifacts, SHALL NOT auto-promote legacy jobs into Agents, and SHALL allow normal bounded job cleanup to remove them later.

#### Scenario: Version 0.2 starts with legacy job files
- **WHEN** the new runtime initializes its Agent registry
- **THEN** it leaves those files intact, excludes them from the Agent API, and can expose them only through explicit diagnostics

### Requirement: Plugin-created Claude session bindings are durable and root-owned
Version-1 Claude session bindings SHALL retain their existing canonical config/session ownership. Version-2 native-session bindings SHALL persist canonical `(harnessId, instanceKey, nativeSessionId)` ownership independently from process leases and SHALL require that binding for model-facing exact-session continuation. No version SHALL adopt foreign or Terminal-created sessions through the Agent API.

#### Scenario: Lease is released after a v2 turn
- **WHEN** an Agent turn becomes terminal
- **THEN** the active Harness lease is released while the durable root/Agent native-session binding remains for any supported sequential continuation

#### Scenario: Bound native session is requested by another root
- **WHEN** another trusted root attempts to resume the same Harness session reference
- **THEN** the runtime rejects it even when no active process lease exists

#### Scenario: Version 1 binding is loaded
- **WHEN** the v2 runtime encounters an existing valid Claude config/session binding
- **THEN** it preserves that binding and interprets it as the equivalent Claude Code Harness session without expanding ownership

### Requirement: Harness-neutral state migration preserves active ownership
The v2 runtime SHALL interpret valid v1 Agent, job, session-binding, and lease records as Claude Code state. It MAY normalize terminal unowned v1 state on its next safe write, but SHALL NOT rewrite, lease, resume, signal, or steal an active or ownership-uncertain v1 record from its existing worker. New Agents SHALL be written only as v2 after mixed-state verification is enabled. A v1-only runtime SHALL reject v2 Agents and SHALL be unable to claim the v2 job queue state. Version-2 Claude session bindings and leases SHALL remain wire-readable by v1 so old processes observe existing root/Agent/session ownership rather than stealing a live native session.

#### Scenario: Active version 1 worker exists during hot update
- **WHEN** a v2 process observes a v1 job with verified live ownership or unresolved ownership
- **THEN** it leaves that record and its lease under the existing worker until terminal reconciliation provides a safe transition

#### Scenario: Terminal version 1 Agent receives a safe follow-up
- **WHEN** a valid nonresident v1 Claude Agent is resumed by the v2 runtime
- **THEN** the runtime preserves its root, Agent, config/session binding, route meaning, mailbox order, and exact-session semantics while writing the new activation in the v2 schema

#### Scenario: Old worker sees a version 2 job
- **WHEN** a runtime without Harness support encounters a v2 job prepared for detached execution
- **THEN** the job's versioned queue status is not the literal v1 `queued` state, so the old worker refuses it before claiming or launching a native process

#### Scenario: Old runtime sees a version 2 Agent
- **WHEN** a runtime without v2 Agent support reads the Agent registry
- **THEN** it rejects the unknown Agent record version rather than activating or rewriting it

#### Scenario: Old runtime observes a version 2 Claude binding or lease
- **WHEN** a v1 process reaches the byte-compatible Claude session ownership key
- **THEN** it can observe the existing root, Agent, job, and workspace ownership fields and does not treat the native session as unbound, while it still cannot activate the v2 Agent or claim the v2 job

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

### Requirement: Operator storage diagnosis does not trigger lifecycle repair
Storage diagnosis SHALL inspect Plugin-owned files as metadata and bounded control records without calling reconciliation, stale-job reaping, completion acknowledgement, registry mutation, retention cleanup, or session-lease code. It SHALL report malformed records separately and leave every file unchanged.

#### Scenario: A stale active job record exists
- **WHEN** doctor scans a job whose process is no longer live
- **THEN** it reports the stored status as inventory and does not transition the job

#### Scenario: Unread completion exists
- **WHEN** doctor scans an inbox with events beyond its acknowledgement cursor
- **THEN** it reports the unread count without freezing delivery payloads or advancing the cursor

### Requirement: Cleanup candidates are conservative and dry-run only
Storage diagnosis SHALL classify cleanup candidates without deleting them. Candidate paths SHALL remain within the Plugin data root and SHALL be limited to stale atomic temporary files, stale reservation files, and terminal Plugin jobs beyond the newest 100 records per owner bucket. Active jobs, Agent registries, completion inboxes, session bindings, and all paths under `CLAUDE_CONFIG_DIR` SHALL be excluded.

#### Scenario: Candidate path escapes Plugin data root
- **WHEN** a discovered path does not canonicalize beneath the Plugin data root
- **THEN** it is excluded and reported as a diagnostic boundary failure

#### Scenario: Active job is old
- **WHEN** an active job record exceeds an age threshold
- **THEN** it remains inventory only and is not classified as a cleanup candidate

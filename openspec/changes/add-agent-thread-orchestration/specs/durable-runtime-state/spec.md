## ADDED Requirements

### Requirement: Agent registry updates are atomic and restart-safe
The runtime SHALL persist Agent records and root/name indexes with atomic compare/update semantics and SHALL reconcile them against linked jobs and completion events after restart.

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
The runtime SHALL retain root-owned Agent identity and latest validated Claude session pointer independently from the newest-100 terminal-job receipt bucket.

#### Scenario: All detailed jobs for an old Agent are pruned
- **WHEN** the Agent remains in the root registry with a valid Claude session pointer
- **THEN** it remains discoverable and eligible for exact-session follow-up

### Requirement: Legacy job records remain non-destructive diagnostics
Migration SHALL NOT delete existing job records or Claude artifacts, SHALL NOT auto-promote legacy jobs into Agents, and SHALL allow normal bounded job cleanup to remove them later.

#### Scenario: Version 0.2 starts with legacy job files
- **WHEN** the new runtime initializes its Agent registry
- **THEN** it leaves those files intact, excludes them from the Agent API, and can expose them only through explicit diagnostics

### Requirement: Claude session bindings are durable and root-owned
The runtime SHALL persist canonical config/session-to-root/Agent bindings independently from process leases and SHALL require the binding for model-facing exact-session follow-up.

#### Scenario: Lease is released after a turn
- **WHEN** an Agent turn becomes terminal
- **THEN** the active lease is released while the durable root/Agent binding remains for sequential follow-up

#### Scenario: Bound session is requested by another root
- **WHEN** another trusted root attempts to resume the same Claude session
- **THEN** the runtime rejects it even when no active process lease exists

## MODIFIED Requirements

### Requirement: Completion inbox state is atomically persisted per owner root
The runtime SHALL persist Agent-linked completion events, delivery tokens, and contiguous acknowledgement cursors outside process memory, keyed by the trusted Codex root thread, with atomic updates and the platform-appropriate protection established by hardening.

#### Scenario: Runtime restarts with unread Agent events
- **WHEN** the owner root invokes the runtime after process restart
- **THEN** its unread Agent completion sequence and acknowledgement cursor are recovered without consulting another root

### Requirement: Terminal records carry explicit recoverability evidence
Every terminal Agent turn and completion event SHALL record Agent identity and resumability as an explicit classification with the supporting exact Claude session ID or blocking reason.

#### Scenario: Errored turn lacks safe resume evidence
- **WHEN** the terminal classifier cannot prove exact-session continuation is safe
- **THEN** the Agent becomes errored, its prior valid session pointer is preserved when appropriate, and the completion records the blocking reason

### Requirement: Stale active state is reaped conservatively
The runtime SHALL use verified process identity and grace periods to distinguish active workers from orphaned pending, running, or interrupting Agent turns after restart. It SHALL treat legacy cancelling records as diagnostics rather than an active v1 lifecycle.

#### Scenario: New runtime sees a legacy cancelling record
- **WHEN** no verified live process owns the historical record
- **THEN** it is retained for diagnostics or normal bounded cleanup and is not resumed as an active Agent turn

### Requirement: Session leases survive worker boundaries
Session leases SHALL be stored outside individual worker memory and SHALL be released when a current Agent turn becomes completed, failed/errored, or interrupted. Legacy cancelled records SHALL not create new leases.

#### Scenario: Agent turn exits
- **WHEN** its internal job becomes completed, failed, or interrupted
- **THEN** the matching active Claude session lease is released while the durable Agent session binding remains

## ADDED Requirements

### Requirement: Completion inbox state is atomically persisted per owner root
The runtime SHALL persist completion events, delivery tokens, and acknowledgement cursors outside process memory, keyed by the trusted Codex owner root, with atomic updates. On POSIX it SHALL request owner-only modes; on native Windows it SHALL use or verify a user-scoped ACL/storage boundary and SHALL report rather than overclaim protection it cannot establish.

#### Scenario: Runtime restarts with unread events
- **WHEN** the owner root invokes the runtime after process restart
- **THEN** its unread completion sequence and acknowledgement cursor are recovered without consulting another root

#### Scenario: Native Windows state protection is checked
- **WHEN** state storage is initialized on native Windows
- **THEN** the runtime verifies or records the effective user-scoped protection instead of treating POSIX mode bits as proof

### Requirement: Terminal records carry explicit recoverability evidence
Every terminal job and completion event SHALL record resumability as an explicit classification with the supporting Claude session ID or blocking reason.

#### Scenario: Failure lacks safe resume evidence
- **WHEN** the terminal classifier cannot prove exact-session continuation is safe
- **THEN** the persisted receipt marks the job non-resumable and records why

### Requirement: Completion reconciliation is idempotent
The runtime SHALL derive a deterministic completion-event identity from owner and job identity so restart reconciliation cannot publish duplicate terminal notifications.

#### Scenario: Reconciliation runs repeatedly
- **WHEN** multiple processes or restarts scan the same terminal job
- **THEN** at most one completion event exists for that job

## MODIFIED Requirements

### Requirement: Runtime control state is durable and atomic
The hardened runtime SHALL persist control state using atomic replacement and a verified user-scoped storage boundary appropriate to the platform. It SHALL use owner-only modes on POSIX and SHALL verify or honestly report the effective native-Windows ACL boundary.

#### Scenario: Lifecycle state changes
- **WHEN** an atomic state update is committed
- **THEN** readers observe either the previous complete record or the new complete record and not a partially written file

#### Scenario: Native Windows storage initializes
- **WHEN** the runtime cannot verify a user-scoped ACL boundary
- **THEN** readiness reports the limitation instead of claiming owner-only protection from POSIX mode bits

### Requirement: Process control records identity with known internal PID-only fallbacks
The hardened runtime SHALL require a matching deterministic process identity for every signal, termination, and liveness-ownership decision, including session-conflict cleanup and stale-state reaping. It SHALL refuse a raw PID when identity is missing or mismatched.

#### Scenario: Internal conflict cleanup lacks identity
- **WHEN** session-conflict cleanup has a PID but no verified process identity
- **THEN** it refuses to signal the PID, marks the job for attention, and records the missing identity

#### Scenario: Reaper sees PID without identity
- **WHEN** stale-job reaping has only a raw PID
- **THEN** it does not treat that PID as proof of ownership or liveness

#### Scenario: PID identity matches
- **WHEN** process control has a live PID and its deterministic identity matches the stored receipt
- **THEN** the requested platform-appropriate signal or termination may proceed

### Requirement: Terminal job retention is bounded per Codex owner session
The runtime SHALL retain all active jobs and the newest 100 terminal job records per Codex owner session. Cleanup SHALL remove only pruned plugin job records and their default logs, SHALL preserve unread completion metadata, and SHALL never target Claude Code artifacts.

#### Scenario: Owner session exceeds terminal retention
- **WHEN** an owner session has more than 100 terminal jobs
- **THEN** the oldest excess terminal job records and default logs are pruned while all active jobs remain

#### Scenario: Pruned job has an unread completion
- **WHEN** cleanup removes a detailed job record whose completion is still unread
- **THEN** the self-contained completion event remains visible until acknowledged

#### Scenario: Plugin jobs are pruned
- **WHEN** cleanup removes an old plugin job
- **THEN** no Claude Code session artifact under `CLAUDE_CONFIG_DIR` is deleted

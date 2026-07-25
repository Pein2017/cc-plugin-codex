## ADDED Requirements

### Requirement: Runtime control state is durable and atomic
The runtime SHALL persist job state, process identities, session identity, attempts, partial output, receipts, and steering mailbox state using atomic replacement. It SHALL request owner-only POSIX modes where supported; the baseline does not claim that those mode bits prove restrictive native-Windows ACLs.

#### Scenario: A job update is committed
- **WHEN** lifecycle state changes
- **THEN** readers observe either the previous complete record or the new complete record and not a partially written file

#### Scenario: Baseline runs on native Windows
- **WHEN** files are created with POSIX-style mode options
- **THEN** atomicity remains required but effective ACL restriction is treated as unverified baseline evidence

### Requirement: Process control records identity with known internal PID-only fallbacks
The runtime SHALL record deterministic worker and Claude process identities. User-facing interrupt and cancellation SHALL refuse a missing or mismatched identity, while the baseline internal session-conflict cleanup and stale-job liveness paths MAY fall back to a raw PID; those fallbacks are explicit baseline limitations scheduled for hardening.

#### Scenario: PID has been reused
- **WHEN** an interrupt or cancellation target has a different process identity from the stored job
- **THEN** the runtime refuses to signal that process and records the control failure

#### Scenario: Internal conflict cleanup lacks identity
- **WHEN** session-conflict cleanup has a Claude PID but no process identity
- **THEN** the baseline may attempt PID-only termination and the hardening evidence records this path for removal

#### Scenario: Reaper sees PID without identity
- **WHEN** stale-job reaping has only a recorded PID
- **THEN** the baseline may treat raw PID liveness as ownership and the hardening evidence records this ambiguity

### Requirement: Transport recovery is bounded and exact-session
The supervisor SHALL treat reconnect attempts as one logical job, use bounded backoff, preserve cumulative receipts, and resume only the captured Claude session when automatic replay is safe.

#### Scenario: Transport closes after a session ID is captured
- **WHEN** the failure is classified as transport-resumable and retry budget remains
- **THEN** the supervisor starts a bounded reconnect attempt with `--resume` for that exact session

#### Scenario: Possible side effects occur without a session ID
- **WHEN** transport fails after write mode or observed tool side effects and no Claude session ID was captured
- **THEN** the runtime refuses automatic replay and marks the job as requiring attention

### Requirement: Terminal job retention is bounded per Codex owner session
The runtime SHALL retain all active jobs and the newest 100 terminal job records per Codex owner session. Cleanup SHALL remove only pruned plugin job records and their default logs.

#### Scenario: Owner session exceeds terminal retention
- **WHEN** an owner session has more than 100 terminal jobs
- **THEN** the oldest excess terminal job records and default logs are pruned while all active jobs remain

#### Scenario: Plugin jobs are pruned
- **WHEN** cleanup removes an old plugin job
- **THEN** no Claude Code session artifact under `CLAUDE_CONFIG_DIR` is deleted

### Requirement: Stale active state is reaped conservatively
The runtime SHALL use recorded process identity and grace periods to distinguish active workers from orphaned queued, running, interrupting, or cancelling jobs after restart.

#### Scenario: Persisted active job has no living owner
- **WHEN** the reaper confirms that the recorded worker and Claude process identities are no longer active after the grace period
- **THEN** it transitions the stale job to an honest terminal failure state with recovery evidence

### Requirement: Session leases survive worker boundaries
Session leases SHALL be stored outside individual worker memory and SHALL be released when a job reaches a terminal state.

#### Scenario: Worker exits normally
- **WHEN** its job completes, fails, is interrupted, or is cancelled
- **THEN** the matching Claude session lease is released for sequential follow-up

# tracked-job-control Specification

## Purpose

Define the baseline public lifecycle of durable Claude jobs and their owner-scoped control surface.

## Requirements

### Requirement: Background work has a stable job identity
Starting a tracked Claude task SHALL create a durable job ID before background execution and SHALL return that identity to the caller.

#### Scenario: Background task is accepted
- **WHEN** a valid task passes readiness and session-lease checks
- **THEN** the runtime persists a queued job and returns its stable job ID before the worker completes

### Requirement: Active jobs accept ordered durable steering
An active job SHALL accept steering messages in monotonically ordered durable mailbox entries and SHALL track dispatch and acknowledgement separately.

#### Scenario: Steering arrives during an active attempt
- **WHEN** a steering message is queued while Claude's stream-json stdin remains writable
- **THEN** the worker sends it in sequence and records dispatch and acknowledgement receipts

#### Scenario: Steering window has closed
- **WHEN** the job is terminal or no longer accepts steering
- **THEN** the runtime rejects live steering and directs resumable continuation through follow-up

### Requirement: Follow-up creates a new tracked job on the exact Claude session
Following up SHALL create a new parent-linked job only when the terminal receipt explicitly classifies the source as resumable and provides an owner-valid exact Claude session ID.

#### Scenario: Completed job receives a follow-up
- **WHEN** a completed job has an owner-valid exact Claude session ID
- **THEN** a new child job is created with that session as its resume target

#### Scenario: Interrupted job receives a follow-up
- **WHEN** an interrupted job preserved partial output and an owner-valid exact Claude session ID
- **THEN** a new child job resumes that session with the interruption evidence available

#### Scenario: Explicitly resumable failure receives a follow-up
- **WHEN** a failed job's classifier and durable receipt explicitly mark it resumable with an exact session ID
- **THEN** a new child job may resume that session

#### Scenario: Unproven failure receives a follow-up
- **WHEN** a failed job has a session ID but its durable receipt does not explicitly prove resumability
- **THEN** follow-up is rejected with the blocking failure evidence

#### Scenario: Cancelled job receives a follow-up
- **WHEN** a cancelled job is selected
- **THEN** follow-up is rejected because cancellation is destructive and non-resumable

### Requirement: Interruption and cancellation have distinct meanings
Interruption SHALL request graceful termination while preserving partial output and resumable session identity. Cancellation SHALL destructively terminate active work and mark it cancelled.

#### Scenario: Running job is interrupted
- **WHEN** graceful interruption succeeds
- **THEN** the job becomes interrupted with its partial output and Claude session ID preserved

#### Scenario: Running job is cancelled
- **WHEN** destructive cancellation succeeds against a verified process identity
- **THEN** the job becomes cancelled and its active process ownership is cleared

### Requirement: One canonical owner root identity scopes orchestration
Normal plugin execution SHALL receive one non-empty immutable `ownerRootId` from the Codex bootstrap/host boundary. This identity is a logical default-isolation boundary that prevents accidental cross-root orchestration; it is not a cryptographic authorization claim. Model-facing skills and commands SHALL NOT accept an owner override. A legacy `job.sessionId` equal to the current root SHALL be upgraded without changing its value; foreign legacy values SHALL remain operator-visible only.

#### Scenario: Trusted bootstrap launches the runtime
- **WHEN** the Codex plugin bootstrap invokes a lifecycle operation
- **THEN** it injects the host's canonical thread identity as immutable `ownerRootId` for lookup, retention, inbox, and later Agent ownership

#### Scenario: Model-facing caller supplies an owner override
- **WHEN** a skill or normal lifecycle command includes an owner-root argument or override
- **THEN** the runtime rejects it before reading or mutating root-owned state

### Requirement: Direct job operations require owner-root matching
Normal status, result, steering, follow-up, interrupt, cancellation, wait, and completion acknowledgement operations SHALL resolve the target within the caller's non-empty `ownerRootId`.

#### Scenario: Caller knows another root's job ID
- **WHEN** a normal operation references a job owned by another Codex root
- **THEN** the runtime reports no matching job in the caller's logical root scope and performs no mutation

#### Scenario: Owner identity is missing
- **WHEN** a normal plugin lifecycle operation is invoked without an injected `ownerRootId`
- **THEN** it fails closed instead of falling back to workspace-global authority

### Requirement: Job status is owner-scoped by default
Model-facing job enumeration and direct lookup SHALL show only jobs whose `ownerRootId` matches the current root and SHALL NOT accept an all-sessions option. A separate operator diagnostic CLI MAY enumerate redacted jobs across owner roots in the same workspace without granting mutation rights.

#### Scenario: Default status is requested
- **WHEN** the model-facing runtime lists jobs or resolves a job ID
- **THEN** jobs owned by other Codex roots are omitted

#### Scenario: Diagnostic all-sessions status is requested
- **WHEN** the operator diagnostic CLI explicitly requests all sessions
- **THEN** redacted jobs from every owner root in the workspace are included for read-only debugging

### Requirement: Cross-owner diagnostics are explicit and read-only
The runtime SHALL retain an explicit all-roots diagnostic listing path in a separate operator-only CLI. Model-facing skills SHALL NOT expose `--all`, and the operator path SHALL NOT grant cross-owner mutation or inbox acknowledgement.

#### Scenario: Debugger attempts cross-owner mutation
- **WHEN** a caller uses a discovered foreign job ID with a normal mutation
- **THEN** owner-root matching still rejects the operation

### Requirement: Results expose durable job evidence
Status and result operations SHALL expose job state, partial or final output, Claude session identity, attempts, steering receipts, runtime receipts, and attention requirements that have been persisted for the selected job.

#### Scenario: A completed result is requested
- **WHEN** a retained completed job is selected
- **THEN** its terminal result and associated durable receipts are returned without rerunning Claude

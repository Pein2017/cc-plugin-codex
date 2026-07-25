## ADDED Requirements

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
Following up on a resumable terminal job SHALL create a new job linked to its parent and SHALL resume the recorded Claude session.

#### Scenario: Completed job receives a follow-up
- **WHEN** the completed job has a valid Claude session ID
- **THEN** a new child job is created with that session as its resume target

### Requirement: Interruption and cancellation have distinct meanings
Interruption SHALL request graceful termination while preserving partial output and resumable session identity. Cancellation SHALL destructively terminate active work and mark it cancelled.

#### Scenario: Running job is interrupted
- **WHEN** graceful interruption succeeds
- **THEN** the job becomes interrupted with its partial output and Claude session ID preserved

#### Scenario: Running job is cancelled
- **WHEN** destructive cancellation succeeds against a verified process identity
- **THEN** the job becomes cancelled and its active process ownership is cleared

### Requirement: Job status is owner-scoped by default
Job enumeration without an explicit all-sessions option SHALL show only jobs whose Codex owner session matches the caller. An explicit all-sessions diagnostic option SHALL enumerate jobs across owner sessions in the same workspace.

#### Scenario: Default status is requested
- **WHEN** a runtime with an owner session lists job status
- **THEN** jobs owned by other Codex sessions are omitted

#### Scenario: Diagnostic all-sessions status is requested
- **WHEN** the caller explicitly requests all sessions
- **THEN** jobs from every owner session in the workspace are included

### Requirement: Results expose durable job evidence
Status and result operations SHALL expose job state, partial or final output, Claude session identity, attempts, steering receipts, runtime receipts, and attention requirements that have been persisted for the selected job.

#### Scenario: A completed result is requested
- **WHEN** a retained completed job is selected
- **THEN** its terminal result and associated durable receipts are returned without rerunning Claude

## ADDED Requirements

### Requirement: One canonical owner root identity scopes orchestration
Normal plugin execution SHALL receive one non-empty immutable `ownerRootId` from the trusted Codex bootstrap/host boundary. Model-facing skills and commands SHALL NOT accept an owner override. `CC_OWNER_SESSION_ID` or an explicit owner MAY be accepted only by a separate operator/test harness. A legacy `job.sessionId` equal to the trusted current root SHALL be upgraded without changing its value; foreign legacy values SHALL remain operator-visible only.

#### Scenario: Trusted bootstrap launches the runtime
- **WHEN** the Codex plugin bootstrap invokes a lifecycle operation
- **THEN** it injects the host's canonical thread identity as immutable `ownerRootId` for lookup, retention, inbox, and later Agent ownership

#### Scenario: Model-facing caller supplies an owner override
- **WHEN** a skill or normal lifecycle command includes an owner-root argument or override
- **THEN** the runtime rejects it before reading or mutating root-owned state

#### Scenario: Matching legacy job is read
- **WHEN** a retained job has `sessionId` equal to the trusted root but no `ownerRootId`
- **THEN** the runtime persists that same value as `ownerRootId` on the next atomic update

#### Scenario: Foreign legacy job is encountered
- **WHEN** a retained legacy `sessionId` differs from the trusted root
- **THEN** normal operations omit it and only the operator diagnostic path may inspect it

### Requirement: Direct job operations require owner authorization
Normal status, result, steering, follow-up, interrupt, cancellation, wait, and completion acknowledgement operations SHALL resolve the target within the caller's non-empty `ownerRootId`.

#### Scenario: Caller knows another root's job ID
- **WHEN** a normal operation references a job owned by another Codex root
- **THEN** the runtime reports no authorized matching job and performs no mutation

#### Scenario: Owner identity is missing
- **WHEN** a normal plugin lifecycle operation is invoked without an injected trusted `ownerRootId`
- **THEN** it fails closed instead of falling back to workspace-global authority

### Requirement: Cross-owner diagnostics are explicit and read-only
The runtime SHALL retain an explicit all-sessions diagnostic listing path in a separate operator-only CLI for the current workspace. Model-facing skills SHALL NOT expose `--all`, and the operator path SHALL NOT grant cross-owner mutation or inbox acknowledgement.

#### Scenario: Debugger requests all jobs
- **WHEN** `--all` is explicitly supplied to the operator diagnostic CLI
- **THEN** redacted job metadata across owner roots is returned

#### Scenario: Debugger attempts cross-owner mutation
- **WHEN** a caller uses a discovered foreign job ID with a normal mutation
- **THEN** trusted-root scoping still rejects the operation

## MODIFIED Requirements

### Requirement: Job status is owner-scoped by default
Model-facing job enumeration and direct lookup SHALL show only jobs whose `ownerRootId` matches the trusted current root and SHALL NOT accept an all-sessions option. A separate operator diagnostic CLI MAY enumerate redacted jobs across owner roots in the same workspace without granting mutation rights.

#### Scenario: Default status is requested
- **WHEN** the model-facing runtime lists jobs or resolves a job ID
- **THEN** jobs owned by other Codex sessions are omitted

#### Scenario: Diagnostic all-sessions status is requested
- **WHEN** the operator diagnostic CLI explicitly requests all sessions
- **THEN** jobs from every owner root in the workspace are included for read-only debugging

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

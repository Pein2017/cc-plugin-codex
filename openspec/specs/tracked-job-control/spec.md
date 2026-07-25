# tracked-job-control Specification

## Purpose

Define the baseline public lifecycle of durable Claude jobs and their owner-scoped control surface.
## Requirements
### Requirement: One canonical owner root identity scopes orchestration
Normal plugin execution SHALL receive one non-empty immutable `ownerRootId` from the Codex bootstrap/host boundary. This identity is a logical default-isolation boundary that prevents accidental cross-root orchestration; it is not a cryptographic authorization claim. Model-facing skills and commands SHALL NOT accept an owner override. A legacy `job.sessionId` equal to the current root SHALL be upgraded without changing its value; foreign legacy values SHALL remain operator-visible only.

#### Scenario: Trusted bootstrap launches the runtime
- **WHEN** the Codex plugin bootstrap invokes a lifecycle operation
- **THEN** it injects the host's canonical thread identity as immutable `ownerRootId` for lookup, retention, inbox, and later Agent ownership

#### Scenario: Model-facing caller supplies an owner override
- **WHEN** a skill or normal lifecycle command includes an owner-root argument or override
- **THEN** the runtime rejects it before reading or mutating root-owned state

### Requirement: Jobs are internal Agent turn receipts
Tracked jobs SHALL remain internal execution records linked to one Agent and SHALL NOT be the model-facing orchestration identity.

#### Scenario: Agent starts a later turn
- **WHEN** `followup_task` activates a terminal Agent
- **THEN** a new internal job is linked to the same Agent while callers continue addressing the stable Agent path or ID

### Requirement: Internal process termination is not public cancellation
The runtime MAY use identity-verified bounded process-tree termination to implement interruption or stale-worker cleanup, but SHALL default forced termination to errored/non-resumable unless platform-specific evidence proves safe resume. It SHALL NOT expose destructive cancellation as a public lifecycle operation.

#### Scenario: Graceful signal is unavailable
- **WHEN** an active turn must stop on a platform without portable graceful SIGINT
- **THEN** bounded internal termination stops the process and produces errored/non-resumable state unless the durable platform receipt proves safe interruption

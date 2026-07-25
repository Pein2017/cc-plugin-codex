## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Direct job operations require owner-root matching
**Reason**: Job operations are no longer model-facing; owner authorization moves to stable Agent operations.

**Migration**: Address the Agent through the canonical six-operation surface. Internal jobs remain implementation receipts.

#### Scenario: Legacy direct job operation is invoked
- **WHEN** a caller uses a job ID with a removed status, result, steer, follow-up, interrupt, cancellation, or wait operation
- **THEN** the public runtime rejects it rather than bypassing Agent ownership

### Requirement: Cross-owner diagnostics are explicit and read-only
**Reason**: Cross-root diagnosis moves from public job enumeration to a separate operator Agent diagnostic; no model-facing job or all-roots diagnostic remains.

**Migration**: Use the operator `list-agents --all` CLI for redacted Agent diagnosis and checkout-local offline evidence for legacy job records.

#### Scenario: Legacy job all diagnostic is invoked
- **WHEN** a caller requests the removed job-level `--all` status path
- **THEN** the public runtime rejects it and does not alias it to Agent listing

### Requirement: Background work has a stable job identity
**Reason**: Stable public identity moves from an individual job to the Agent Thread that owns multiple turns.

**Migration**: Use `spawn_agent` and retain the returned Agent ID/path; internal job IDs remain diagnostic receipts only.

#### Scenario: Legacy caller starts a job
- **WHEN** the old public start/run operation is invoked
- **THEN** it is rejected as removed rather than returning a public job identity

### Requirement: Active jobs accept ordered durable steering
**Reason**: Public message delivery is split into canonical `send_message` and `followup_task` semantics.

**Migration**: Use `send_message` for non-activating delivery or `followup_task` when an idle Agent must run.

#### Scenario: Legacy steer is invoked
- **WHEN** the old steer operation is called
- **THEN** it is rejected without a compatibility alias

### Requirement: Follow-up creates a new tracked job on the exact Claude session
**Reason**: Exact-session follow-up is now expressed through the stable Agent identity, while job creation remains internal.

**Migration**: Use `followup_task(agent, message)`.

#### Scenario: Legacy job follow-up is invoked
- **WHEN** a caller supplies only an old job ID to the removed follow-up operation
- **THEN** the runtime rejects the old API and does not auto-promote the job into an Agent

### Requirement: Interruption and cancellation have distinct meanings
**Reason**: Canonical Agent orchestration retains interruption but removes public destructive cancellation.

**Migration**: Use `interrupt_agent`; internal cleanup owns any required process-tree termination.

#### Scenario: Legacy cancel is invoked
- **WHEN** a caller invokes the old cancellation operation
- **THEN** the runtime reports that cancellation was removed and performs no destructive action

### Requirement: Job status is owner-scoped by default
**Reason**: Public discovery moves to trusted-root `list_agents`; explicit cross-root diagnosis is operator-only.

**Migration**: Use `list_agents` for logical state and unread completion summaries.

#### Scenario: Legacy status is invoked
- **WHEN** the old public status operation is called
- **THEN** it is rejected without delegating to `list_agents`

### Requirement: Results expose durable job evidence
**Reason**: Public completion delivery moves to `wait_agent` and `list_agents`; job evidence remains internal and diagnostic.

**Migration**: Use `wait_agent` for completion or `list_agents` for unread results.

#### Scenario: Legacy result is invoked
- **WHEN** the old public result operation is called
- **THEN** it is rejected without a compatibility adapter

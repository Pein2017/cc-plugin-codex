# tracked-job-control Specification

## Purpose

Define the baseline public lifecycle of durable Claude jobs and their owner-scoped control surface.
## Requirements
### Requirement: One canonical owner root identity scopes orchestration
Normal plugin execution SHALL receive one non-empty immutable `ownerRootId` from the Codex bootstrap/host boundary. This identity is a logical default-isolation boundary that prevents accidental cross-root orchestration; it is not a cryptographic authorization claim. Model-facing skills and commands SHALL NOT accept an owner override. Normal lookup and lifecycle reconciliation SHALL filter raw durable records to the current owner before stale reaping, completion publication, Agent-session binding, retention, or projection mutation. A legacy `job.sessionId` equal to the current root SHALL be upgraded without changing its value; foreign legacy values SHALL remain operator-visible only. Explicit workspace-wide worker maintenance MAY reconcile all roots, but SHALL remain separate from model-facing lifecycle operations.

#### Scenario: Trusted bootstrap launches the runtime
- **WHEN** the Codex plugin bootstrap invokes a lifecycle operation
- **THEN** it injects the host's canonical thread identity as immutable `ownerRootId` for lookup, retention, inbox, and later Agent ownership

#### Scenario: Model-facing caller supplies an owner override
- **WHEN** a skill or normal lifecycle command includes an owner-root argument or override
- **THEN** the runtime rejects it before reading or mutating root-owned state

#### Scenario: Current-root reconciliation encounters a foreign terminal or stale job
- **WHEN** root A invokes a normal list, wait, status, or interruption lookup while root B has a repairable job in the shared workspace store
- **THEN** root A does not reap, bind, publish, project, or otherwise mutate root B's job, completion inbox, session binding, or Agent registry

#### Scenario: Foreign owner later invokes reconciliation
- **WHEN** root B next invokes a normal lifecycle operation for its own repairable job
- **THEN** root B performs its own stale recovery, completion publication, session binding, and Agent projection under the existing lifecycle rules

#### Scenario: Explicit global worker maintenance runs
- **WHEN** the trusted worker cleanup path reconciles the shared workspace
- **THEN** it may repair all roots before applying owner-bucketed retention without exposing a model-facing owner override

### Requirement: Jobs are internal Agent turn receipts
Tracked jobs SHALL remain internal execution records linked to one Agent and SHALL NOT be the model-facing orchestration identity. A terminal receipt that retains `preClaudeLaunch=true` SHALL be treated as a non-turn activation diagnostic until Agent recovery is durably projected; it SHALL NOT bind a Claude session or publish Agent completion.

#### Scenario: Agent starts a later turn
- **WHEN** `followup_task` activates a terminal Agent
- **THEN** a new internal job is linked to the same Agent while callers continue addressing the stable Agent path or ID

#### Scenario: Activation terminates before Claude launch
- **WHEN** an attached job becomes terminal while `preClaudeLaunch=true`
- **THEN** the receipt remains diagnostic evidence and is excluded from session binding and completion publication until dedicated recovery marks it projected

### Requirement: Internal process termination is not public cancellation
The runtime MAY use identity-verified bounded process-tree termination to implement interruption or stale-worker cleanup, but SHALL default forced termination to errored/non-resumable unless platform-specific evidence proves safe resume. It SHALL NOT expose destructive cancellation as a public lifecycle operation.

#### Scenario: Graceful signal is unavailable
- **WHEN** an active turn must stop on a platform without portable graceful SIGINT
- **THEN** bounded internal termination stops the process and produces errored/non-resumable state unless the durable platform receipt proves safe interruption

### Requirement: Durable Claude child evidence gates turn execution
A prepared or running job SHALL retain `preClaudeLaunch=true` until a valid Claude child PID identity is atomically accepted for that exact active job. The adapter SHALL perform this acceptance before writing any initial prompt bytes, starting an input pump, or invoking a hook that can expose the task to Claude. A rejected, throwing, or identity-less acceptance SHALL terminate the child without writing the prompt. Clearing the marker SHALL conservatively end safe-fresh replay eligibility even if a later receipt does not prove a prompt write.

#### Scenario: Claude child is accepted
- **WHEN** the spawned child has valid PID identity and the active-job compare-and-swap accepts it
- **THEN** the same durable transition records the child evidence, clears `preClaudeLaunch` and safe-fresh retry, and only then permits prompt delivery

#### Scenario: Claude child acceptance is rejected
- **WHEN** the job no longer owns the activation, PID identity is missing, or the acceptance callback rejects or throws
- **THEN** zero prompt bytes are written, the child is terminated, and the durable job retains its pre-Claude marker

#### Scenario: Crash follows accepted child evidence
- **WHEN** the launch receipt was durably accepted but the runtime crashes before proving a prompt write
- **THEN** recovery treats the job as potentially executed and does not safe-fresh replay it

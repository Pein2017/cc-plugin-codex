## MODIFIED Requirements

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

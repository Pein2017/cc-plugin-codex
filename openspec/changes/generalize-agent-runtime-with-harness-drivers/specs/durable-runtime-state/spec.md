## MODIFIED Requirements

### Requirement: Transport recovery is bounded and exact-session
The supervisor SHALL treat Driver-authorized reconnect attempts as one logical job, use bounded backoff, preserve cumulative receipts, and resume only the captured native session when the persisted capability snapshot declares `automaticRecovery=exact_session_transport` and the Driver proves replay safe. No recovery SHALL change Harness, route, Driver version, capability meaning, root owner, Agent, or native session target.

#### Scenario: Transport closes after an exact native session is captured
- **WHEN** the Driver classifies the failure as transport-resumable, its persisted capability snapshot admits exact-session recovery, and retry budget remains
- **THEN** the supervisor permits that Driver to start a bounded reconnect attempt for the same Harness session and route

#### Scenario: Possible side effects occur without exact session evidence
- **WHEN** transport fails after observed or possible side effects and the Driver cannot prove an exact native session target
- **THEN** the runtime refuses automatic replay and marks the job as requiring attention

#### Scenario: Driver does not admit automatic recovery
- **WHEN** a turn's persisted snapshot declares `automaticRecovery=none`
- **THEN** the supervisor publishes the classified terminal failure without asking the Driver or another Harness to replay it

### Requirement: Terminal records carry explicit recoverability evidence
Every terminal Agent turn and completion event SHALL record Agent identity, immutable Harness route, Driver version, capability snapshot, and continuation as an explicit classification with the supporting exact native-session reference or blocking reason. Opaque Driver receipts SHALL NOT be the sole evidence used to claim generic resumability.

#### Scenario: Failure lacks safe continuation evidence
- **WHEN** the terminal classifier cannot prove continuation is safe under the persisted Driver capabilities
- **THEN** the Agent becomes errored, its prior valid native-session reference is preserved when appropriate, and the completion records the blocking reason

### Requirement: Session leases survive worker boundaries
Native-session leases SHALL be stored outside individual worker memory, keyed by canonical `(harnessId, instanceKey, nativeSessionId)`, and bound to the owning root, Agent, and job. They SHALL be released when the current Agent turn becomes completed, failed/errored, or interrupted. Legacy cancelled records SHALL not create new leases.

#### Scenario: Harness worker exits normally
- **WHEN** its internal job becomes completed, failed, or interrupted
- **THEN** the matching active Harness session lease is released while any valid durable Agent session binding remains

#### Scenario: Another Harness uses the same native ID text
- **WHEN** two admitted Harnesses independently report the same native session ID string
- **THEN** their different Harness IDs or instance keys prevent the leases and durable bindings from colliding

### Requirement: Agent metadata outlives bounded job receipts
The runtime SHALL retain root-owned Agent identity, immutable Harness route, accepted Driver contract, Agent mailbox, latest job pointer, and latest validated native-session reference independently from the newest-100 terminal-job receipt bucket.

#### Scenario: All detailed jobs for an old Agent are pruned
- **WHEN** the Agent remains in the root registry with continuation evidence valid under its persisted Driver capabilities
- **THEN** it remains discoverable and eligible for that exact capability-valid continuation path

### Requirement: Plugin-created Claude session bindings are durable and root-owned
Version-1 Claude session bindings SHALL retain their existing canonical config/session ownership. Version-2 native-session bindings SHALL persist canonical `(harnessId, instanceKey, nativeSessionId)` ownership independently from process leases and SHALL require that binding for model-facing exact-session continuation. No version SHALL adopt foreign or Terminal-created sessions through the Agent API.

#### Scenario: Lease is released after a v2 turn
- **WHEN** an Agent turn becomes terminal
- **THEN** the active Harness lease is released while the durable root/Agent native-session binding remains for any supported sequential continuation

#### Scenario: Bound native session is requested by another root
- **WHEN** another trusted root attempts to resume the same Harness session reference
- **THEN** the runtime rejects it even when no active process lease exists

#### Scenario: Version 1 binding is loaded
- **WHEN** the v2 runtime encounters an existing valid Claude config/session binding
- **THEN** it preserves that binding and interprets it as the equivalent Claude Code Harness session without expanding ownership

## ADDED Requirements

### Requirement: Harness-neutral state migration preserves active ownership
The v2 runtime SHALL interpret valid v1 Agent, job, session-binding, and lease records as Claude Code state. It MAY normalize terminal unowned v1 state on its next safe write, but SHALL NOT rewrite, lease, resume, signal, or steal an active or ownership-uncertain v1 record from its existing worker. New Agents SHALL be written only as v2 after mixed-state verification is enabled. A v1-only runtime SHALL fail closed on v2 state.

#### Scenario: Active version 1 worker exists during hot update
- **WHEN** a v2 process observes a v1 job with verified live ownership or unresolved ownership
- **THEN** it leaves that record and its lease under the existing worker until terminal reconciliation provides a safe transition

#### Scenario: Terminal version 1 Agent receives a safe follow-up
- **WHEN** a valid nonresident v1 Claude Agent is resumed by the v2 runtime
- **THEN** the runtime preserves its root, Agent, config/session binding, route meaning, mailbox order, and exact-session semantics while writing the new activation in the v2 schema

#### Scenario: Old runtime sees version 2 state
- **WHEN** a runtime without v2 support encounters a v2 Agent, job, binding, or lease record
- **THEN** it refuses lifecycle control instead of interpreting the record as v1 or launching a competing Harness process

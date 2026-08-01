## MODIFIED Requirements

### Requirement: Agent Thread has a stable durable identity
The runtime SHALL persist each v2 Agent with a schema version, stable generated ID, flat `/root/<task_name>` path, root-unique name, optional description, immutable Harness ID, immutable validated model route, immutable delegation/topology mode, immutable accepted Driver version and capability snapshot, root thread ID identical to hardened `ownerRootId`, canonical workspace root, separate active and latest job pointers, validated same-Harness neutral native-session reference, lifecycle status, explicit continuation classification and evidence, timestamps, and latest completion sequence. Effort and write intent SHALL be validated and persisted per turn rather than frozen into Agent identity. A valid v1 Agent SHALL be interpreted as a Claude Code Agent with its existing Claude route, delegation mode, and session semantics.

#### Scenario: Agent finishes its first v2 turn
- **WHEN** the initial job reaches a terminal state
- **THEN** the same Agent ID, path, Harness, model route, topology, and Driver contract remain while its lifecycle, continuation, active/latest job pointers, native session, and completion sequence are atomically updated; a later turn may use a different explicit effort or write intent

#### Scenario: Version 1 Agent is read
- **WHEN** the v2 runtime loads a valid existing Agent record without Harness-neutral fields
- **THEN** it interprets that record as `claude-code` without changing its identity, route meaning, mailbox, or current lifecycle owner

### Requirement: Agent continuity is independent from job retention and process residency
Agent identity, immutable Harness route, and latest validated native-session reference SHALL remain usable after old internal jobs are pruned and after every Harness worker has exited.

#### Scenario: Agent's older jobs are pruned
- **WHEN** the root exceeds its 100 terminal-job receipt limit
- **THEN** the Agent remains listed and eligible for capability-valid continuation using its registry session reference

### Requirement: Agent session pointer rejects drift
The registry SHALL update an Agent's native-session reference only from an owner-valid job whose observed Harness, instance key, and native session match its expected exact-session contract. A Driver that does not declare exact continuation SHALL NOT create an exact-resume pointer.

#### Scenario: Resumed turn reports another native session
- **WHEN** a Driver reports a different Harness, instance key, or native session ID from the Agent's exact-resume target
- **THEN** the turn becomes errored and the prior valid Agent session reference is preserved

#### Scenario: Driver supports only fresh continuation
- **WHEN** an admitted route declares `continuation=fresh_only`
- **THEN** the Agent records that capability without representing its terminal native session as exact-resumable

### Requirement: Plugin-created Claude session identity is bound to one root and Agent
For v1 state, the registry SHALL preserve the canonical `(CLAUDE_CONFIG_DIR, Claude session ID)` binding to `ownerRootId` and `agentId`. For v2 state, the equivalent binding SHALL be canonical `(harnessId, instanceKey, nativeSessionId)` to the same root and Agent, where the Driver owns canonical `instanceKey` derivation. Neither model-facing nor operator operations SHALL adopt an unbound or foreign native session.

#### Scenario: New v2 native session is observed
- **WHEN** a first turn reports a native session reference and all Driver capability, binding, and lease checks pass
- **THEN** the runtime atomically binds that Harness session to the trusted root and Agent before making it available for continuation

#### Scenario: Caller attempts foreign native session adoption
- **WHEN** any spawn path supplies or references an existing unbound or foreign native session
- **THEN** the runtime rejects the input and records that adoption requires a separate OpenSpec

#### Scenario: Version 1 Claude binding is read
- **WHEN** the v2 runtime loads an existing canonical Claude config/session binding
- **THEN** it interprets the binding as `harnessId=claude-code` with that config directory as `instanceKey` without broadening its root or Agent ownership

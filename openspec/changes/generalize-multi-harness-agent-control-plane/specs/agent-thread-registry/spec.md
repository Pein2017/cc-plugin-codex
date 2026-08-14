## ADDED Requirements

### Requirement: Version-three Agent route is explicit and immutable
A version-3 Agent SHALL persist one explicit immutable Harness ID, logical instance key, exact Driver-validated model, topology, behavioral authority, accepted Driver version, capability-schema version, and capability snapshot. The admitted topology values SHALL be `leaf` and `native_orchestrator`; behavioral authority SHALL be `behavioral_read_only` or `behavioral_write`. Follow-up, active delivery, recovery, and interruption SHALL inherit those values and SHALL NOT accept a route, model, topology, or authority change.

The runtime generation that lacks all required public route inputs SHALL NOT create version-3 Agents. It MAY read and validate version-3 fixtures and records while continuing to write the previous Claude-only schema until the dependent public generation becomes active.

#### Scenario: New generation creates an Agent
- **WHEN** the caller explicitly supplies a valid Harness, model, topology, and behavioral authority
- **THEN** the registry freezes the canonical validated route before native input acceptance

#### Scenario: Required route field is omitted
- **WHEN** any version-3 spawn omits Harness, model, topology, or behavioral authority
- **THEN** the request fails before readiness, name reservation, mailbox mutation, or native execution

#### Scenario: Follow-up attempts authority escalation
- **WHEN** a caller attempts to change a version-3 Agent from read-only to write or changes any other route field
- **THEN** the request is rejected before mailbox mutation and the existing Agent remains unchanged

### Requirement: Legacy Claude Agents remain evidence-preserving and nonconvertible
Valid version-1 and version-2 Agents SHALL remain root-scoped Claude Code Agents with their existing name, mailbox, model evidence, delegation meaning, native session binding, and continuation rules. The legacy projection SHALL map `claude_orchestrator` to version-3 topology `native_orchestrator` only for observation and validation; it SHALL NOT rewrite the historical record merely because it was read. No operation SHALL convert a legacy Agent to another Harness or adopt its native session into another Driver.

#### Scenario: Legacy Agent receives a follow-up
- **WHEN** its existing Claude continuation evidence admits follow-up
- **THEN** the same logical Agent continues through the Claude legacy adapter without route conversion

#### Scenario: Caller requests cross-Harness conversion
- **WHEN** a caller targets an existing Claude Agent with another Harness or model route
- **THEN** the runtime rejects the request and requires a new Agent identity

### Requirement: Same-Harness and cross-Harness communication stay capability bounded
The registry SHALL treat the Agent mailbox as parent-to-worker input only. Same-Harness native worker communication MAY remain opaque inside a Driver capability such as the existing Claude native team, but Plugin-owned Agents SHALL NOT automatically message one another. Cross-Harness communication SHALL require a new parent-created Agent and a Codex-authored distilled handoff.

#### Scenario: Codex hands findings to another Harness
- **WHEN** the lead wants a worker on another Harness to use an earlier result
- **THEN** it creates a new explicitly routed Agent and supplies a bounded handoff instead of linking or migrating native sessions

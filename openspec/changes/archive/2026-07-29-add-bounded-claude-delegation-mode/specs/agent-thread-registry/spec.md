## ADDED Requirements

### Requirement: Agent delegation mode is immutable and recoverable
The registry SHALL accept only `leaf` and `claude_orchestrator` as durable delegation modes. Spawn SHALL set the mode once, follow-up and recovery SHALL inherit it, and no model-facing operation SHALL change it. A legacy Agent record without the field SHALL validate and project as `leaf`, then persist the normalized value on its next safe registry write. Each prepared Agent job SHALL retain the resolved mode so detached launch and recovery reconstruct the same prompt/tool boundary.

#### Scenario: Follow-up activates a leaf Agent
- **WHEN** an existing leaf Agent receives an activating follow-up
- **THEN** the prepared job inherits leaf mode without accepting a caller override

#### Scenario: Legacy Agent lacks delegation metadata
- **WHEN** reconciliation reads a valid historical Agent record without `delegationMode`
- **THEN** it remains usable as leaf and is normalized without changing identity, session, mailbox, or lifecycle evidence

#### Scenario: Recovered job restarts
- **WHEN** a detached worker reconstructs an accepted job after process or host interruption
- **THEN** it derives the exact stored delegation mode and cannot silently widen native Agent access

## MODIFIED Requirements

### Requirement: Agent Thread has a stable durable identity
The runtime SHALL persist each Agent with a schema version, stable generated ID, flat `/root/<task_name>` path, root-unique name, optional description, immutable delegation mode, root thread ID identical to hardened `ownerRootId`, canonical workspace root, separate active and latest job pointers, validated Claude session pointer, lifecycle status, explicit continuation classification and evidence, timestamps, and latest completion sequence.

#### Scenario: Agent finishes its first turn
- **WHEN** the initial job reaches a terminal state
- **THEN** the same Agent ID, path, and delegation mode remain while its lifecycle, continuation, active/latest job pointers, Claude session, and completion sequence are atomically updated

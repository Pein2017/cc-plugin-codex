## ADDED Requirements

### Requirement: Harness terminal results reconcile native owned-work evidence
Each Harness Driver SHALL normalize `completed` only when its native terminal, process, session, and recognized owned-work evidence are mutually consistent. Harness-specific task lifecycle remains inside the Driver receipt; the shared supervisor SHALL receive only the normalized terminal result and bounded generic activity evidence. A Driver that observes contradictory or unbounded native owned-work evidence SHALL fail closed instead of projecting a successful terminal Agent.

#### Scenario: Driver has no outstanding owned work
- **WHEN** the native process and terminal result are successful and every recognized must-join task is settled
- **THEN** the Driver may return normalized `completed` with the final outer-assistant message

#### Scenario: Process closes with owned work outstanding
- **WHEN** the native process exits while recognized must-join work remains open
- **THEN** the Driver returns a non-success Harness result with bounded incompatibility evidence and the supervisor publishes no false successful completion

#### Scenario: Native task event is contradictory
- **WHEN** task identities, terminal notifications, or ownership transitions violate the admitted Driver state machine
- **THEN** the Driver fails closed and retains only bounded sanitized evidence

#### Scenario: Future Harness uses another task protocol
- **WHEN** a later admitted Harness represents native background work differently from Claude Code
- **THEN** it implements the same normalized consistency invariant without exposing Claude event schemas to the supervisor

## ADDED Requirements

### Requirement: Typed wait schema exposes fixed target joins
The typed `wait_agent` schema SHALL accept optional `targets` as a non-empty array of at most eight unique exact current-root Agent targets in addition to existing optional `wake_on_progress` and `acknowledge_tokens`. It SHALL reject `targets` combined with `wake_on_progress`, unknown fields, invalid targets, duplicates, empty arrays, and arrays above eight before invoking delivery mutation. It SHALL add no join tool, join-mode selector, timeout selector, job identifier, cross-root selector, or native-session input.

#### Scenario: Caller requests one targeted join
- **WHEN** the caller supplies one valid exact target and omits progress wakeup
- **THEN** the MCP adapter passes that target to the existing public `wait_agent` operation with the fixed model-facing timeout

#### Scenario: Caller requests a barrier
- **WHEN** the caller supplies multiple unique valid exact targets within the public bound
- **THEN** the adapter invokes one fixed all-target join and returns its bounded aggregate receipt

#### Scenario: Caller mixes targeting and progress
- **WHEN** `targets` and `wake_on_progress: true` are both present
- **THEN** strict schema validation rejects the call before runtime state changes

#### Scenario: Existing caller omits targets
- **WHEN** a caller uses the pre-change wait input
- **THEN** the adapter preserves the existing root-wide result schema and semantics

#### Scenario: Public API generation changes
- **WHEN** the installed Plugin includes the new `targets` schema and aggregate result guidance
- **THEN** current MCP processes remain on their discovered generation and a new Codex task is required to use the field

## ADDED Requirements

### Requirement: MCP errors redact private runtime identity
Model-facing MCP errors SHALL preserve actionable public categories while excluding native Claude session identifiers, internal job identifiers, and absolute runtime-state paths.

#### Scenario: Session lease conflict contains native identity
- **WHEN** an internal lease error contains a Claude session identifier, job identifier, or absolute state path
- **THEN** the MCP response replaces those values with stable public wording and retains the recovery action

### Requirement: MCP wait guidance matches the fixed public schema
Model-facing guidance and release smoke SHALL call `wait_agent` without a timeout argument and SHALL describe its fixed completion-first wait plus conditional completion-token acknowledgement.

#### Scenario: Paid smoke joins a test Agent
- **WHEN** the explicitly enabled Haiku/low release smoke waits for its Agent
- **THEN** it sends only arguments accepted by the current `wait_agent` schema

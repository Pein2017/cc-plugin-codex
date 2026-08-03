## ADDED Requirements

### Requirement: Paid release smoke is schema-current and regression tested without Claude usage
The optional paid Haiku/low release smoke SHALL exercise the current public MCP argument schema, and the repository SHALL verify that loop with a fake transport that consumes no Claude model quota.

#### Scenario: Zero-cost paid-loop regression
- **WHEN** the repository test suite executes the paid-smoke control flow against a fake MCP transport
- **THEN** it verifies schema-current spawn, wait, completion, and cleanup behavior without launching Claude

## ADDED Requirements

### Requirement: Claude final handoff is the latest complete outer-assistant message
The Claude Code Driver SHALL return the latest complete top-level outer-assistant message as `finalMessage`, SHALL exclude earlier tool-boundary narration and intermediate assistant messages, and SHALL not truncate that selected message.

#### Scenario: Turn contains intermediate narration and tools
- **WHEN** stream-json contains an assistant message before tool use and a later complete assistant message after tool use
- **THEN** `finalMessage` contains only the later complete outer-assistant message

#### Scenario: Message boundaries are unavailable
- **WHEN** a compatible Claude stream contains no complete outer-assistant message boundary but provides terminal result text
- **THEN** the Driver uses the terminal result as a fallback without concatenating duplicate prefixes

### Requirement: Harness failure classification uses native execution evidence
The runtime SHALL derive Harness-scoped authentication, account-limit, transport, and process blocking only from structured terminal events, stderr, warnings, exit state, or equivalent native execution evidence, not from Claude assistant prose.

#### Scenario: Assistant discusses an account limit hypothetically
- **WHEN** a successful final assistant message mentions quota, authentication, or permission errors without matching native failure evidence
- **THEN** the job is not classified as a Harness-scoped operator-required failure

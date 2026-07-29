## MODIFIED Requirements

### Requirement: MCP receipts remain complete and structured
Successful MCP tools SHALL return the matching operation's complete bounded public runtime receipt as structured content with a JSON text representation for protocol clients. The MCP adapter SHALL NOT supplement a compact operation-specific receipt with internal Agent, message, job, steering, session, or persistence evidence. Runtime validation, compatibility, subscription-limit, continuation, and recovery errors SHALL remain actionable while excluding arbitrary environment values, raw private state, and foreign-root evidence.

#### Scenario: Spawn succeeds
- **WHEN** the runtime returns a durable spawn receipt
- **THEN** the MCP result contains that receipt without inventing another Agent or terminal session identifier

#### Scenario: Send succeeds with a compact receipt
- **WHEN** the runtime returns a bounded `send_message` receipt
- **THEN** the MCP result contains exactly that compact receipt in text and structured content without reconstructing the durable mailbox record

#### Scenario: Runtime rejects a request
- **WHEN** an operation fails validation or reaches an actionable lifecycle boundary
- **THEN** the MCP call reports the sanitized runtime error and does not replace it with a generic success or fallback execution

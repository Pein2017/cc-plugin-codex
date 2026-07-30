## MODIFIED Requirements

### Requirement: MCP receipts remain complete and structured
Successful MCP tools SHALL return the matching operation's complete bounded public runtime receipt as structured content with a JSON text representation for protocol clients. Spawn SHALL expose only `agent_name`, `model`, and `status`; follow-up SHALL expose only `agent_name` and `delivery`; interrupt SHALL expose only `agent_name` and operation `status`. Other operation-specific receipts, including complete wait completion delivery, SHALL remain unchanged. The MCP adapter SHALL NOT supplement a compact receipt with internal Agent, message, job, steering, session, or persistence evidence. Runtime validation, compatibility, subscription-limit, continuation, and recovery errors SHALL remain actionable while excluding arbitrary environment values, raw private state, and foreign-root evidence.

#### Scenario: Spawn succeeds
- **WHEN** the runtime returns a durable spawn receipt
- **THEN** the MCP result contains exactly `agent_name`, `model`, and `status` without inventing another Agent or terminal session identifier

#### Scenario: Follow-up succeeds
- **WHEN** the runtime durably delivers or activates a follow-up
- **THEN** the MCP result contains exactly `agent_name` and `delivery`

#### Scenario: Interrupt succeeds
- **WHEN** the runtime completes an interruption request
- **THEN** the MCP result contains exactly `agent_name` and operation `status`

#### Scenario: Send succeeds with a compact receipt
- **WHEN** the runtime returns a bounded `send_message` receipt
- **THEN** the MCP result contains exactly that compact receipt in text and structured content without reconstructing the durable mailbox record

#### Scenario: Wait returns completion
- **WHEN** `wait_agent` returns an unread completion
- **THEN** the MCP result preserves the complete stored Agent final message and delivery token

#### Scenario: Runtime rejects a request
- **WHEN** an operation fails validation or reaches an actionable lifecycle boundary
- **THEN** the MCP call reports the sanitized runtime error and does not replace it with a generic success or fallback execution

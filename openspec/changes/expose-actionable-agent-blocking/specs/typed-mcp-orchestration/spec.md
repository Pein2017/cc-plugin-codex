## MODIFIED Requirements

### Requirement: MCP receipts remain complete and structured
Successful MCP tools SHALL return the matching operation's complete bounded public runtime receipt as structured content with a JSON text representation for protocol clients. Spawn SHALL expose only `agent_name`, `model`, and `status`; follow-up SHALL expose only `agent_name` and `delivery`; interrupt SHALL expose only `agent_name` and operation `status`. Wait completion delivery SHALL preserve the complete stored Agent final message and delivery token and SHALL additionally carry the runtime's nested `blocking` field unchanged, whether that field is a bounded object or `null`; other operation-specific receipts SHALL remain unchanged. The adapter SHALL pass blocking evidence through verbatim from the public runtime receipt and SHALL NOT declare an output schema, derive, widen, reinterpret, supplement, or omit it, and SHALL NOT infer a blocked lane from terminal status. The MCP adapter SHALL NOT supplement a compact receipt with internal Agent, message, job, steering, session, or persistence evidence. Runtime validation, compatibility, subscription-limit, continuation, and recovery errors SHALL remain actionable while excluding arbitrary environment values, raw private state, and foreign-root evidence; a blocked-Agent rejection SHALL carry only the closed blocking vocabulary.

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
- **THEN** the MCP result preserves the complete stored Agent final message, delivery token, and the runtime's nested blocking object exactly as the runtime produced it

#### Scenario: Blocking evidence crosses the adapter
- **WHEN** the runtime returns a completion whose blocking evidence names a closed reason, scope, and retry
- **THEN** the adapter forwards those values without declaring an output schema, changing the public tool generation, or adding derived fields

#### Scenario: Null blocking evidence crosses the adapter
- **WHEN** the runtime returns a completed or gracefully interrupted completion whose blocking field is `null`
- **THEN** the adapter forwards `null` unchanged and does not synthesize a reason from the terminal status

#### Scenario: Runtime rejects a request
- **WHEN** an operation fails validation or reaches an actionable lifecycle boundary
- **THEN** the MCP call reports the sanitized runtime error and does not replace it with a generic success or fallback execution

#### Scenario: Blocked-Agent rejection crosses the adapter
- **WHEN** `send_message` or `followup_task` is rejected because the target Agent is blocked
- **THEN** the sanitized error names only the closed blocking vocabulary and contains no process identifier, native session identifier, manual resume command, or raw internal reason text

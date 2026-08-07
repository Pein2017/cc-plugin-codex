## MODIFIED Requirements

### Requirement: MCP receipts remain complete and structured
Successful MCP tools SHALL return the matching operation's complete bounded public runtime receipt as structured content with a JSON text representation for protocol clients. Spawn SHALL expose only the compact Agent Card fields defined by canonical orchestration, using `status` as its lifecycle field; list entries SHALL expose the same evidence with `agent_status`. Follow-up SHALL expose only `agent_name` and `delivery`; interrupt SHALL expose only `agent_name` and operation `status`. Wait completion and targeted settled entries SHALL additionally expose the exact frozen optional `metrics` object. The MCP adapter SHALL NOT supplement a receipt with internal Agent, message, job, steering, session, raw terminal event, tool argument, path, command, or persistence evidence. Runtime validation, compatibility, subscription-limit, continuation, and recovery errors SHALL remain actionable while excluding arbitrary environment values, raw private state, and foreign-root evidence.

#### Scenario: Spawn succeeds
- **WHEN** the runtime returns a durable spawn Agent Card
- **THEN** the MCP result contains only its stable model-facing card fields and does not invent another Agent, native session, job, mailbox, or terminal identifier

#### Scenario: List succeeds
- **WHEN** the runtime returns current-root Agent Cards
- **THEN** the MCP result preserves every nullable evidence field without adding progress summaries or completion content

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
- **THEN** the MCP result preserves the complete stored Agent final message, delivery token, blocking tuple, and exact frozen nullable metrics

#### Scenario: Runtime rejects a request
- **WHEN** an operation fails validation or reaches an actionable lifecycle boundary
- **THEN** the MCP call reports the sanitized runtime error and does not replace it with a generic success or fallback execution

## ADDED Requirements

### Requirement: Model instructions avoid duplicated lifecycle prose
The MCP server SHALL keep shared asynchronous-spawn, completion-first join, timeout, progress, and acknowledgement policy in one concise server instruction. Each tool description SHALL state only that operation's purpose, distinctive constraints, and the minimum action needed to call it safely. Skills MAY retain fuller on-demand guidance, but repeated prose SHALL NOT introduce conflicting timeout, progress, target, acknowledgement, or activation semantics.

#### Scenario: A new Codex task discovers the server
- **WHEN** Codex loads the seven tool descriptions and server instructions
- **THEN** their combined guidance contains one coherent join policy and each tool description remains operation-specific

#### Scenario: Guidance is compressed
- **WHEN** duplicate sentences are removed from tool descriptions
- **THEN** release-smoke and plugin-contract tests still prove every consequential prohibition and recovery action from the canonical Skills or shared server instruction


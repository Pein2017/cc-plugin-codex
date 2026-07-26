## MODIFIED Requirements

### Requirement: Completion events use two-phase at-least-once delivery
Each owner root SHALL have a monotonic completion sequence and an atomic cursor for the highest contiguously acknowledged Agent-linked event. A model-facing wait SHALL return at most the oldest unread Agent-linked summary with an opaque delivery token and SHALL NOT acknowledge that update in the same response-producing call. Stored final output SHALL remain internal and absent from the default projection.

#### Scenario: Next Codex turn checks unread completions
- **WHEN** the same owner root waits after a background Agent finishes
- **THEN** the runtime returns one bounded status/summary update and its delivery token without returning final output

#### Scenario: Later call confirms contiguous delivery
- **WHEN** a later wait echoes the valid token for the oldest previously returned Agent update
- **THEN** the cursor advances atomically through that update and any skipped legacy prefix

#### Scenario: Runtime crashes after producing a response
- **WHEN** the response does not reach Codex and no later call echoes its token
- **THEN** the cursor remains unchanged and the same bounded update is delivered again

#### Scenario: Acknowledgement skips an older Agent event
- **WHEN** an echoed token does not identify the oldest unread Agent-linked update
- **THEN** the runtime rejects the acknowledgement without advancing past it

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens` from a prior response, then report the oldest already-unread Agent-linked summary or wait for the next current-root Agent activity up to `timeout_ms`. Every newly returned update SHALL remain unread until its token is echoed in a later wait. `list_agents` SHALL not participate in completion delivery.

#### Scenario: List reports logical state
- **WHEN** `list_agents` renders completed Agent state
- **THEN** it returns `completed: null` without reading, returning, or acknowledging completion events

#### Scenario: Completion arrives during wait
- **WHEN** any current-root Agent reaches a terminal state before the timeout
- **THEN** wait returns one bounded completion update and opaque token without final output or same-call acknowledgement

#### Scenario: Later wait acknowledges the prior update
- **WHEN** a later wait echoes the valid token for the oldest returned update
- **THEN** the cursor advances before returning or waiting for subsequent Agent activity

#### Scenario: Wait times out
- **WHEN** no current-root Agent produces activity before the deadline
- **THEN** wait returns a Codex-like timeout receipt without changing Agent state or acknowledging future events

### Requirement: Unread completion survives normal job pruning
Unread Agent completion summary metadata SHALL remain available if its detailed internal job receipt later exceeds the normal job-retention limit. Final output availability and result pointers SHALL remain internal details and SHALL NOT appear in default `list_agents` or `wait_agent` output.

#### Scenario: Old unread job exceeds 100-job retention
- **WHEN** cleanup prunes the detailed job record before the owner acknowledges its Agent completion
- **THEN** `wait_agent` still exposes a self-contained bounded summary and token without claiming that final output is model-visible

## ADDED Requirements

### Requirement: Legacy unowned completions cannot block Agent delivery
Completion records with no durable Agent identity SHALL remain stored as quarantined legacy evidence but SHALL be skipped by model-facing Agent delivery and acknowledgement-prefix selection.

#### Scenario: Legacy events precede a current Agent completion
- **WHEN** one or more unread `agentId=null` events precede an unread Agent-linked event
- **THEN** `wait_agent` returns the Agent-linked summary immediately and does not expose the legacy records

#### Scenario: Agent update after a legacy prefix is acknowledged
- **WHEN** the caller acknowledges the oldest returned Agent-linked update
- **THEN** the cursor may advance across the preceding quarantined legacy sequences without rewriting their event IDs or delivery tokens

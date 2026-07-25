# completion-delivery Specification

## Purpose

Define durable, bounded, at-least-once completion delivery across inactive Codex turns without a resident forwarding process.
## Requirements
### Requirement: Every terminal job emits one durable completion event
The runtime SHALL create exactly one root-owned, Agent-linked completion event when an Agent's internal job first reaches `completed`, `interrupted`, or `failed`; the event SHALL map internal `failed` to Agent `errored` and retain the hardened bounded `finalMessage`, `truncated`, `detailedResultAvailable`, and `claudeSessionIdAvailable` fields.

#### Scenario: Worker publishes terminal state
- **WHEN** a non-terminal internal job first commits completed, interrupted, or failed state
- **THEN** an idempotently keyed completion event identifies both the internal job and stable Agent and uses the defined Agent-status mapping

#### Scenario: Reconciliation sees an event after a crash
- **WHEN** a terminal Agent turn exists without its deterministic completion event
- **THEN** reconciliation appends the missing Agent-linked event once without duplicating an existing event

#### Scenario: Final output exceeds the completion bound
- **WHEN** an Agent turn's final output is larger than 64 KiB in UTF-8
- **THEN** the event retains a valid bounded prefix, marks it truncated, and points the caller to detailed result availability

### Requirement: Completion events use two-phase at-least-once delivery
Each owner root SHALL have a monotonic completion sequence and an atomic cursor for the highest contiguously acknowledged event. A read or wait SHALL return the oldest unread contiguous batch with opaque delivery tokens and SHALL NOT acknowledge that batch in the same response-producing call.

#### Scenario: Next Codex turn checks unread completions
- **WHEN** the same owner root reads its completion inbox after a background job finishes
- **THEN** the runtime returns the unseen completion and its delivery token even though the original Codex turn ended earlier

#### Scenario: Later call confirms contiguous delivery
- **WHEN** a later wait echoes valid delivery tokens for the oldest unread contiguous prefix
- **THEN** the cursor advances atomically through that prefix and those events are no longer returned as unread

#### Scenario: Runtime crashes after producing a response
- **WHEN** the response does not reach Codex and no later call echoes its tokens
- **THEN** the cursor remains unchanged and the same completion is delivered again

#### Scenario: Acknowledgement skips an older event
- **WHEN** echoed tokens do not cover the oldest unread contiguous prefix
- **THEN** the runtime rejects the acknowledgement without advancing past unseen events

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens` from a prior response, then return the oldest already-unread contiguous activity batch or wait for the next activity from any current-root Agent up to `timeout_ms`. Every newly returned completion SHALL remain unread until tokens are echoed in a later wait. `list_agents` SHALL report unread completion summaries without acknowledgement.

#### Scenario: List reports existing unread completion
- **WHEN** `list_agents` renders an unread completion
- **THEN** the acknowledgement cursor remains unchanged

#### Scenario: Completion arrives during wait
- **WHEN** any current-root Agent reaches a terminal state before the timeout
- **THEN** wait returns its durable completion update and opaque token without acknowledging it in that call

#### Scenario: Later wait acknowledges the prior batch
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous prefix
- **THEN** the cursor advances through that prefix before returning or waiting for subsequent activity

#### Scenario: Wait times out
- **WHEN** no current-root Agent produces activity before the deadline
- **THEN** wait returns a timeout receipt without changing Agent state or acknowledging future events

### Requirement: Proactive wakeup is not a local-runtime dependency
The local runtime SHALL NOT require a resident forwarding agent, background terminal, or unsupported host callback to preserve completion delivery.

#### Scenario: Codex task is inactive when Claude completes
- **WHEN** no Codex model turn is running at completion time
- **THEN** the durable unread event remains available for the next turn without keeping Claude resident

### Requirement: Unread completion survives normal job pruning
Unread Agent completion metadata SHALL remain available even if its detailed internal job receipt later exceeds the normal job-retention limit.

#### Scenario: Old unread job exceeds 100-job retention
- **WHEN** cleanup prunes the detailed job record before the owner acknowledges its Agent completion
- **THEN** `list_agents` and `wait_agent` still expose a self-contained completion summary and explicitly mark detailed receipt availability

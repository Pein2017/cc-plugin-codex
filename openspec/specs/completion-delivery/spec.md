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
Each owner root SHALL have a monotonic completion sequence and an atomic cursor for the highest contiguously acknowledged Agent-linked event. A model-facing wait SHALL return at most the oldest unread Agent-linked summary with an opaque delivery token and a UTF-8-bounded completion handoff of at most 4096 bytes, and SHALL NOT acknowledge that update in the same response-producing call. The first model-facing delivery SHALL atomically freeze the payload identified by that token against later in-place reconciliation. The handoff SHALL carry an explicit truncation flag. The remaining stored final output, result pointer, resumability evidence, and Claude session evidence SHALL remain internal and absent from the default projection.

#### Scenario: Next Codex turn checks unread completions
- **WHEN** the same owner root reads its completion inbox after a background job finishes
- **THEN** the runtime returns one bounded status/summary/handoff update and its delivery token without returning the full final output

#### Scenario: Completion handoff exceeds its public bound
- **WHEN** the stored Agent final message is larger than 4096 bytes in UTF-8
- **THEN** the public update returns a valid bounded prefix and marks the handoff truncated while the internal stored receipt remains unchanged

#### Scenario: Later call confirms contiguous delivery
- **WHEN** a later wait echoes valid delivery tokens for the oldest unread contiguous prefix
- **THEN** the cursor advances atomically through that update and any skipped legacy prefix

#### Scenario: Runtime crashes after producing a response
- **WHEN** the response does not reach Codex and no later call echoes its tokens
- **THEN** the cursor remains unchanged and the same bounded update is delivered again

#### Scenario: Reconciliation changes after first delivery
- **WHEN** an event has already been returned to a model-facing wait and later reconciliation proposes different terminal content
- **THEN** the original token and bounded payload remain immutable for redelivery

#### Scenario: Agent starts a follow-up before acknowledgement
- **WHEN** an exposed completion remains unread while the same Agent lifecycle changes for a new turn
- **THEN** redelivery under the original token retains the frozen terminal status and is identical to the first public update

#### Scenario: Acknowledgement skips an older event
- **WHEN** an echoed token does not identify the oldest unread Agent-linked update
- **THEN** the runtime rejects the acknowledgement without advancing past unseen events

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens` from a prior response, then report the oldest already-unread Agent-linked completion or wait for the next current-root Agent completion or safe progress activity up to `timeout_ms`. Every newly returned completion SHALL remain unread until its token is echoed in a later wait. `list_agents` SHALL not participate in completion or progress delivery.

#### Scenario: List reports logical state
- **WHEN** `list_agents` renders completed Agent state
- **THEN** it returns `completed: null` without reading, returning, or acknowledging completion handoffs or progress updates

#### Scenario: Completion arrives during wait
- **WHEN** any current-root Agent reaches a terminal state before the timeout
- **THEN** wait returns one bounded completion update and opaque token without same-call acknowledgement

#### Scenario: Progress arrives during wait
- **WHEN** a current-root Agent publishes safe progress before any completion and before timeout
- **THEN** wait returns one advisory progress update without changing completion acknowledgement state

#### Scenario: Later wait acknowledges the prior update
- **WHEN** a later wait echoes the valid token for the oldest returned completion update
- **THEN** the cursor advances before returning or waiting for subsequent Agent activity

#### Scenario: Wait times out
- **WHEN** no current-root Agent produces new progress or completion activity before the deadline
- **THEN** wait returns a timeout receipt without changing Agent state or acknowledging future events

### Requirement: Proactive wakeup is not a local-runtime dependency
The local runtime SHALL NOT require a resident forwarding agent, background terminal, or unsupported host callback to preserve completion delivery.

#### Scenario: Codex task is inactive when Claude completes
- **WHEN** no Codex model turn is running at completion time
- **THEN** the durable unread event remains available for the next turn without keeping Claude resident

### Requirement: Unread completion survives normal job pruning
Unread Agent completion summary metadata and its bounded public completion handoff SHALL remain available if its detailed internal job receipt later exceeds the normal job-retention limit. Full final output availability and result pointers SHALL remain internal details and SHALL NOT appear in default `list_agents` or `wait_agent` output.

#### Scenario: Old unread job exceeds 100-job retention
- **WHEN** cleanup prunes the detailed job record before the owner acknowledges its Agent completion
- **THEN** `wait_agent` still exposes a self-contained bounded summary, handoff, truncation flag, and token without claiming the full final output is model-visible

### Requirement: Legacy unowned completions cannot block Agent delivery
Completion records with no durable Agent identity SHALL remain stored as quarantined legacy evidence but SHALL be skipped by model-facing Agent delivery and acknowledgement-prefix selection.

#### Scenario: Legacy events precede a current Agent completion
- **WHEN** one or more unread `agentId=null` events precede an unread Agent-linked event
- **THEN** `wait_agent` returns the Agent-linked summary immediately and does not expose the legacy records

#### Scenario: Agent update after a legacy prefix is acknowledged
- **WHEN** the caller acknowledges the oldest returned Agent-linked update
- **THEN** the cursor may advance across the preceding quarantined legacy sequences without rewriting their event IDs or delivery tokens

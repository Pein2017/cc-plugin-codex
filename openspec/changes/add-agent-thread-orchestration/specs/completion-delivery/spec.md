## MODIFIED Requirements

### Requirement: Every terminal job emits one durable completion event
The runtime SHALL create exactly one root-owned, Agent-linked completion event when an Agent's internal job first reaches `completed`, `interrupted`, or `failed`; the event SHALL map internal `failed` to Agent `errored`.

#### Scenario: Agent turn publishes terminal state
- **WHEN** a non-terminal internal job first commits completed, interrupted, or failed state
- **THEN** an idempotently keyed completion event identifies both the internal job and stable Agent and uses the defined Agent-status mapping

#### Scenario: Reconciliation sees an event after a crash
- **WHEN** a terminal Agent turn exists without its deterministic completion event
- **THEN** reconciliation appends the missing Agent-linked event once without duplicating an existing event

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens` from a prior response, then return the oldest already-unread contiguous activity batch or wait for the next activity from any current-root Agent up to `timeout_ms`. Every newly returned completion SHALL remain unread until tokens are echoed in a later wait. `list_agents` SHALL report unread completion summaries without acknowledgement.

#### Scenario: List reports existing unread completion
- **WHEN** `list_agents` renders an unread completion
- **THEN** the acknowledgement cursor remains unchanged

#### Scenario: Root Agent completes during wait
- **WHEN** any current-root Agent reaches a terminal state before the timeout
- **THEN** wait returns its durable completion update and opaque token without acknowledging it in that call

#### Scenario: Later wait acknowledges the prior batch
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous prefix
- **THEN** the cursor advances through that prefix before returning or waiting for subsequent activity

#### Scenario: Wait times out
- **WHEN** no current-root Agent produces activity before the deadline
- **THEN** wait returns a timeout receipt without changing Agent state or acknowledging future events

### Requirement: Unread completion survives normal job pruning
Unread Agent completion metadata SHALL remain available even if its detailed internal job receipt later exceeds the normal job-retention limit.

#### Scenario: Old unread internal job exceeds retention
- **WHEN** cleanup prunes the detailed job record before the owner acknowledges its Agent completion
- **THEN** `list_agents` and `wait_agent` still expose a self-contained completion summary and explicitly mark detailed receipt availability

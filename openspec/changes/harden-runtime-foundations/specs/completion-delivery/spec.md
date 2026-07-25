## ADDED Requirements

### Requirement: Every terminal job emits one durable completion event
The runtime SHALL create exactly one root-owned completion event when a job first reaches completed, interrupted, failed, or cancelled state.

#### Scenario: Worker publishes terminal state
- **WHEN** a non-terminal job first commits a terminal transition
- **THEN** an idempotently keyed completion event is durably associated with that job and owner root

#### Scenario: Reconciliation sees an event after a crash
- **WHEN** a terminal job exists without its deterministic completion event
- **THEN** reconciliation appends the missing event once without duplicating an existing event

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
The runtime SHALL allow a caller to wait for a target job or the next root completion up to an explicit timeout, optionally confirm tokens from a prior response, and keep newly returned completion events unread until a later confirmation.

#### Scenario: Completion arrives during wait
- **WHEN** the target reaches a terminal state before the timeout
- **THEN** wait returns its durable completion event, terminal receipt, and delivery token without acknowledging it

#### Scenario: Wait times out
- **WHEN** no matching completion arrives before the deadline
- **THEN** wait returns a timeout receipt without changing job state or acknowledging future events

### Requirement: Proactive wakeup is not a local-runtime dependency
The local runtime SHALL NOT require a resident forwarding agent, background terminal, or unsupported host callback to preserve completion delivery.

#### Scenario: Codex task is inactive when Claude completes
- **WHEN** no Codex model turn is running at completion time
- **THEN** the durable unread event remains available for the next turn without keeping Claude resident

### Requirement: Unread completion survives normal job pruning
Unread completion metadata SHALL remain available even if its detailed terminal job receipt later exceeds the normal job-retention limit.

#### Scenario: Old unread job exceeds 100-job retention
- **WHEN** job cleanup prunes the detailed job record before the owner acknowledges its completion
- **THEN** the inbox still reports a self-contained completion summary and explicitly marks detailed result availability

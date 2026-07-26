## MODIFIED Requirements

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens` from a prior response, then report the oldest already-unread Agent-linked completion or wait for the next current-root Agent completion or safe progress activity up to `timeout_ms`. Every newly returned completion SHALL remain unread until its token is echoed in a later wait. Observation that finds no unread Agent-linked completion or only an already-frozen completion SHALL use the validated inbox snapshot without acquiring the persistence write lock or calling fsync. Reconciliation of an already-published immutable or acknowledged completion and an already-recorded Agent projection SHALL likewise remain observation-only. A complete wait that times out after all relevant completion, acknowledgement, Agent-projection, and progress-delivery facts are settled SHALL acquire no persistence lock, call no fsync, and write no durable state. First delivery of an unfrozen completion SHALL lock, reread, and durably freeze its public payload before returning. `list_agents` SHALL not participate in completion or progress delivery.

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

#### Scenario: Partial acknowledgement races a frozen batch snapshot
- **WHEN** a diagnostic multi-event snapshot is returned while another waiter has already acknowledged only its leading token prefix
- **THEN** a later acknowledgement treats that already-acknowledged prefix idempotently and advances only the exact oldest unread Agent-linked suffix without skipping an event

#### Scenario: Wait times out
- **WHEN** no current-root Agent produces new progress or completion activity before the deadline
- **THEN** wait returns a timeout receipt without changing Agent state or acknowledging future events

#### Scenario: Existing inbox remains quiet
- **WHEN** repeated wait polls find no unread Agent-linked completion in an existing validated inbox
- **THEN** each observation returns no completion without acquiring the inbox write lock, calling fsync, or changing durable state

#### Scenario: Settled terminal Agent remains quiet
- **WHEN** a terminal Agent has no unread completion because its completion is acknowledged, its Agent projection marker is already recorded, and no progress remains eligible before timeout
- **THEN** the complete wait call returns a timeout without acquiring a persistence lock, calling fsync, or writing durable state

#### Scenario: Registry finalization outruns its job marker
- **WHEN** recovery finds that the Agent registry already finalized a terminal job but that job lacks `agentProjectionReconciledAt`
- **THEN** reconciliation repairs the missing marker once so normal retention can prune the detailed job before later settled waits become observation-only

#### Scenario: Frozen completion is redelivered
- **WHEN** an unread Agent-linked completion already has an immutable first-delivery payload
- **THEN** wait returns the identical token and bounded payload from the validated snapshot without acquiring the inbox write lock or calling fsync

#### Scenario: Completion requires first-delivery freezing
- **WHEN** an unread Agent-linked completion has not been exposed before
- **THEN** wait acquires the inbox lock, rereads current state, durably freezes the public payload, and returns the resulting token and payload

#### Scenario: Missing completion requires repair
- **WHEN** reconciliation finds a terminal Agent job whose deterministic completion event is absent
- **THEN** it acquires the required persistence lock and durably appends the event before delivery

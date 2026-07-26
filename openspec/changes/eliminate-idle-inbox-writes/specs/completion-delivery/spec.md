## MODIFIED Requirements

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens` from a prior response, then report the oldest already-unread Agent-linked completion or wait for the next current-root Agent completion or safe progress activity up to `timeout_ms`. Every newly returned completion SHALL remain unread until its token is echoed in a later wait. Observation that finds no unread Agent-linked completion or only an already-frozen completion SHALL use the validated inbox snapshot without acquiring the persistence write lock or calling fsync. First delivery of an unfrozen completion SHALL lock, reread, and durably freeze its public payload before returning. `list_agents` SHALL not participate in completion or progress delivery.

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

#### Scenario: Existing inbox remains quiet
- **WHEN** repeated wait polls find no unread Agent-linked completion in an existing validated inbox
- **THEN** each observation returns no completion without acquiring the inbox write lock, calling fsync, or changing durable state

#### Scenario: Frozen completion is redelivered
- **WHEN** an unread Agent-linked completion already has an immutable first-delivery payload
- **THEN** wait returns the identical token and bounded payload from the validated snapshot without acquiring the inbox write lock or calling fsync

#### Scenario: Completion requires first-delivery freezing
- **WHEN** an unread Agent-linked completion has not been exposed before
- **THEN** wait acquires the inbox lock, rereads current state, durably freezes the public payload, and returns the resulting token and payload

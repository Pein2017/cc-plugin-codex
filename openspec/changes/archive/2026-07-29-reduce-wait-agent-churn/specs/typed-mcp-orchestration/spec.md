## MODIFIED Requirements

### Requirement: MCP call boundaries preserve asynchronous Agents and explicit joins
`spawn_agent` and an activating `followup_task` SHALL return after the existing durable background handoff rather than waiting for Claude completion. `wait_agent` SHALL remain a synchronous bounded observation that defaults to 600000 ms, accepts at most 3600000 ms, returns early for completion, and returns early for advisory progress only when the caller explicitly sets `wake_on_progress: true`. Cancelling the MCP request SHALL stop only the in-flight observation and SHALL NOT interrupt, cancel, archive, delete, or otherwise change the Agent.

#### Scenario: Spawn starts background work
- **WHEN** `spawn_agent` durably hands its prepared turn to a worker
- **THEN** the MCP call returns the existing Agent acknowledgement while Claude continues independently

#### Scenario: Wait observes completion early
- **WHEN** completion becomes eligible before the requested wait deadline
- **THEN** the MCP call returns the complete stored completion without waiting for the upper bound

#### Scenario: Wait explicitly observes progress early
- **WHEN** eligible progress becomes available before the requested wait deadline and `wake_on_progress: true`
- **THEN** the MCP call returns one safe progress update without changing the Agent turn

#### Scenario: Parent cancels a wait call
- **WHEN** Codex cancels an in-flight `wait_agent` MCP request
- **THEN** the observation exits promptly while the Agent and its active Claude turn remain unchanged

### Requirement: MCP transport timeout exceeds the public wait maximum
The Plugin MCP declaration SHALL configure an outer tool-call timeout of 3660 seconds while the runtime SHALL retain its 3600000 ms maximum observation bound. Neither timeout SHALL define or shorten Agent execution lifetime.

#### Scenario: Caller requests the maximum wait
- **WHEN** `wait_agent` receives `timeout_ms=3600000`
- **THEN** the runtime has a one-minute transport margin to return completion, explicitly requested progress, or timeout before Codex ends the MCP call

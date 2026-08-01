## RENAMED Requirements

- FROM: `### Requirement: MCP transport timeout exceeds the public wait maximum`
- TO: `### Requirement: MCP transport timeout exceeds the fixed model wait`

## MODIFIED Requirements

### Requirement: MCP call boundaries preserve asynchronous Agents and explicit joins
`spawn_agent` and an activating `followup_task` SHALL return after the existing durable background handoff rather than waiting for Claude completion. Model-facing `wait_agent` SHALL remain a synchronous bounded observation with a fixed 600000 ms upper bound, SHALL NOT expose per-call timeout selection, SHALL return early for completion, and SHALL return early for advisory progress only when the caller explicitly sets `wake_on_progress: true`. The checkout CLI and public runtime operation MAY retain explicit bounded timeout selection for operator diagnostics and tests. Cancelling the MCP request SHALL stop only the in-flight observation and SHALL NOT interrupt, cancel, archive, delete, or otherwise change the Agent.

#### Scenario: Spawn starts background work
- **WHEN** `spawn_agent` durably hands its prepared turn to a worker
- **THEN** the MCP call returns the existing Agent acknowledgement while Claude continues independently

#### Scenario: Wait observes completion early
- **WHEN** completion becomes eligible before the fixed model-facing wait deadline
- **THEN** the MCP call returns the complete stored completion without waiting for the upper bound

#### Scenario: Wait explicitly observes progress early
- **WHEN** eligible progress becomes available before the fixed model-facing wait deadline and `wake_on_progress: true`
- **THEN** the MCP call returns one safe progress update without changing the Agent turn

#### Scenario: Model supplies a timeout override
- **WHEN** a model-facing `wait_agent` request includes `timeout_ms`
- **THEN** the strict MCP schema rejects the unknown field without changing Agent, completion, or progress state

#### Scenario: Operator uses an explicit diagnostic timeout
- **WHEN** the checkout CLI or direct runtime test supplies a timeout within the retained 0..3600000 ms diagnostic bound
- **THEN** that non-MCP observation uses the requested bound without changing Agent execution lifetime

#### Scenario: Parent cancels a wait call
- **WHEN** Codex cancels an in-flight `wait_agent` MCP request
- **THEN** the observation exits promptly while the Agent and its active Claude turn remain unchanged

### Requirement: MCP transport timeout exceeds the fixed model wait
The Plugin MCP declaration SHALL configure an outer tool-call timeout greater than 600 seconds while the runtime SHALL retain its 3600000 ms maximum operator observation bound. Neither timeout SHALL define or shorten Agent execution lifetime.

#### Scenario: Model-facing wait reaches its upper bound
- **WHEN** no completion or explicitly eligible progress is available during the fixed 600000 ms model-facing wait
- **THEN** the MCP transport leaves sufficient margin for the runtime to return an honest timeout before Codex ends the tool call

#### Scenario: Caller requests the maximum wait
- **WHEN** a checkout CLI or runtime observation uses the retained 3600000 ms maximum
- **THEN** the declared transport timeout still leaves a margin for that non-MCP observation's own bound without shortening Agent execution lifetime

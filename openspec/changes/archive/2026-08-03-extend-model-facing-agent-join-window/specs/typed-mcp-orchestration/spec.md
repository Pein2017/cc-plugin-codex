## MODIFIED Requirements

### Requirement: MCP call boundaries preserve asynchronous Agents and explicit joins
`spawn_agent` and an activating `followup_task` SHALL return after the existing durable background handoff rather than waiting for Claude completion. Model-facing `wait_agent` SHALL remain a synchronous bounded observation with a fixed 3600000 ms upper bound injected behind its strict public schema, SHALL NOT expose per-call timeout selection, SHALL return early for completion, and SHALL return early for advisory progress only when the caller explicitly sets `wake_on_progress: true`. The checkout CLI and public runtime operation SHALL retain explicit bounded timeout selection for operator diagnostics and tests. Cancelling the MCP request SHALL stop only the in-flight observation and SHALL NOT interrupt, cancel, archive, delete, or otherwise change the Agent.

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
The Plugin MCP declaration SHALL configure an outer tool-call timeout greater than 3600 seconds while the runtime SHALL retain its 3600000 ms maximum operator observation bound. Neither timeout SHALL define or shorten Agent execution lifetime.

#### Scenario: Model-facing wait reaches its upper bound
- **WHEN** no completion or explicitly eligible progress is available during the fixed 3600000 ms model-facing wait
- **THEN** the MCP transport leaves sufficient margin for the runtime to return an honest timeout before Codex ends the tool call

#### Scenario: Caller requests the maximum wait
- **WHEN** a checkout CLI or runtime observation uses the retained 3600000 ms maximum
- **THEN** the declared transport timeout still leaves a margin for that non-MCP observation's own bound without shortening Agent execution lifetime

### Requirement: MCP wait guidance matches the fixed public schema
Model-facing tool descriptions, server instructions, Skills, and release smoke SHALL call `wait_agent` without a timeout argument and SHALL describe its fixed one-hour completion-first wait plus conditional completion-token acknowledgement. They SHALL distinguish `list_agents` as a logical state view rather than completion/progress delivery and SHALL prohibit list/history probes made solely after a quiet wait timeout.

#### Scenario: Paid smoke joins a test Agent
- **WHEN** the explicitly enabled Haiku/low release smoke waits for its Agent
- **THEN** it sends only arguments accepted by the current `wait_agent` schema

#### Scenario: Parent considers list after timeout
- **WHEN** an ordinary wait returns a quiet timeout and required Agent work remains unresolved
- **THEN** model-facing guidance directs another completion-first wait rather than `list_agents`, `read_agent_messages`, or unchanged-state narration

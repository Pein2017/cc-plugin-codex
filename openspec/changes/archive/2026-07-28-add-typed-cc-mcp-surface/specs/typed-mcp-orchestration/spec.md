## ADDED Requirements

### Requirement: Plugin exposes one typed CC MCP server
The installed Plugin SHALL declare one required local stdio MCP server named `cc_for_pein`. The server SHALL expose exactly `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, and `read_agent_messages`, with strict operation-specific input schemas and no generic command, terminal, job, cancellation, deletion, cross-root, or native-session tool.

#### Scenario: Codex loads the Plugin in a new task
- **WHEN** the selected Plugin MCP server initializes successfully
- **THEN** its tool catalog contains exactly the seven canonical snake_case operations

#### Scenario: Caller supplies an unknown field
- **WHEN** a tool call contains a field outside that operation's public schema
- **THEN** the call fails before durable runtime state changes

### Requirement: MCP calls bind only trusted Codex context
Every lifecycle tool call SHALL require a non-empty Codex `_meta.threadId` and a local `file:` workspace URI in `_meta["codex/sandbox-state-meta"].sandboxCwd`. The adapter SHALL use those values as the owner root and workspace and SHALL NOT accept their equivalents in tool arguments, process cwd, inherited stale identity, Plugin Cache paths, or Claude session identifiers.

#### Scenario: Trusted call context is complete
- **WHEN** Codex supplies a thread ID and local sandbox workspace URI
- **THEN** the adapter invokes the public runtime for that exact logical root and canonical workspace

#### Scenario: Root identity is absent
- **WHEN** `_meta.threadId` is missing or empty
- **THEN** the call fails before reading or mutating an Agent registry

#### Scenario: Workspace metadata is absent or non-local
- **WHEN** sandbox-state metadata is missing, malformed, non-file, or not convertible to a native local path
- **THEN** the call fails instead of using the MCP server process cwd or Plugin Cache root

### Requirement: MCP adapter preserves one lifecycle owner
The MCP server SHALL delegate every accepted call directly to the matching operation returned by checkout-owned `runtime/index.mjs`. It SHALL NOT persist or reconstruct Agents, jobs, mailboxes, completion cursors, Claude sessions, worker identities, or recovery state outside the existing runtime owners.

#### Scenario: MCP server restarts
- **WHEN** Codex restarts the stdio MCP process between lifecycle calls
- **THEN** subsequent calls recover entirely from existing durable runtime state without an MCP-local registry

### Requirement: MCP call boundaries preserve asynchronous Agents and explicit joins
`spawn_agent` and an activating `followup_task` SHALL return after the existing durable background handoff rather than waiting for Claude completion. `wait_agent` SHALL remain a synchronous bounded observation that defaults to 600000 ms, accepts at most 3600000 ms, and returns early for eligible progress or completion. Cancelling the MCP request SHALL stop only the in-flight observation and SHALL NOT interrupt, cancel, archive, delete, or otherwise change the Agent.

#### Scenario: Spawn starts background work
- **WHEN** `spawn_agent` durably hands its prepared turn to a worker
- **THEN** the MCP call returns the existing Agent acknowledgement while Claude continues independently

#### Scenario: Wait observes completion early
- **WHEN** completion becomes eligible before the requested wait deadline
- **THEN** the MCP call returns the complete stored completion without waiting for the upper bound

#### Scenario: Parent cancels a wait call
- **WHEN** Codex cancels an in-flight `wait_agent` MCP request
- **THEN** the observation exits promptly while the Agent and its active Claude turn remain unchanged

### Requirement: MCP transport timeout exceeds the public wait maximum
The Plugin MCP declaration SHALL configure an outer tool-call timeout of 3660 seconds while the runtime SHALL retain its 3600000 ms maximum observation bound. Neither timeout SHALL define or shorten Agent execution lifetime.

#### Scenario: Caller requests the maximum wait
- **WHEN** `wait_agent` receives `timeout_ms=3600000`
- **THEN** the runtime has a one-minute transport margin to return progress, completion, or timeout before Codex ends the MCP call

### Requirement: MCP receipts remain complete and structured
Successful MCP tools SHALL return the existing runtime receipt as structured content with a JSON text representation for protocol clients. Runtime validation, compatibility, subscription-limit, continuation, and recovery errors SHALL remain actionable while excluding arbitrary environment values, raw private state, and foreign-root evidence.

#### Scenario: Spawn succeeds
- **WHEN** the runtime returns a durable spawn receipt
- **THEN** the MCP result contains that receipt without inventing another Agent or terminal session identifier

#### Scenario: Runtime rejects a request
- **WHEN** an operation fails validation or reaches an actionable lifecycle boundary
- **THEN** the MCP call reports the sanitized runtime error and does not replace it with a generic success or fallback execution

### Requirement: Installed MCP bootstrap remains descriptor-only
The versioned Plugin snapshot SHALL contain only MCP discovery configuration and a bootstrap that validates and starts `/data/CoordExp/cc-plugin-codex/runtime/mcp-server.mjs` with the fixed checkout environment. It SHALL NOT import or execute an MCP lifecycle implementation from the Plugin Cache.

#### Scenario: Installed MCP server starts
- **WHEN** Codex launches the Plugin's stdio command from its installed snapshot
- **THEN** the bootstrap validates the canonical checkout and delegates the protocol stream to its MCP entrypoint

#### Scenario: Canonical checkout is unavailable
- **WHEN** the fixed checkout or its MCP entrypoint/config/manifest is missing or invalid
- **THEN** MCP startup fails closed without loading cached or upstream runtime code

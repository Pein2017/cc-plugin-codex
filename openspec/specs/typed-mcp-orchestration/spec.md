# typed-mcp-orchestration Specification

## Purpose

Define the typed Codex MCP transport for the seven checkout-owned CC Agent
operations without creating another lifecycle or session owner.
## Requirements
### Requirement: Plugin exposes one typed CC MCP server
The installed Plugin SHALL declare one required local stdio MCP server named `cc_for_pein`. The server SHALL expose exactly `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, and `read_agent_messages`, with strict operation-specific input schemas and no generic command, terminal, job, cancellation, deletion, cross-root, or native-session tool.

#### Scenario: Codex loads the Plugin in a new task
- **WHEN** the selected Plugin MCP server initializes successfully
- **THEN** its tool catalog contains exactly the seven canonical snake_case operations

#### Scenario: Caller supplies an unknown field
- **WHEN** a tool call contains a field outside that operation's public schema
- **THEN** the call fails before durable runtime state changes

### Requirement: Typed spawn schema exposes only lead decisions
The typed `spawn_agent` schema SHALL require `task_name`, `message`, exact supported `model`, and boolean `write`. It SHALL expose only optional `description`, `reasoning_effort`, `allowed_tools`, and `delegation_mode`. It SHALL reject `fork_turns`, `execution_profile`, working-directory, environment-file, native-session, permission-mode, and dangerous-bypass fields as unknown public inputs.

#### Scenario: Minimal read-only spawn is submitted
- **WHEN** Codex supplies task name, message, exact model, and `write: false`
- **THEN** typed validation accepts the request without requiring a fork or profile selector

#### Scenario: Legacy public selectors are submitted
- **WHEN** a caller supplies `fork_turns` or `execution_profile`
- **THEN** strict typed validation rejects the call before the runtime factory mutates state

#### Scenario: Delegation mode is omitted
- **WHEN** a valid spawn request supplies no `delegation_mode`
- **THEN** the runtime receives a leaf activation

### Requirement: Typed activation exposes one write intent
The typed `spawn_agent` tool SHALL require boolean `write` and `followup_task` SHALL expose optional boolean `write` for caller-owned mutation intent. False intent SHALL impose a prompt-level read/review boundary, true intent SHALL permit task-scoped mutation, and omitted follow-up intent SHALL inherit the Agent's latest activation authority. Both values SHALL use full-access terminal parity. The MCP adapter SHALL NOT expose an execution-profile selector, add a second permission switch, or reinterpret the field outside the checkout-owned runtime.

#### Scenario: Typed read activation is requested
- **WHEN** a caller passes `write: false` to spawn
- **THEN** the runtime activation uses terminal-parity dangerous permission bypass with a read-only behavioral delegation envelope

#### Scenario: Typed spawn omits write intent
- **WHEN** a caller omits `write` from spawn
- **THEN** typed validation rejects the request before durable runtime state changes

#### Scenario: Typed write activation is requested
- **WHEN** a caller passes `write: true`
- **THEN** the runtime activation uses terminal-parity dangerous permission bypass with task-scoped mutation authority

#### Scenario: Follow-up omits write intent
- **WHEN** an activating follow-up omits `write`
- **THEN** the runtime inherits the Agent's latest proven behavioral authority without exposing an execution profile

### Requirement: MCP annotations reflect reconciliation effects
MCP tool annotations SHALL describe observable runtime effects rather than treating logically observational output as proof of a zero-write implementation. `list_agents` SHALL advertise `readOnlyHint: false`, `destructiveHint: false`, and `idempotentHint: true` because it can persist convergent owner-scoped reconciliation repairs without consuming completion delivery.

#### Scenario: Host discovers list_agents
- **WHEN** Codex reads the typed tool catalog
- **THEN** `list_agents` is advertised as non-read-only, non-destructive, and idempotent

#### Scenario: Caller repeats list_agents
- **WHEN** no new lifecycle evidence appears between repeated calls
- **THEN** reconciliation converges on the same logical Agent projection without acknowledging completion delivery

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
The MCP server SHALL validate trusted Codex context and delegate every accepted call to the matching operation returned by checkout-owned `runtime/index.mjs` in a fresh isolated module graph. It SHALL NOT persist or reconstruct Agents, jobs, mailboxes, completion cursors, Claude sessions, worker identities, or recovery state outside the existing runtime owners. A test-only injected runtime factory MAY execute in-process without changing production behavior.

#### Scenario: Compatible runtime changes while MCP remains running
- **WHEN** a lifecycle implementation module changes without changing the public MCP API generation
- **THEN** the next operation runs in a fresh worker module graph and observes the compatible change

#### Scenario: MCP server restarts
- **WHEN** Codex restarts the stdio MCP process between lifecycle calls
- **THEN** subsequent calls recover entirely from existing durable runtime state without an MCP-local registry

#### Scenario: Public generation mismatch
- **WHEN** the current checkout generation differs from the MCP process generation
- **THEN** the worker returns `CC_MCP_RESTART_REQUIRED`, performs no lifecycle operation, and instructs the caller to run a versioned refresh and start a new Codex task

#### Scenario: Wait observation is cancelled
- **WHEN** Codex cancels an in-flight isolated `wait_agent` call
- **THEN** the worker observation receives an abort signal and exits without interrupting or deleting the Agent or its Claude turn

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

### Requirement: MCP receipts remain complete and structured
Successful MCP tools SHALL return the matching operation's complete bounded public runtime receipt as structured content with a JSON text representation for protocol clients. The MCP adapter SHALL NOT supplement a compact operation-specific receipt with internal Agent, message, job, steering, session, or persistence evidence. Runtime validation, compatibility, subscription-limit, continuation, and recovery errors SHALL remain actionable while excluding arbitrary environment values, raw private state, and foreign-root evidence.

#### Scenario: Spawn succeeds
- **WHEN** the runtime returns a durable spawn receipt
- **THEN** the MCP result contains that receipt without inventing another Agent or terminal session identifier

#### Scenario: Send succeeds with a compact receipt
- **WHEN** the runtime returns a bounded `send_message` receipt
- **THEN** the MCP result contains exactly that compact receipt in text and structured content without reconstructing the durable mailbox record

#### Scenario: Runtime rejects a request
- **WHEN** an operation fails validation or reaches an actionable lifecycle boundary
- **THEN** the MCP call reports the sanitized runtime error and does not replace it with a generic success or fallback execution

### Requirement: Installed MCP bootstrap remains descriptor-only
The Plugin snapshot SHALL declare an absolute canonical checkout bootstrap and working directory for the `cc_for_pein` stdio server. The snapshot SHALL contain a bootstrap for recent old-descriptor compatibility, but both descriptor routes SHALL validate and start `/data/CoordExp/cc-plugin-codex/runtime/mcp-server.mjs` with the fixed checkout environment. Neither route SHALL import or execute an MCP lifecycle implementation from the Plugin Cache.

#### Scenario: New task starts installed MCP server
- **WHEN** Codex launches the installed Plugin's stdio command
- **THEN** it invokes the canonical checkout bootstrap without resolving the process through the versioned Cache directory

#### Scenario: Older retained descriptor starts installed MCP server
- **WHEN** an existing task launches a relative bootstrap from a retained recent discovery shell
- **THEN** that descriptor-only bootstrap validates the canonical checkout and delegates the protocol stream to the checkout MCP entrypoint

#### Scenario: Canonical checkout is unavailable
- **WHEN** the fixed checkout or its MCP entrypoint/config/manifest is missing or invalid
- **THEN** MCP startup fails closed without loading cached or upstream runtime code

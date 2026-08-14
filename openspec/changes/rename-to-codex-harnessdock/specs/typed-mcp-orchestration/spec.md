## RENAMED Requirements

- FROM: `Plugin exposes one typed CC MCP server`
- TO: `Plugin exposes one typed HarnessDock MCP server`

## MODIFIED Requirements

### Requirement: Plugin exposes one typed HarnessDock MCP server
The installed Plugin SHALL declare one required local stdio MCP server named `codex_harnessdock`. The server SHALL expose exactly `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, and `read_agent_messages`, with strict operation-specific input schemas and no generic command, terminal, job, cancellation, deletion, cross-root, or native-session tool.

#### Scenario: Codex loads the Plugin in a new task
- **WHEN** the selected Plugin MCP server initializes successfully
- **THEN** its tool catalog contains exactly the seven canonical snake_case operations under the `codex_harnessdock` namespace

#### Scenario: Caller supplies an unknown field
- **WHEN** a tool call contains a field outside that operation's public schema
- **THEN** the call fails before durable runtime state changes

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
- **THEN** the worker returns `HARNESSDOCK_MCP_RESTART_REQUIRED`, performs no lifecycle operation, and instructs the caller to run a versioned refresh and start a new Codex task

#### Scenario: Wait observation is cancelled
- **WHEN** Codex cancels an in-flight isolated `wait_agent` call
- **THEN** the worker observation receives an abort signal and exits without interrupting or deleting the Agent or its Claude turn

### Requirement: Installed MCP bootstrap remains descriptor-only
The Plugin snapshot SHALL declare an absolute canonical checkout bootstrap and working directory for the `codex_harnessdock` stdio server. The current snapshot and any retained new-identity descriptor-only compatibility shell SHALL validate and start `/data/CoordExp/cc-plugin-codex/runtime/mcp-server.mjs` with the fixed checkout environment. A pre-cutover `cc_for_pein` descriptor MAY exist only inside the explicit rollback backup and SHALL NOT remain enabled or discoverable after acceptance. No route SHALL import or execute an MCP lifecycle implementation from the Plugin Cache.

#### Scenario: New task starts installed MCP server
- **WHEN** Codex launches the installed HarnessDock Plugin's stdio command
- **THEN** it invokes the canonical checkout `harnessdock-mcp.mjs` bootstrap without resolving the process through the versioned Cache directory

#### Scenario: Retained new-identity descriptor starts installed MCP server
- **WHEN** an existing post-cutover task launches a relative bootstrap from a retained recent HarnessDock discovery shell
- **THEN** that descriptor-only bootstrap validates the canonical checkout and delegates the protocol stream to the checkout MCP entrypoint

#### Scenario: Pre-cutover descriptor is observed after acceptance
- **WHEN** installed discovery still enables or advertises a `cc_for_pein` MCP descriptor
- **THEN** acceptance fails instead of treating that descriptor as a live compatibility alias

#### Scenario: Canonical checkout is unavailable
- **WHEN** the fixed checkout or its MCP entrypoint/config/manifest is missing or invalid
- **THEN** MCP startup fails closed without loading cached or upstream runtime code

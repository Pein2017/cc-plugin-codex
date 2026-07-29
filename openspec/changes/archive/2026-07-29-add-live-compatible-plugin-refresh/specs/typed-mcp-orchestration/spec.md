## MODIFIED Requirements

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

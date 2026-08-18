## MODIFIED Requirements

### Requirement: Installed MCP bootstrap remains descriptor-only
The Plugin snapshot SHALL declare an absolute canonical checkout bootstrap and working directory for the `codex_harnessdock` stdio server. The current snapshot and any retained new-identity descriptor-only compatibility shell SHALL validate and start `/data/CoordExp/codex-harnessdock/runtime/mcp-server.mjs` with the fixed checkout environment. A pre-cutover `cc_for_pein` descriptor MAY exist only inside the explicit rollback backup and SHALL NOT remain enabled or discoverable after acceptance. No route SHALL import or execute an MCP lifecycle implementation from the Plugin Cache.

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

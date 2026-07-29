## ADDED Requirements

### Requirement: Default release smoke costs no Claude model usage
The checkout SHALL provide a release smoke that verifies the enabled installed Plugin record, matching installed snapshot, exactly seven Skills, installed descriptor bootstrap startup, exactly seven MCP tools, and a successful isolated `list_agents` call. The default smoke SHALL NOT start a Codex or Claude model turn.

#### Scenario: Matching installation is ready
- **WHEN** the operator runs the default release smoke after local refresh
- **THEN** it exercises the installed snapshot and MCP protocol successfully without consuming Claude model quota

#### Scenario: Installed snapshot is stale
- **WHEN** installed version or discovery content differs from the checkout
- **THEN** the smoke fails before MCP execution and instructs the operator to refresh the local Plugin

### Requirement: Host-load smoke is isolated from production Agent state
The release smoke SHALL use a synthetic trusted root identity and temporary runtime home for its MCP call. It SHALL remove its temporary state after completion and SHALL NOT read, reconcile, acknowledge, interrupt, or modify production Agent state.

#### Scenario: Smoke calls list_agents
- **WHEN** the installed MCP bootstrap receives the synthetic task metadata
- **THEN** `list_agents` returns an empty isolated Agent view and production Plugin data remains unchanged

### Requirement: Paid smoke is explicit and fixed to Haiku low
An optional real-Claude extension SHALL require an explicit operator flag, SHALL announce `claude-haiku-4-5` with `low` effort before launch, SHALL use `write: false`, and SHALL run at most one bounded task. Subscription or quota exhaustion SHALL stop the paid smoke immediately.

#### Scenario: Real smoke is omitted
- **WHEN** the operator runs release smoke without the paid flag
- **THEN** no Claude model process is started

#### Scenario: Real smoke is requested
- **WHEN** the operator supplies the explicit paid flag
- **THEN** the smoke launches only one Haiku 4.5 low read-only turn and reports its terminal result

### Requirement: Release version has one manual source
`package.json` SHALL be the only manually maintained release base-version source. MCP server metadata and refreshed Plugin manifest base SHALL derive from it, while the Plugin manifest MAY append one Codex cachebuster suffix. Installation and release smoke SHALL fail when generated version expressions disagree.

#### Scenario: Package base version changes
- **WHEN** a maintainer updates the package version and refreshes the Plugin
- **THEN** MCP metadata and the Plugin manifest base report the new package version without another manual version edit

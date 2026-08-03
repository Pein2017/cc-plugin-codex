# plugin-release-readiness Specification

## Purpose

Define zero-model-cost installed Plugin acceptance and the explicitly paid Haiku release extension.

## Requirements

### Requirement: Default release smoke costs no Claude model usage
The checkout SHALL provide a release smoke that verifies the enabled current Plugin record, matching current installed snapshot, exactly seven Skills, an absolute canonical-checkout descriptor bootstrap, exactly seven MCP tools, and a successful isolated `list_agents` call through the production isolated runtime path. The smoke SHALL also verify that retained compatibility shells are discovery-only and bounded when present. The default smoke SHALL NOT start a Codex or Claude model turn.

#### Scenario: Matching installation is ready
- **WHEN** the operator runs the default release smoke after local refresh or versioned release
- **THEN** it exercises the installed snapshot and MCP protocol successfully without consuming Claude model quota

#### Scenario: Installed current snapshot is stale
- **WHEN** installed current version or discovery content differs from the checkout
- **THEN** the smoke fails before MCP execution and instructs the operator to run the appropriate local refresh

#### Scenario: Compatibility shell exists
- **WHEN** a retained non-current Plugin snapshot is present
- **THEN** the smoke confirms it is within the retention bound and its MCP route resolves executable lifecycle work only to the canonical checkout

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

### Requirement: Paid release smoke is schema-current and regression tested without Claude usage
The optional paid Haiku/low release smoke SHALL exercise the current public MCP argument schema, and the repository SHALL verify that loop with a fake transport that consumes no Claude model quota.

#### Scenario: Zero-cost paid-loop regression
- **WHEN** the repository test suite executes the paid-smoke control flow against a fake MCP transport
- **THEN** it verifies schema-current spawn, wait, completion, and cleanup behavior without launching Claude

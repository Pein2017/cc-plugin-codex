## MODIFIED Requirements

### Requirement: Default release smoke costs no Claude model usage
The checkout SHALL provide a release smoke that verifies the enabled current Plugin record, matching current installed snapshot, exactly seven Skills, an absolute canonical-checkout descriptor bootstrap, exactly seven MCP tools, and a successful isolated `list_agents` call through the production isolated runtime path. The smoke SHALL also verify that retained compatibility shells are discovery-only and bounded when present. The default smoke SHALL NOT start a Codex or Claude model turn.

#### Scenario: Matching installation is ready
- **WHEN** the operator runs the default release smoke after local refresh or versioned release
- **THEN** it exercises the current installed snapshot and MCP protocol successfully without consuming Claude model quota

#### Scenario: Installed current snapshot is stale
- **WHEN** installed current version or discovery content differs from the checkout
- **THEN** the smoke fails before MCP execution and instructs the operator to run the appropriate local refresh

#### Scenario: Compatibility shell exists
- **WHEN** a retained non-current Plugin snapshot is present
- **THEN** the smoke confirms it is within the retention bound and its MCP route resolves executable lifecycle work only to the canonical checkout

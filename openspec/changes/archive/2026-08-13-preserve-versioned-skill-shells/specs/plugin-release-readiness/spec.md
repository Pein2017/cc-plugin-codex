## MODIFIED Requirements

### Requirement: Default release smoke costs no Claude model usage
The checkout SHALL provide a release smoke that verifies the enabled current
Plugin record, matching current installed snapshot, exactly seven Skills, an
absolute canonical-checkout descriptor bootstrap, exactly seven MCP tools, and
a successful isolated `list_agents` call through the production isolated
runtime path. The smoke SHALL also verify that retained compatibility shells are
discovery-only and bounded, and that any known non-current predecessor from
successful-install coverage metadata is present in the restored Cache set. The
default smoke SHALL NOT start a Codex or Claude model turn.

#### Scenario: Matching installation is ready
- **WHEN** the operator runs the default release smoke after local refresh or versioned release
- **THEN** it exercises the installed snapshot and MCP protocol successfully without consuming Claude model quota

#### Scenario: Installed current snapshot is stale
- **WHEN** installed current version or discovery content differs from the checkout
- **THEN** the smoke fails before MCP execution and instructs the operator to run the appropriate local refresh

#### Scenario: Compatibility shell exists
- **WHEN** a retained non-current Plugin snapshot is present
- **THEN** the smoke confirms it is within the retention bound and its MCP route resolves executable lifecycle work only to the canonical checkout

#### Scenario: Known predecessor is missing from restored Cache
- **WHEN** successful-install coverage metadata names a previous non-current version but release smoke cannot resolve its valid restored discovery shell
- **THEN** the smoke fails with an actionable compatibility-repair result instead of accepting an empty shell set

#### Scenario: No predecessor has ever been recorded
- **WHEN** release smoke observes an explicit first-install or migration coverage state
- **THEN** it reports predecessor coverage as unavailable without claiming that older active-task Skill paths are protected


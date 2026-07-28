## RENAMED Requirements

- FROM: `### Requirement: Default terminal-parity profile launches Claude with full access`
- TO: `### Requirement: Default terminal-parity profile preserves native configuration with intent-bound permissions`

## MODIFIED Requirements

### Requirement: Default terminal-parity profile preserves native configuration with intent-bound permissions
The default terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, tools, and prompts while requiring the explicit supported model from `spawn_agent`. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR` and set `IS_SANDBOX=1`. It SHALL pass `--dangerously-skip-permissions` exactly when the activation has explicit `write: true`; false or omitted write intent SHALL omit that flag and leave permissions to native Claude configuration. It SHALL NOT add model fallback, effort, settings, tool, MCP, or prompt overrides that the caller did not request.

#### Scenario: Read-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model with false or omitted write intent
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, and the explicit model without `--dangerously-skip-permissions` or other implicit Claude policy overrides

#### Scenario: Write-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model and `write: true`
- **THEN** Claude additionally receives `--dangerously-skip-permissions` without other implicit Claude policy overrides

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal-parity leaves those native configuration sources enabled for both read and write intent rather than replacing them with runtime-owned settings

### Requirement: Dangerous permission bypass is constrained
The terminal-parity profile SHALL derive dangerous permission bypass from explicit write intent and SHALL NOT combine it with an explicit permission mode. An explicit dangerous-bypass request without write intent SHALL fail validation. The safe profile SHALL reject dangerous permission bypass.

#### Scenario: Terminal-parity read intent starts
- **WHEN** a caller starts an Agent with false or omitted write intent
- **THEN** the runtime selects terminal-parity without dangerous permission bypass

#### Scenario: Terminal-parity write intent starts
- **WHEN** a caller starts an Agent with `write: true`
- **THEN** the runtime selects terminal-parity and applies dangerous permission bypass

#### Scenario: Explicit bypass lacks write intent
- **WHEN** a terminal-parity caller requests dangerous permission bypass with false or omitted write intent
- **THEN** the runtime rejects the request before launching Claude

#### Scenario: Explicit permission mode conflicts with terminal parity
- **WHEN** a terminal-parity caller supplies an explicit permission mode
- **THEN** the runtime rejects the request before launching Claude

#### Scenario: Dangerous bypass is requested in safe mode
- **WHEN** a caller combines dangerous permission bypass with the safe profile
- **THEN** the runtime rejects the request before launching Claude

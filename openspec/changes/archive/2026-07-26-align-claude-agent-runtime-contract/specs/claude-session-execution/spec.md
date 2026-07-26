## MODIFIED Requirements

### Requirement: Safe execution profile applies explicit safeguards
The explicit opt-in safe profile SHALL apply the runtime-owned sandbox and permission policy and SHALL restrict tools for read-only work unless the caller supplies an explicit allowed-tool set. It SHALL still require the caller-selected supported model inherited from the Agent request.

#### Scenario: Read-only safe task starts
- **WHEN** a caller explicitly starts a safe task without write access or explicit allowed tools
- **THEN** Claude receives the read-only sandbox settings, bounded read-only tool policy, and caller-selected supported model

### Requirement: Dangerous permission bypass is constrained
The default terminal-parity profile SHALL always use dangerous permission bypass and SHALL NOT combine it with an explicit permission mode. The safe profile SHALL reject dangerous permission bypass.

#### Scenario: Default terminal-parity Agent starts
- **WHEN** a caller starts an Agent without selecting an execution profile
- **THEN** the runtime selects terminal-parity and applies dangerous permission bypass

#### Scenario: Explicit permission mode conflicts with terminal parity
- **WHEN** a terminal-parity caller supplies an explicit permission mode
- **THEN** the runtime rejects the request before launching Claude

#### Scenario: Dangerous bypass is requested in safe mode
- **WHEN** a caller combines dangerous permission bypass with the safe profile
- **THEN** the runtime rejects the request before launching Claude

## ADDED Requirements

### Requirement: Default terminal-parity profile launches Claude with full access
The default terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, tools, and prompts while requiring the explicit supported model from `spawn_agent`. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR`, set `IS_SANDBOX=1`, and pass `--dangerously-skip-permissions`. It SHALL NOT add model fallback, effort, settings, tool, MCP, or prompt overrides that the caller did not request.

#### Scenario: Default full-access Agent starts
- **WHEN** `spawn_agent` supplies a supported model and omits an execution profile
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, `--dangerously-skip-permissions`, and the explicit model without other implicit Claude policy overrides

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal-parity leaves those native configuration sources enabled rather than replacing them with runtime-owned settings

## REMOVED Requirements

### Requirement: Terminal-parity profile avoids implicit Claude policy overrides
**Reason**: Pein's native terminal launcher deliberately uses `IS_SANDBOX=1` and `--dangerously-skip-permissions`; permission bypass is now the default Claude child contract rather than an opt-in.

**Migration**: Callers that require sandboxing SHALL explicitly select the `safe` profile. Every caller SHALL explicitly choose Sonnet or Opus at spawn.

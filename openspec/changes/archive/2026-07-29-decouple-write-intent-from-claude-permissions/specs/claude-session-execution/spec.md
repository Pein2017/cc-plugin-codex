## MODIFIED Requirements

### Requirement: Runtime appends a bounded delegation envelope
Every public Claude turn SHALL receive a runtime-owned `--append-system-prompt` envelope without replacing Claude's native system prompt. The common envelope SHALL identify the turn as a bounded delegation from the Codex lead, preserve the supplied task/workspace boundary, state the current activation's write intent as a behavioral authority boundary, assign user-facing synthesis and final acceptance to Codex, and require one self-contained final result. False write intent SHALL forbid workspace and repository mutation even though terminal parity grants full Claude CLI authority; true write intent SHALL permit only task-scoped mutation. Leaf mode SHALL additionally forbid delegation and SHALL emit `--disallowedTools Agent`. Fable orchestrator mode SHALL omit that deny, permit only one native child generation, and require the parent to join and synthesize its children.

#### Scenario: Read-intent leaf turn starts
- **WHEN** an Agent activates in leaf mode with `write: false`
- **THEN** Claude receives the common read-only behavioral instruction and leaf instruction plus a hard native `Agent` tool denial

#### Scenario: Write-intent leaf turn starts
- **WHEN** an Agent activates in leaf mode with `write: true`
- **THEN** Claude receives task-scoped mutation authority and the leaf instruction plus a hard native `Agent` tool denial

#### Scenario: Fable orchestrator starts
- **WHEN** a `claude-fable-5` Agent activates in `claude_orchestrator` mode
- **THEN** Claude receives the current write-intent instruction and orchestrator instruction without the `Agent` tool denial

#### Scenario: Exact job reconnects
- **WHEN** transport recovery reconnects the same Agent job
- **THEN** the same delegation mode and write-intent envelope are reconstructed from that durable job evidence

#### Scenario: Follow-up changes write intent
- **WHEN** a follow-up activates the same Claude session with a new explicit write intent
- **THEN** the new job receives the envelope for the new intent without changing Agent or Claude session identity

#### Scenario: Native Claude customizations exist
- **WHEN** hooks, memories, skills, plugins, Serena MCP, or other native configuration is enabled
- **THEN** the runtime appends its bounded envelope rather than replacing or disabling Claude's native system and configuration sources

### Requirement: Default terminal-parity profile preserves native configuration with full access
The model-facing terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, and native tools while requiring the explicit supported model and explicit spawn write intent. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR`, set `IS_SANDBOX=1`, and pass `--dangerously-skip-permissions` for both false and true write intent. It SHALL NOT add model fallback, effort, settings, MCP, or replacement-system-prompt overrides. Its only implicit prompt/tool policy SHALL be the runtime-owned delegation envelope for the current write intent and, for leaf Agents, the hard native `Agent` denial.

#### Scenario: Read-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model with `write: false`
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, `--dangerously-skip-permissions`, the explicit model, and a read-only behavioral delegation envelope

#### Scenario: Write-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model and `write: true`
- **THEN** Claude receives the same full-access process envelope with task-scoped mutation authority in the delegation prompt

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal-parity leaves those native configuration sources enabled for both read and write intent rather than replacing them with runtime-owned settings

#### Scenario: Operator safe profile is selected
- **WHEN** an explicit operator/debug path selects the safe profile
- **THEN** safe behavior remains internal and is not exposed as a model-facing activation choice

### Requirement: Dangerous permission bypass is constrained
The terminal-parity profile SHALL always apply dangerous permission bypass and SHALL NOT combine it with an explicit permission mode. The safe profile SHALL reject dangerous permission bypass. Write intent SHALL NOT enable or disable the terminal-parity bypass.

#### Scenario: Terminal-parity read intent starts
- **WHEN** a caller starts an Agent with false write intent
- **THEN** the runtime selects terminal-parity with dangerous permission bypass and a read-only behavioral prompt

#### Scenario: Terminal-parity write intent starts
- **WHEN** a caller starts an Agent with `write: true`
- **THEN** the runtime selects terminal-parity with dangerous permission bypass and a task-scoped mutation prompt

#### Scenario: Explicit permission mode conflicts with terminal parity
- **WHEN** a terminal-parity caller supplies an explicit permission mode
- **THEN** the runtime rejects the request before launching Claude

#### Scenario: Dangerous bypass is requested in safe mode
- **WHEN** a caller combines dangerous permission bypass with the safe profile
- **THEN** the runtime rejects the request before launching Claude

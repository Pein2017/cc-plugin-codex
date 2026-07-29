## ADDED Requirements

### Requirement: Runtime appends a bounded delegation envelope
Every public Claude turn SHALL receive a runtime-owned `--append-system-prompt` envelope without replacing Claude's native system prompt. The common envelope SHALL identify the turn as a bounded delegation from the Codex lead, preserve the supplied task/workspace/authority boundary, assign user-facing synthesis and final acceptance to Codex, and require one self-contained final result. Leaf mode SHALL additionally forbid delegation and SHALL emit `--disallowedTools Agent`. Fable orchestrator mode SHALL omit that deny, permit only one native child generation, and require the parent to join and synthesize its children.

#### Scenario: Leaf turn starts
- **WHEN** any Agent activates in leaf mode
- **THEN** Claude receives the common and leaf appended instruction plus a hard native `Agent` tool denial

#### Scenario: Fable orchestrator starts
- **WHEN** a `claude-fable-5` Agent activates in `claude_orchestrator` mode
- **THEN** Claude receives the common and orchestrator appended instruction without the `Agent` tool denial

#### Scenario: Exact session resumes
- **WHEN** a follow-up or reconnect resumes an Agent's Claude session
- **THEN** the same immutable delegation envelope and tool boundary are reconstructed from durable Agent/job evidence

#### Scenario: Native Claude customizations exist
- **WHEN** hooks, memories, skills, plugins, Serena MCP, or other native configuration is enabled
- **THEN** the runtime appends its bounded envelope rather than replacing or disabling Claude's native system and configuration sources

## MODIFIED Requirements

### Requirement: Default terminal-parity profile preserves native configuration with intent-bound permissions
The model-facing terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, and native tools while requiring the explicit supported model and explicit spawn write intent. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR` and set `IS_SANDBOX=1`. It SHALL pass `--dangerously-skip-permissions` exactly when the activation has explicit or inherited `write: true`; false write intent SHALL omit that flag and leave permissions to native Claude configuration. It SHALL NOT add model fallback, effort, settings, MCP, or replacement-system-prompt overrides. Its only implicit prompt/tool policy SHALL be the immutable runtime-owned delegation envelope and, for leaf Agents, the hard native `Agent` denial.

#### Scenario: Read-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model with `write: false`
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, the explicit model, and delegation envelope without `--dangerously-skip-permissions`

#### Scenario: Write-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model and `write: true`
- **THEN** Claude additionally receives `--dangerously-skip-permissions` while retaining the delegation envelope

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal parity leaves those native configuration sources enabled for both read and write intent rather than replacing them with runtime-owned settings

#### Scenario: Operator safe profile is selected
- **WHEN** an explicit operator/debug path selects the safe profile
- **THEN** safe behavior remains internal and is not exposed as a model-facing activation choice

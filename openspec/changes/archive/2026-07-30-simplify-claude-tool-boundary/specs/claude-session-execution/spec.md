## MODIFIED Requirements

### Requirement: Runtime appends a bounded delegation envelope
Every public Claude turn SHALL receive a runtime-owned `--append-system-prompt` envelope without replacing Claude's native system prompt. The common envelope SHALL identify the turn as a bounded delegation from the Codex lead, preserve the supplied task/workspace boundary, state the current activation's write intent as a behavioral authority boundary, assign user-facing synthesis and final acceptance to Codex, require one self-contained final result, and instruct Claude to end the turn with the exact question and supporting evidence when progress requires a decision only the Codex lead or user can make. False write intent SHALL forbid workspace and repository mutation even though terminal parity grants full Claude CLI authority; true write intent SHALL permit only task-scoped mutation. Every mode SHALL emit a hard native `Workflow` denial. Leaf mode SHALL additionally forbid delegation and emit a hard native `Agent` denial. Fable orchestrator mode SHALL permit only one native `Agent` child generation and require the parent to join and synthesize its children.

#### Scenario: Read-intent leaf turn starts
- **WHEN** an Agent activates in leaf mode with `write: false`
- **THEN** Claude receives the common read-only behavioral instruction and leaf instruction plus hard native `Agent` and `Workflow` tool denials

#### Scenario: Write-intent leaf turn starts
- **WHEN** an Agent activates in leaf mode with `write: true`
- **THEN** Claude receives task-scoped mutation authority and the leaf instruction plus hard native `Agent` and `Workflow` tool denials

#### Scenario: Fable orchestrator starts
- **WHEN** a `claude-fable-5` Agent activates in `claude_orchestrator` mode
- **THEN** Claude receives the current write-intent instruction and orchestrator instruction with `Workflow` denied and `Agent` available

#### Scenario: Lead-owned decision blocks progress
- **WHEN** Claude cannot continue without a decision reserved to the Codex lead or user
- **THEN** the envelope instructs Claude to end the turn with the precise question and supporting evidence so the same session can receive a follow-up

#### Scenario: Exact job reconnects
- **WHEN** transport recovery reconnects the same Agent job
- **THEN** the same delegation mode, tool denials, and write-intent envelope are reconstructed from that durable job evidence

#### Scenario: Follow-up changes write intent
- **WHEN** a follow-up activates the same Claude session with a new explicit write intent
- **THEN** the new job receives the envelope for the new intent without changing Agent or Claude session identity

#### Scenario: Native Claude customizations exist
- **WHEN** hooks, memories, skills, plugins, Serena MCP, or other native configuration is enabled
- **THEN** the runtime appends its bounded envelope rather than replacing or disabling Claude's native system and configuration sources

### Requirement: Default terminal-parity profile preserves native configuration with full access
The model-facing terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, and native tools while requiring the explicit supported model and explicit spawn write intent. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR`, set `IS_SANDBOX=1`, and pass `--dangerously-skip-permissions` for both false and true write intent. It SHALL NOT add an allowed-tool list, model fallback, effort, settings, MCP, or replacement-system-prompt override. Its only implicit prompt/tool policy SHALL be the runtime-owned delegation envelope for the current write intent, the hard native `Workflow` denial for every Agent, and the additional hard native `Agent` denial for leaf Agents.

#### Scenario: Read-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model with `write: false`
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, `--dangerously-skip-permissions`, the explicit model, a read-only behavioral delegation envelope, and no allowed-tool list

#### Scenario: Write-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model and `write: true`
- **THEN** Claude receives the same full-access process envelope with task-scoped mutation authority and no allowed-tool list

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal-parity leaves those native configuration sources enabled for both read and write intent rather than replacing them with runtime-owned settings

#### Scenario: Fable orchestrator uses native subagents
- **WHEN** terminal parity activates an explicit Fable orchestrator
- **THEN** the profile denies `Workflow`, leaves `Agent` available, and applies no native tool allow-list

#### Scenario: Operator safe profile is selected
- **WHEN** an explicit operator/debug path selects the safe profile
- **THEN** safe behavior remains internal and is not exposed as a model-facing activation choice

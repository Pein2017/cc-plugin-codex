## MODIFIED Requirements

### Requirement: Claude-native delegation is explicit and bounded
Every Agent SHALL persist one immutable `delegation_mode` selected at spawn.
Omitted mode SHALL mean `leaf`. Every activation SHALL deny the native
`Workflow` tool and the reviewed high-blast-radius tools named by the active
execution policy. The Plugin SHALL describe unknown or prompt-only native
capabilities honestly rather than claim a universal machine/session sandbox.
Haiku SHALL be valid only as a `write: false` leaf scout. Sonnet SHALL be valid
only as a leaf worker. Exact Opus 5 and Fable 5 MAY be either leaf Agents or
explicit `claude_orchestrator` Native Agent Team leads. An orchestrator SHALL
enable the experimental native team transport for that Claude process and
SHALL fail observably rather than accept ordinary-subagent work as a native
team when the required native definitions or transport proof are unavailable.
Initialization names SHALL be treated only as necessary preconditions. The
Adapter SHALL translate Claude's versioned structured results into stable
internal facts: a named member SHALL launch asynchronously and a correlated
`SendMessage` to that launched member name SHALL succeed before transport is
live-validated. Because Claude does not expose the server-gate state at
initialization, one failed ordinary-subagent attempt MAY occur before evidence
is classified, but its result SHALL NOT be accepted as native-team task
completion. Any invalid
model, mode, or Haiku write combination SHALL fail before readiness, Agent
reservation, mailbox mutation, job preparation, or Claude launch. The public
seven-operation API and `delegation_mode` vocabulary SHALL remain unchanged.
The Plugin SHALL track only the durable parent CC Agent and SHALL instruct an
orchestrator to converge its native team and return one self-contained
synthesis.

#### Scenario: Ordinary Agent is spawned
- **WHEN** spawn omits `delegation_mode` for any valid supported model/write combination
- **THEN** the Agent is created as an immutable leaf and native `Agent`, `Workflow`, and cross-session communication tools are denied

#### Scenario: Opus orchestration is explicit
- **WHEN** spawn selects `claude-opus-5` with `delegation_mode=claude_orchestrator`
- **THEN** the Opus Agent may lead one bounded experimental Native Agent Team while remaining the only Agent represented in the CC registry

#### Scenario: Fable orchestration is explicit
- **WHEN** spawn selects `claude-fable-5` with `delegation_mode=claude_orchestrator`
- **THEN** the Fable Agent may lead one bounded experimental Native Agent Team while native `Workflow` remains denied

#### Scenario: Non-Fable orchestration is requested
- **WHEN** a model outside the exact Opus/Fable lead set, currently Haiku or Sonnet, is combined with `claude_orchestrator`
- **THEN** spawn fails synchronously with no readiness probe, durable mutation, or Claude process

#### Scenario: Native team surface is unavailable
- **WHEN** an otherwise valid orchestrator omits an injected definition at initialization, a named Agent does not launch asynchronously, or a correlated message to the launched name does not succeed
- **THEN** the turn fails with actionable Harness-incompatible evidence and does not accept the attempted work as native-team completion

#### Scenario: Sonnet orchestration is requested
- **WHEN** Sonnet is combined with `claude_orchestrator`
- **THEN** spawn fails synchronously with no readiness probe, durable mutation, or Claude process

#### Scenario: Haiku mutation or orchestration is requested
- **WHEN** Haiku is combined with `write: true` or `claude_orchestrator`
- **THEN** spawn fails synchronously before any durable state or Claude process exists

#### Scenario: Fable remains a leaf
- **WHEN** Fable is selected without `claude_orchestrator`
- **THEN** it remains a leaf for bounded decision, architecture, planning, or other explicitly assigned work

#### Scenario: Leaf allowlist grants Agent
- **WHEN** a leaf activation supplies the retired public `allowed_tools` field with an entry matching `Agent` or an `Agent(...)` permission pattern
- **THEN** the strict public surface rejects the request before readiness or durable mutation, while the leaf execution profile continues to hard-deny native `Agent`

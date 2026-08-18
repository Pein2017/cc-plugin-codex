## MODIFIED Requirements

### Requirement: Claude-native delegation is explicit and bounded
Every new Claude Agent SHALL persist immutable topology selected explicitly at spawn. `leaf` SHALL deny native `Agent`, `Workflow`, and the reviewed high-blast-radius tools. Exact Opus 5 and Fable 5 MAY use `native_orchestrator`; Haiku and Sonnet SHALL reject it. An orchestrator SHALL enable the experimental native team transport for that Claude process and SHALL fail observably rather than accept ordinary-subagent work as a native team when required definitions or transport proof are unavailable. The Plugin SHALL track only the durable parent Claude Agent and instruct it to return one self-contained synthesis. OpenCode SHALL admit only `leaf` and SHALL not project its task/subagent facilities as Plugin Agent communication.

#### Scenario: Claude leaf is spawned
- **WHEN** a supported Claude model is combined with explicit `topology=leaf`
- **THEN** native `Agent`, `Workflow`, and cross-session communication tools are denied

#### Scenario: Opus or Fable orchestration is explicit
- **WHEN** exact Opus 5 or Fable 5 is combined with `topology=native_orchestrator`
- **THEN** the Claude Agent may lead one bounded experimental Native Agent Team while remaining the only Agent in the Plugin registry

#### Scenario: Haiku or Sonnet orchestration is requested
- **WHEN** either model is combined with `native_orchestrator`
- **THEN** spawn fails before readiness, durable mutation, or native process

#### Scenario: OpenCode orchestration is requested
- **WHEN** the Explorer route is combined with `native_orchestrator`
- **THEN** spawn fails before session creation or model usage

### Requirement: All canonical Agent skills disclose Experimental status
Each of the eight model-visible HarnessDock Agent Skills and its discovery metadata SHALL identify the feature as Experimental and SHALL state that the local Plugin cannot automatically start a new Codex model turn after the parent has ended.

#### Scenario: A newly started Codex task discovers the plugin
- **WHEN** the eight Agent Skills are loaded from the installed local snapshot
- **THEN** every Skill is visibly Experimental without claiming automatic idle-parent wakeup or automatic route selection

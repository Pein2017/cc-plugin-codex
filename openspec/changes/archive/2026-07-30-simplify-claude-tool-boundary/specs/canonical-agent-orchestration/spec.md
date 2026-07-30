## MODIFIED Requirements

### Requirement: Claude-native delegation is explicit and bounded
Every Agent SHALL persist one immutable `delegation_mode` selected at spawn. Omitted mode SHALL mean `leaf`. Every activation SHALL deny the native `Workflow` tool. Only exact model `claude-fable-5` with explicit `claude_orchestrator` SHALL be permitted to use the native `Agent` tool. A non-Fable orchestrator request SHALL fail before readiness, Agent reservation, mailbox mutation, job preparation, or Claude launch. The Plugin SHALL track only the durable parent CC Agent and SHALL require an orchestrating Fable turn to join its one-generation native children and return one self-contained synthesis.

#### Scenario: Ordinary Agent is spawned
- **WHEN** spawn omits `delegation_mode` for any supported model
- **THEN** the Agent is created as an immutable leaf and native `Agent` and `Workflow` use are denied

#### Scenario: Fable orchestration is explicit
- **WHEN** spawn selects `claude-fable-5` with `delegation_mode=claude_orchestrator`
- **THEN** the Fable Agent may use Claude-native `Agent` subagents for one generation, native `Workflow` use is denied, and the Fable parent remains the only Agent represented in the CC registry

#### Scenario: Non-Fable orchestration is requested
- **WHEN** Haiku, Sonnet, or Opus is combined with `claude_orchestrator`
- **THEN** spawn fails synchronously with no readiness probe, durable mutation, or Claude process

#### Scenario: Leaf allowlist grants Agent
- **WHEN** a leaf activation supplies the retired public `allowed_tools` field with an entry matching `Agent` or an `Agent(...)` permission pattern
- **THEN** the strict public surface rejects the request before readiness or durable mutation, while the leaf execution profile continues to hard-deny native `Agent`

### Requirement: spawn_agent creates identity and starts the first turn
`spawn_agent` SHALL require canonical `task_name`, `message`, explicit supported `model`, and explicit boolean `write`. It SHALL accept only optional `description`, `reasoning_effort`, and `delegation_mode`; public `allowed_tools`, `fork_turns`, and `execution_profile` fields SHALL be absent and rejected. The runtime SHALL always use no Codex-history fork and the terminal-parity execution path. Before readiness, Agent creation, mailbox mutation, or job preparation, it SHALL synchronously validate the complete model, effort, delegation, and permission combination. On success it SHALL atomically reserve a root-unique Agent identity with the first-turn message as mailbox sequence one, then start its first internal Claude job from the ordered mailbox assignment. The model-facing Agent projection SHALL contain only stable Agent ID/path, selected model, immutable delegation mode, and bounded lifecycle status; workspace, native session/config, job-pointer, continuation, and mailbox internals SHALL remain outside ordinary model-facing Agent receipts.

#### Scenario: New Agent starts successfully
- **WHEN** the name is unique, model/mode/permission combination is valid, explicit write intent is present, and readiness passes
- **THEN** the call returns the stable Agent ID/path and a `starting` or `working` first-turn projection whose initial prompt is durably owned by the Agent mailbox

#### Scenario: Activation combination is invalid
- **WHEN** model, effort, delegation mode, or permission arguments are unsupported or incompatible
- **THEN** spawn fails synchronously before creating an Agent, mailbox entry, job, or steering record and no Claude process starts

#### Scenario: Removed public field is supplied
- **WHEN** spawn includes `allowed_tools`, `fork_turns`, or `execution_profile`
- **THEN** the strict public schema rejects the request without state mutation

#### Scenario: Write intent is omitted
- **WHEN** public spawn omits `write`
- **THEN** the request fails before readiness or Agent reservation instead of inferring mutation authority

#### Scenario: Foreign session adoption is requested
- **WHEN** spawn includes an existing Claude session ID
- **THEN** spawn rejects it because session adoption is deferred to a separate future OpenSpec

### Requirement: followup_task guarantees activation
`followup_task` SHALL make the message available to an active Agent promptly or start a new exact-session or receipt-proven safe-fresh turn when the Agent is terminal. It SHALL inherit the Agent's immutable delegation mode and SHALL reject any attempted mode override or retired `allowed_tools` field. Before any path that activates a new turn mutates the mailbox, job store, or steering state, it SHALL synchronously validate the complete inherited mode and requested effort and write intent. Activation SHALL atomically assign queued Agent-mailbox entries to the winning job.

#### Scenario: Agent is completed
- **WHEN** a valid follow-up is submitted to an owner-valid completed Agent
- **THEN** a new internal job starts on the Agent's exact Claude session, inherits its delegation mode, and consumes queued messages in order

#### Scenario: Activating follow-up has invalid execution options
- **WHEN** a terminal Agent receives a follow-up with an unsupported effort, permission combination, or delegation-mode override
- **THEN** follow-up fails before appending or assigning mailbox messages, preparing a job, or writing steering state

#### Scenario: Retired tool allow-list is supplied
- **WHEN** follow-up includes `allowed_tools`
- **THEN** follow-up rejects the retired field before mailbox mutation or activation

#### Scenario: Agent is already running
- **WHEN** follow-up is submitted during an active turn
- **THEN** the message is durably delivered at the next supported boundary without starting a competing job

#### Scenario: Errored first turn is safe to retry fresh
- **WHEN** the Agent has no session and its durable receipt proves no possible side effect
- **THEN** follow-up may start a fresh Claude session on the same stable Agent with the same delegation mode

#### Scenario: Errored Agent is activation-blocked
- **WHEN** neither exact-session resume nor receipt-proven safe fresh retry is available
- **THEN** follow-up is rejected with the blocking evidence

## ADDED Requirements

### Requirement: Claude-native delegation is explicit and bounded
Every Agent SHALL persist one immutable `delegation_mode` selected at spawn. Omitted mode SHALL mean `leaf`. Only exact model `claude-fable-5` with explicit `claude_orchestrator` SHALL be permitted to use Claude Code native subagents. A non-Fable orchestrator request or a leaf tool grant matching `Agent` or `Agent(...)` SHALL fail before readiness, Agent reservation, mailbox mutation, job preparation, or Claude launch. The Plugin SHALL track only the durable parent CC Agent and SHALL require an orchestrating Fable turn to join its one-generation native children and return one self-contained synthesis.

#### Scenario: Ordinary Agent is spawned
- **WHEN** spawn omits `delegation_mode` for any supported model
- **THEN** the Agent is created as an immutable leaf and native `Agent` use is denied

#### Scenario: Fable orchestration is explicit
- **WHEN** spawn selects `claude-fable-5` with `delegation_mode=claude_orchestrator`
- **THEN** the Fable Agent may use Claude-native one-generation subagents and remains the only Agent represented in the CC registry

#### Scenario: Non-Fable orchestration is requested
- **WHEN** Haiku, Sonnet, or Opus is combined with `claude_orchestrator`
- **THEN** spawn fails synchronously with no readiness probe, durable mutation, or Claude process

#### Scenario: Leaf allowlist grants Agent
- **WHEN** a leaf activation supplies an allowed-tool entry matching `Agent` or an `Agent(...)` permission pattern
- **THEN** activation fails before readiness or durable mutation instead of emitting contradictory tool policy

## MODIFIED Requirements

### Requirement: Spawn skill presents a concise acknowledgement by default
The `spawn-agent` skill SHALL receive only the bounded model-facing Agent projection containing stable Agent ID/path, selected model, immutable delegation mode, and bounded lifecycle status. It SHALL present one concise successful acknowledgement derived from the selected model, its configured relative capability/spend role, stable Agent path, and current status. The relative model ladder SHALL be identified as approximate Plugin guidance rather than exact pricing. It SHALL NOT print raw JSON or expose workspace, native session/config, job-pointer, continuation, or mailbox internals; deeper evidence SHALL use the operator diagnostics path. Actionable error or recovery information SHALL remain visible when spawn fails.

#### Scenario: Agent starts successfully
- **WHEN** `spawn-agent` receives a successful bounded runtime receipt
- **THEN** Codex reports the selected model, its concise role and relative tier within `Haiku < Sonnet < Opus < Fable`, Agent path, and current status without dumping JSON or internal state

#### Scenario: Deeper diagnostics are requested
- **WHEN** the user needs session, job, continuation, workspace, or mailbox evidence
- **THEN** the ordinary Agent receipt remains bounded and the operator diagnostics path is used instead

#### Scenario: Spawn fails or requires recovery
- **WHEN** spawn fails or reaches an actionable recovery condition
- **THEN** Codex reports the actionable condition instead of hiding it behind a generic concise success message

### Requirement: spawn_agent creates identity and starts the first turn
`spawn_agent` SHALL require canonical `task_name`, `message`, explicit supported `model`, and explicit boolean `write`. It SHALL accept only optional `description`, `reasoning_effort`, `allowed_tools`, and `delegation_mode`; public `fork_turns` and `execution_profile` fields SHALL be absent and rejected. The runtime SHALL always use no Codex-history fork and the terminal-parity execution path. Before readiness, Agent creation, mailbox mutation, or job preparation, it SHALL synchronously validate the complete model, effort, delegation, tool, and permission combination. On success it SHALL atomically reserve a root-unique Agent identity with the first-turn message as mailbox sequence one, then start its first internal Claude job from the ordered mailbox assignment. The model-facing Agent projection SHALL contain only stable Agent ID/path, selected model, immutable delegation mode, and bounded lifecycle status; workspace, native session/config, job-pointer, continuation, and mailbox internals SHALL remain outside ordinary model-facing Agent receipts.

#### Scenario: New Agent starts successfully
- **WHEN** the name is unique, model/mode/tool/permission combination is valid, explicit write intent is present, and readiness passes
- **THEN** the call returns the stable Agent ID/path and a `starting` or `working` first-turn projection whose initial prompt is durably owned by the Agent mailbox

#### Scenario: Activation combination is invalid
- **WHEN** model, effort, delegation mode, tool policy, or permission arguments are unsupported or incompatible
- **THEN** spawn fails synchronously before creating an Agent, mailbox entry, job, or steering record and no Claude process starts

#### Scenario: Removed public field is supplied
- **WHEN** spawn includes `fork_turns` or `execution_profile`
- **THEN** the strict public schema rejects the request without state mutation

#### Scenario: Write intent is omitted
- **WHEN** public spawn omits `write`
- **THEN** the request fails before readiness or Agent reservation instead of inferring mutation authority

#### Scenario: Foreign session adoption is requested
- **WHEN** spawn includes an existing Claude session ID
- **THEN** spawn rejects it because session adoption is deferred to a separate future OpenSpec

### Requirement: followup_task guarantees activation
`followup_task` SHALL make the message available to an active Agent promptly or start a new exact-session or receipt-proven safe-fresh turn when the Agent is terminal. It SHALL inherit the Agent's immutable delegation mode and SHALL reject any attempted mode override. Before any path that activates a new turn mutates the mailbox, job store, or steering state, it SHALL synchronously validate the complete inherited mode and requested effort, write, and allowed-tool options. Activation SHALL atomically assign queued Agent-mailbox entries to the winning job.

#### Scenario: Agent is completed
- **WHEN** a valid follow-up is submitted to an owner-valid completed Agent
- **THEN** a new internal job starts on the Agent's exact Claude session, inherits its delegation mode, and consumes queued messages in order

#### Scenario: Activating follow-up has invalid execution options
- **WHEN** a terminal Agent receives a follow-up with an unsupported effort, permission, tool combination, or delegation-mode override
- **THEN** follow-up fails before appending or assigning mailbox messages, preparing a job, or writing steering state

#### Scenario: Agent is already running
- **WHEN** follow-up is submitted during an active turn
- **THEN** the message is durably delivered at the next supported boundary without starting a competing job

#### Scenario: Errored first turn is safe to retry fresh
- **WHEN** the Agent has no session and its durable receipt proves no possible side effect
- **THEN** follow-up may start a fresh Claude session on the same stable Agent with the same delegation mode

#### Scenario: Errored Agent is activation-blocked
- **WHEN** neither exact-session resume nor receipt-proven safe fresh retry is available
- **THEN** follow-up is rejected with the blocking evidence

### Requirement: list_agents reports logical state and unread completions
`list_agents` SHALL accept only the canonical optional `path_prefix` and return every matching current-root logical Agent, including nonresident terminal history, as canonical `agent_name`, bounded `agent_status`, and immutable `delegation_mode` values. The model-facing status projection SHALL use only the string values `starting`, `working`, `completed`, `failed`, and `interrupted`, mapping durable `pending_init`, `running`, `completed`, `errored`, and `interrupted` respectively without renaming stored lifecycle facts. It SHALL NOT return completion-inbox records, delivery tokens, final output, reconciliation receipts, or storage metadata. Cross-root `--all` SHALL exist only in the separate operator CLI.

#### Scenario: Codex resumes after background completion
- **WHEN** the root later calls `list_agents`
- **THEN** it can discover the completed nonresident Agent with status `completed` and its immutable delegation mode without receiving final output

#### Scenario: Errored Agent is projected
- **WHEN** a durable Agent has internal lifecycle `errored`
- **THEN** the model-facing list reports `failed` while operator evidence retains the exact internal failure state

#### Scenario: Repeated list observes state only
- **WHEN** the root calls `list_agents` repeatedly
- **THEN** it receives the same logical status projection and does not read or acknowledge completion delivery

#### Scenario: Path prefix narrows the tree
- **WHEN** the caller supplies `path_prefix`
- **THEN** only current-root Agents whose stable paths match that prefix are returned

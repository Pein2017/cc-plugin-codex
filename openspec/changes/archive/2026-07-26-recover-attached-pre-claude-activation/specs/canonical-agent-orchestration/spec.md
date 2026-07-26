## MODIFIED Requirements

### Requirement: spawn_agent creates identity and starts the first turn
`spawn_agent` SHALL accept canonical `task_name`, `message`, explicit `fork_turns`, and explicit supported model fields. Before readiness, Agent creation, mailbox mutation, or job preparation, it SHALL synchronously validate the complete model, effort, execution-profile, and permission combination. On success it SHALL atomically reserve a root-unique Agent identity with the first-turn message as mailbox sequence one, then start its first internal Claude job from the ordered mailbox assignment using optional description, Claude effort, and execution-profile extensions. It SHALL accept only `fork_turns=none`; other Codex context-fork modes SHALL fail explicitly because they cannot be reproduced as native Claude session inheritance.

#### Scenario: New Agent starts successfully
- **WHEN** the name is unique, the complete execution profile is valid, `fork_turns=none`, and readiness passes
- **THEN** the call returns the stable Agent ID/path and a `pending_init` or `running` first-turn receipt whose initial prompt is durably owned by the Agent mailbox

#### Scenario: Execution profile is invalid
- **WHEN** model, effort, profile, or permission arguments are unsupported or incompatible
- **THEN** spawn fails synchronously before creating an Agent, mailbox entry, job, or steering record and no Claude process starts

#### Scenario: Unsupported context fork is requested
- **WHEN** `fork_turns` is `all` or a positive integer
- **THEN** spawn fails with an explicit cross-model context-inheritance limitation and does not inject Codex history into Claude

#### Scenario: Foreign session adoption is requested
- **WHEN** spawn includes an existing Claude session ID
- **THEN** spawn rejects it because session adoption is deferred to a separate future OpenSpec

### Requirement: followup_task guarantees activation
`followup_task` SHALL make the message available to an active Agent promptly or start a new exact-session or receipt-proven safe-fresh turn when the Agent is terminal. Before any path that activates a new turn mutates the mailbox, job store, or steering state, it SHALL synchronously validate the complete inherited and requested execution profile. Activation SHALL atomically assign queued Agent-mailbox entries to the winning job.

#### Scenario: Agent is completed
- **WHEN** a valid follow-up is submitted to an owner-valid completed Agent
- **THEN** a new internal job starts on the Agent's exact Claude session and consumes queued messages in order

#### Scenario: Activating follow-up has invalid execution options
- **WHEN** a terminal Agent receives a follow-up with an unsupported effort, profile, model, or permission combination
- **THEN** follow-up fails before appending or assigning mailbox messages, preparing a job, or writing steering state

#### Scenario: Agent is already running
- **WHEN** follow-up is submitted during an active turn
- **THEN** the message is durably delivered at the next supported boundary without starting a competing job

#### Scenario: Errored first turn is safe to retry fresh
- **WHEN** the Agent has no session and its durable receipt proves no possible side effect
- **THEN** follow-up may start a fresh Claude session on the same stable Agent

#### Scenario: Errored Agent is activation-blocked
- **WHEN** neither exact-session resume nor receipt-proven safe fresh retry is available
- **THEN** follow-up is rejected with the blocking evidence

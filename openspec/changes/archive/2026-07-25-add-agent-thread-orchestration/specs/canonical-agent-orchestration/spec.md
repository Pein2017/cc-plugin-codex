## ADDED Requirements

### Requirement: Public runtime exposes only six canonical lifecycle operations
The public runtime SHALL expose `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, and `list_agents` as its complete model-facing lifecycle surface.

#### Scenario: Public runtime is inspected
- **WHEN** a caller enumerates the frozen lifecycle interface
- **THEN** exactly the six canonical operations are present and old job-oriented operations are absent

### Requirement: Plugin skills map directly to the canonical operations
The installed plugin SHALL expose exactly `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, and `$cc-for-pein:list-agents`, each delegating to the matching checkout-owned snake_case runtime operation.

#### Scenario: Installed snapshot is verified after restart
- **WHEN** Codex reloads plugin version `0.2.0`
- **THEN** the six new skills are discoverable and none of the old lifecycle skills is discoverable

### Requirement: spawn_agent creates identity and starts the first turn
`spawn_agent` SHALL accept canonical `task_name`, `message`, and explicit `fork_turns` fields, atomically reserve a root-unique Agent identity, and start its first internal Claude job using optional description, Claude model/effort, and execution-profile extensions. It SHALL accept only `fork_turns=none`; other Codex context-fork modes SHALL fail explicitly because they cannot be reproduced as native Claude session inheritance.

#### Scenario: New Agent starts successfully
- **WHEN** the name is unique, `fork_turns=none`, and readiness passes
- **THEN** the call returns the stable Agent ID/path and a `pending_init` or `running` first-turn receipt

#### Scenario: Unsupported context fork is requested
- **WHEN** `fork_turns` is `all` or a positive integer
- **THEN** spawn fails with an explicit cross-model context-inheritance limitation and does not inject Codex history into Claude

#### Scenario: Foreign session adoption is requested
- **WHEN** spawn includes an existing Claude session ID
- **THEN** spawn rejects it because session adoption is deferred to a separate future OpenSpec

### Requirement: send_message never activates an idle Agent
`send_message` SHALL append to the Agent-level durable mailbox, deliver to an active Agent turn when possible, and leave the message queued without starting a new turn when the Agent is terminal.

#### Scenario: Agent is running
- **WHEN** a message is sent during an active Claude stream
- **THEN** it is delivered in durable order at the next supported stream boundary

#### Scenario: Agent is terminal
- **WHEN** a message is sent while no turn is active
- **THEN** it is retained as a `queued` Agent-mailbox entry with a `queued_no_turn` receipt and no Claude process starts

#### Scenario: Agent is activation-blocked
- **WHEN** an errored Agent has `continuation=blocked`
- **THEN** send rejects the message with the blocking evidence instead of queueing it indefinitely

### Requirement: followup_task guarantees activation
`followup_task` SHALL make the message available to an active Agent promptly or start a new exact-session or receipt-proven safe-fresh turn when the Agent is terminal. Activation SHALL atomically assign queued Agent-mailbox entries to the winning job.

#### Scenario: Agent is completed
- **WHEN** follow-up is submitted to an owner-valid completed Agent
- **THEN** a new internal job starts on the Agent's exact Claude session and consumes queued messages in order

#### Scenario: Agent is already running
- **WHEN** follow-up is submitted during an active turn
- **THEN** the message is durably delivered at the next supported boundary without starting a competing job

#### Scenario: Errored first turn is safe to retry fresh
- **WHEN** the Agent has no session and its durable receipt proves no possible side effect
- **THEN** follow-up may start a fresh Claude session on the same stable Agent

#### Scenario: Errored Agent is activation-blocked
- **WHEN** neither exact-session resume nor receipt-proven safe fresh retry is available
- **THEN** follow-up is rejected with the blocking evidence

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL first acknowledge only a valid oldest contiguous prefix from a prior response, then return the oldest unread current-root activity or block for the next activity. It SHALL NOT acknowledge newly returned events in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns it immediately with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous prefix
- **THEN** the cursor advances through that prefix before the runtime returns the next unread activity or waits

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait returns the mailbox activity receipt and makes the corresponding unread Agent completion available

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without current-root Agent activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

### Requirement: interrupt_agent ends only the current turn
`interrupt_agent` SHALL stop an Agent's active turn, preserve partial and exact-session evidence when safely available, and retain the logical Agent. Forced process termination SHALL default to errored/non-resumable unless a platform-specific receipt proves that Claude persisted a safe resume point.

#### Scenario: Graceful interruption proves resume safety
- **WHEN** graceful process interruption succeeds and the receipt proves an exact resumable session
- **THEN** the Agent becomes interrupted, no worker remains resident, and exact-session follow-up remains available

#### Scenario: Forced termination lacks flush evidence
- **WHEN** the runtime must forcibly terminate the process tree and cannot prove Claude flushed a resumable session
- **THEN** the Agent becomes errored and non-resumable with partial evidence retained

#### Scenario: Agent has no active turn
- **WHEN** interruption is requested for a terminal Agent
- **THEN** the runtime returns a no-active-turn receipt without changing Agent identity or history

### Requirement: list_agents reports logical state and unread completions
`list_agents` SHALL accept only the canonical optional `path_prefix` and return every matching current-root logical Agent, including nonresident terminal history, with descriptions, lifecycle/continuation states, active/latest job pointers, Claude session availability, and unread completion summaries without acknowledging them. Cross-root `--all` SHALL exist only in the separate operator CLI.

#### Scenario: Codex resumes after background completion
- **WHEN** the root later calls `list_agents`
- **THEN** it can discover the completed Agent and its unread result without remembering an internal job ID

#### Scenario: Repeated list reads the same unread completion
- **WHEN** the root calls `list_agents` repeatedly without a successful `wait_agent` consumption
- **THEN** the same unread completion remains visible and its acknowledgement cursor does not advance

#### Scenario: Path prefix narrows the tree
- **WHEN** the caller supplies `path_prefix`
- **THEN** only current-root Agents whose stable paths match that prefix are returned

### Requirement: No public cancellation operation exists
The model-facing runtime, CLI, and skill surfaces SHALL NOT expose `cancel`, `cancel_job`, or a destructive Agent deletion action.

#### Scenario: Caller requests legacy cancel
- **WHEN** an old cancel command or skill name is invoked after migration
- **THEN** it is rejected as removed and directs the caller to `interrupt_agent` without executing a compatibility alias

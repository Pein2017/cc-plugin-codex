# canonical-agent-orchestration Specification

## Purpose
Define the six canonical model-facing Agent operations and their exact mapping
to the checkout-owned CC for Pein plugin surface.
## Requirements
### Requirement: Public runtime exposes only six canonical lifecycle operations
The public runtime SHALL expose `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, and `list_agents` as its complete model-facing lifecycle surface.

#### Scenario: Public runtime is inspected
- **WHEN** a caller enumerates the frozen lifecycle interface
- **THEN** exactly the six canonical operations are present and old job-oriented operations are absent

### Requirement: Plugin skills map directly to the canonical operations
The installed plugin SHALL expose exactly `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, and `$cc-for-pein:list-agents`, each delegating to the matching checkout-owned snake_case runtime operation. All six SHALL be identified as Experimental and eligible for model-visible skill discovery in a newly started Codex task.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads plugin version `0.4.0`
- **THEN** all six Experimental lifecycle skills are present in the model-visible catalog and none of the old lifecycle skills is discoverable

### Requirement: Spawn skill presents a concise acknowledgement by default
The `spawn-agent` skill SHALL retain the complete runtime receipt for machine
reasoning while presenting only a concise successful acknowledgement derived
from the selected model, stable Agent path, and current status. It SHALL NOT print the complete
JSON receipt unless the user explicitly requests raw or debug output, and it
SHALL preserve actionable error or recovery information when spawn fails.

#### Scenario: Agent starts successfully
- **WHEN** `spawn-agent` receives a successful runtime receipt and the user did
  not request raw or debug output
- **THEN** Codex reports the selected model, Agent path, and current status without dumping the
  complete JSON receipt

#### Scenario: Raw receipt is explicitly requested
- **WHEN** the user explicitly requests raw or debug receipt output
- **THEN** Codex may present the complete runtime receipt

#### Scenario: Spawn fails or requires recovery
- **WHEN** the runtime receipt contains a spawn failure or actionable recovery
  condition
- **THEN** Codex reports the actionable condition instead of hiding it behind a
  generic concise success message

### Requirement: Real CC testing stops on account-limit exhaustion
The model-facing orchestration policy SHALL explicitly pass Haiku 4.5 with low effort for routine real Plugin smoke, hook, environment-parity, and integration witnesses unless the test specifically targets another model. The runtime SHALL NOT inject an omitted effort under `terminal-parity`. When Claude reports explicit subscription, usage, credit, weekly/monthly, or quota-limit exhaustion, the parent SHALL stop subsequent real CC test launches and SHALL NOT retry or fall back to another model. Local code work, fake-Claude fixtures, unit tests, and integration tests MAY continue.

#### Scenario: Routine Plugin smoke selects a model
- **WHEN** a real CC test needs only a protocol, hook, or environment witness
- **THEN** the parent explicitly selects `claude-haiku-4-5` with `low` effort rather than Sonnet or Opus

#### Scenario: Haiku test omits effort under terminal parity
- **WHEN** a direct runtime caller selects Haiku under `terminal-parity` without an effort argument
- **THEN** the runtime passes no effort override instead of silently injecting `low`

#### Scenario: Test specifically validates another model
- **WHEN** the test requirement is to prove Sonnet 5 or Opus 5 selection itself
- **THEN** the parent may launch that exact model instead of Haiku

#### Scenario: Claude reports subscription exhaustion
- **WHEN** a real CC test returns an explicit subscription, usage, credit, periodic, or quota-limit exhaustion
- **THEN** the parent reports the condition, starts no further real CC tests in that workflow, and does not substitute another model

#### Scenario: Local verification remains available
- **WHEN** real CC testing has stopped because of account-limit exhaustion
- **THEN** local edits, fake-Claude tests, and non-Claude integration verification may continue

### Requirement: Spawn skill uses exact Claude model and effort identifiers
The `spawn-agent` skill SHALL require an explicit model selection and SHALL pass model and effort as separate arguments. It SHALL support Sonnet 5 as `claude-sonnet-5` and Opus 5 as `claude-opus-5` for general delegation, plus Haiku 4.5 as `claude-haiku-4-5` only for Plugin smoke, hook, environment-parity, and integration testing. It SHALL NOT pass partial identifiers such as `sonnet-5`, `opus-5`, or `haiku-4-5`, and SHALL NOT silently substitute a different model after an availability or account-limit rejection.

#### Scenario: Public alias and effort are requested
- **WHEN** the user requests Opus 5 with x-high effort
- **THEN** the skill passes model `claude-opus-5` and reasoning effort `xhigh`
  as separate canonical arguments

#### Scenario: Orchestration label resembles a model version
- **WHEN** an `Ops5` substring appears only inside an Agent or task name
- **THEN** the skill does not infer any model argument from that label

#### Scenario: Sonnet is selected
- **WHEN** the user selects Sonnet or Sonnet 5
- **THEN** the skill passes the exact model ID `claude-sonnet-5`

#### Scenario: Haiku is selected for a test witness
- **WHEN** a Plugin smoke, hook, environment-parity, or integration test selects Haiku or Haiku 4.5
- **THEN** the skill passes exact model `claude-haiku-4-5` with `low` effort and identifies the selection as test-only

#### Scenario: Haiku is considered for general delegation
- **WHEN** the requested work is architecture, research judgment, production implementation, or another non-test delegation
- **THEN** the skill does not recommend Haiku and requires Sonnet 5 or Opus 5 instead

#### Scenario: Requested model is unavailable
- **WHEN** Claude Code rejects the requested model for the active account
- **THEN** the skill reports the rejection and does not retry under another model

#### Scenario: Another available Claude model is requested
- **WHEN** spawn explicitly requests Fable, an older Haiku/Sonnet/Opus, or any model other than `claude-haiku-4-5`, `claude-sonnet-5`, and `claude-opus-5`
- **THEN** the runtime rejects the model before launching Claude

#### Scenario: No model is explicitly selected
- **WHEN** spawn omits a model under either execution profile
- **THEN** the runtime rejects the request before creating an Agent reservation or launching Claude

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

### Requirement: Legacy Agent model migration is evidence-only and recoverable
A pre-v0.3 Agent without `selectedModel` SHALL be backfilled only from an exact supported model proven by a retained runtime receipt or a bounded read of its own Claude session artifact. Dated artifact evidence matching the verified Haiku 4.5 family SHALL normalize to canonical `claude-haiku-4-5`; arbitrary dated public requests SHALL remain unsupported. Reconciliation SHALL index pending session artifacts once per Claude config root rather than rescan the full history per Agent. It SHALL defer an evidence-free active turn. It SHALL preserve identity and history while blocking terminal continuation when the model is unsupported or not yet proven, SHALL retry a directly located unproven artifact, and SHALL never infer or substitute a supported model.

#### Scenario: Pruned job has a supported Claude artifact
- **WHEN** a terminal legacy Agent has no retained job but its bound Claude session artifact proves `claude-sonnet-5`, `claude-opus-5`, canonical `claude-haiku-4-5`, or a dated `claude-haiku-4-5-YYYYMMDD` backend
- **THEN** the runtime persists the exact canonical selected model and preserves exact-session continuation

#### Scenario: Historical model is unsupported
- **WHEN** retained evidence proves that a legacy Agent ran an older or otherwise unsupported model
- **THEN** continuation is blocked with the observed model recorded, while Agent identity and Claude history remain intact

#### Scenario: Active legacy model is not yet observable
- **WHEN** a legacy Agent still has an active turn and no exact model evidence is available
- **THEN** migration persists a non-blocking pending marker and direct artifact candidate without changing the active continuation mode or repeatedly scanning the full history tree

#### Scenario: Terminal model evidence arrives after an unproven block
- **WHEN** a terminal legacy Agent was blocked because its artifact had no model evidence and that same artifact later proves a supported exact model
- **THEN** reconciliation persists the canonical model and restores exact-session continuation

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

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL default its observation upper bound to 600000 ms, SHALL reject values above 3600000 ms, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include a bounded completion handoff and opaque delivery token; a progress update SHALL include only the safe public-progress projection when its adaptive delivery interval is eligible. It SHALL omit raw inbox state, full Agent records, full final output, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one bounded status/summary/completion-handoff update with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous completion prefix
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent publishes progress
- **WHEN** any current-root Agent publishes safe progress before timeout and no completion is unread
- **THEN** wait reports one bounded progress update without returning Claude text or tool inputs

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait reports completion activity with the bounded handoff rather than the full Agent final message

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without new current-root Agent progress or completion activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

#### Scenario: Caller omits timeout
- **WHEN** the parent calls wait without `timeout_ms`
- **THEN** the observation deadline is 600000 ms while eligible progress or completion may return earlier

#### Scenario: Caller exceeds the maximum
- **WHEN** the parent requests `timeout_ms` greater than 3600000
- **THEN** wait rejects the invalid bound before changing Agent or delivery state

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
`list_agents` SHALL accept only the canonical optional `path_prefix` and return every matching current-root logical Agent, including nonresident terminal history, as canonical `agent_name` and bounded `agent_status` values. It SHALL NOT return completion-inbox records, delivery tokens, final output, reconciliation receipts, or storage metadata. Cross-root `--all` SHALL exist only in the separate operator CLI.

#### Scenario: Codex resumes after background completion
- **WHEN** the root later calls `list_agents`
- **THEN** it can discover the completed nonresident Agent with `completed: null` without receiving its final output

#### Scenario: Repeated list observes state only
- **WHEN** the root calls `list_agents` repeatedly
- **THEN** it receives the same logical status projection and does not read or acknowledge completion delivery

#### Scenario: Path prefix narrows the tree
- **WHEN** the caller supplies `path_prefix`
- **THEN** only current-root Agents whose stable paths match that prefix are returned

### Requirement: No public cancellation operation exists
The model-facing runtime, CLI, and skill surfaces SHALL NOT expose `cancel`, `cancel_job`, or a destructive Agent deletion action.

#### Scenario: Caller requests legacy cancel
- **WHEN** an old cancel command or skill name is invoked after migration
- **THEN** it is rejected as removed and directs the caller to `interrupt_agent` without executing a compatibility alias

### Requirement: All canonical Agent skills disclose Experimental status
Each of the six model-visible CC Agent skills and its discovery metadata SHALL identify the feature as Experimental and SHALL state that the local plugin cannot automatically start a new Codex model turn after the parent has ended.

#### Scenario: A newly started Codex task discovers the plugin
- **WHEN** the six Agent skills are loaded from the installed local snapshot
- **THEN** every skill is visibly described as Experimental without claiming automatic idle-parent wakeup

### Requirement: Parent orchestration uses explicit join policy
The spawn and wait skill contracts SHALL require the parent to classify delegated work as required, parallel-then-join, or explicitly detached. The parent SHALL NOT give its final answer while a required or parallel-then-join result remains undisposed, SHALL continue meaningful non-overlapping work before waiting when possible, and SHALL use detached mode only when the user clearly requests background execution and the result is not needed in the current answer.

#### Scenario: Child result is required evidence
- **WHEN** the parent's conclusion depends on a spawned Agent's result
- **THEN** the parent waits for and synthesizes that completion before giving its final answer

#### Scenario: Independent parent work remains
- **WHEN** a spawned Agent can run concurrently with meaningful non-overlapping parent work
- **THEN** the parent performs that work before joining rather than immediately polling by reflex

#### Scenario: User explicitly requests background execution
- **WHEN** the user asks to detach work whose result is not needed for the current answer
- **THEN** the parent may end after reporting the durable Agent identity and the lack of automatic host reactivation

### Requirement: Completed results use the completion handoff
When `wait_agent` returns a completion handoff, the parent SHALL synthesize it directly and SHALL NOT start a follow-up turn or ask the Agent to write a temporary file solely to recover the already-completed result.

#### Scenario: Required Agent completes
- **WHEN** wait returns a bounded completion handoff for required work
- **THEN** the parent uses that handoff for disposition and synthesis without a result-recovery follow-up

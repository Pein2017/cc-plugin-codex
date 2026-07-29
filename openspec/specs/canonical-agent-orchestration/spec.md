# canonical-agent-orchestration Specification

## Purpose
Define the seven canonical model-facing Agent operations and their exact mapping
to the checkout-owned CC for Pein plugin surface.
## Requirements
### Requirement: Plugin skills map directly to the canonical operations
The installed Plugin SHALL expose exactly `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, `$cc-for-pein:list-agents`, and `$cc-for-pein:read-agent-messages` as Experimental orchestration guidance for the matching `mcp__cc_for_pein__spawn_agent`, `mcp__cc_for_pein__send_message`, `mcp__cc_for_pein__followup_task`, `mcp__cc_for_pein__wait_agent`, `mcp__cc_for_pein__interrupt_agent`, `mcp__cc_for_pein__list_agents`, and `mcp__cc_for_pein__read_agent_messages` typed tools. Each MCP tool SHALL delegate to the matching checkout-owned snake_case runtime operation. All seven skills and tools SHALL be eligible for model-visible discovery in a newly started Codex task. Skills SHALL NOT silently substitute shell execution when the typed server is unavailable; the checkout CLI remains an operator/debug fallback.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads Plugin version `0.4.0`
- **THEN** all seven Experimental Agent skills and all seven typed Agent tools are present in the model-visible catalog, none of the old lifecycle skills is discoverable, and ordinary lifecycle calls require no shell command

#### Scenario: Typed MCP server is unavailable
- **WHEN** a model-facing lifecycle operation cannot resolve its matching MCP tool
- **THEN** the skill reports the Plugin discovery or startup failure instead of silently invoking the checkout CLI

### Requirement: Model-facing activation selects write intent deliberately
The `spawn-agent` skill SHALL classify each requested turn as read/review or authorized mutation and SHALL pass `write: false` or `write: true` explicitly to the typed tool. The `followup-task` skill SHALL explain that omitted write intent inherits the Agent's latest activation and SHALL pass an explicit value whenever the requested follow-up changes that authority. The skills SHALL identify `write: true` as the condition that enables terminal-parity dangerous permission bypass and SHALL NOT describe false or omitted intent as an OS-enforced read-only sandbox.

#### Scenario: Parent delegates a read-only audit
- **WHEN** the requested Agent should inspect or advise without repository mutation
- **THEN** `spawn-agent` passes `write: false` and explains that native Claude permissions remain authoritative

#### Scenario: Parent delegates authorized implementation
- **WHEN** the requested Agent is authorized to modify the workspace
- **THEN** `spawn-agent` passes `write: true` and terminal-parity may use dangerous permission bypass

#### Scenario: Follow-up changes authority
- **WHEN** a follow-up changes from read/review work to authorized mutation or from mutation to read/review work
- **THEN** `followup-task` passes the new explicit write intent rather than inheriting the previous one

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

### Requirement: Real CC testing stops on account-limit exhaustion
The model-facing orchestration policy SHALL explicitly pass Haiku 4.5 with low effort for routine real Plugin smoke, hook, environment-parity, and integration witnesses unless the test specifically targets another model. Haiku SHALL remain fully available for non-test work and all supported effort values. The runtime SHALL NOT inject an omitted effort under `terminal-parity`. When Claude reports explicit subscription, usage, credit, weekly/monthly, or quota-limit exhaustion, the parent SHALL stop subsequent real CC test launches and SHALL NOT retry or fall back to another model. Local code work, fake-Claude fixtures, unit tests, and integration tests MAY continue.

#### Scenario: Routine Plugin smoke selects a model
- **WHEN** a real CC test needs only a protocol, hook, or environment witness
- **THEN** the parent explicitly selects `claude-haiku-4-5` with `low` effort rather than spending Sonnet, Opus, or Fable capacity

#### Scenario: Haiku test omits effort under terminal parity
- **WHEN** a direct runtime caller selects Haiku under `terminal-parity` without an effort argument
- **THEN** the runtime passes no effort override instead of silently injecting `low`

#### Scenario: Test specifically validates another model
- **WHEN** the test requirement is to prove another exact model selection itself
- **THEN** the parent may launch that exact supported model instead of Haiku

#### Scenario: Claude reports subscription exhaustion
- **WHEN** a real CC test returns an explicit subscription, usage, credit, periodic, or quota-limit exhaustion
- **THEN** the parent reports the condition, starts no further real CC tests in that workflow, and does not substitute another model

#### Scenario: Local verification remains available
- **WHEN** real CC testing has stopped because of account-limit exhaustion
- **THEN** local edits, fake-Claude tests, and non-Claude integration verification may continue

### Requirement: Spawn skill uses exact Claude model and effort identifiers
The `spawn-agent` skill SHALL require an explicit model selection and SHALL pass model and effort as separate arguments. It SHALL support Haiku 4.5 as `claude-haiku-4-5`, Sonnet 5 as `claude-sonnet-5`, Opus 5 as `claude-opus-5`, and Fable 5 as `claude-fable-5`. All four models SHALL accept each exact effort value `low`, `medium`, `high`, `xhigh`, and `max`. The skill SHALL present the approximate relative capability/spend ladder `Haiku < Sonnet < Opus < Fable`, recommend Sonnet for balanced general coding, Opus for deeper or higher-risk work, and Fable primarily for core decision discussion and planning rather than routine code writing. It SHALL NOT pass partial identifiers such as `sonnet-5`, `opus-5`, `haiku-4-5`, or `fable-5`, and SHALL NOT silently substitute a different model after an availability or account-limit rejection.

#### Scenario: Public alias and effort are requested
- **WHEN** the user requests Opus 5 with x-high effort
- **THEN** the skill passes model `claude-opus-5` and reasoning effort `xhigh`
  as separate canonical arguments

#### Scenario: Every model accepts every effort
- **WHEN** spawn selects any supported model with any of `low`, `medium`, `high`, `xhigh`, or `max`
- **THEN** the runtime forwards that exact canonical model and effort combination to Claude

#### Scenario: Orchestration label resembles a model version
- **WHEN** an `Ops5` substring appears only inside an Agent or task name
- **THEN** the skill does not infer any model argument from that label

#### Scenario: Sonnet is selected
- **WHEN** the user selects Sonnet or Sonnet 5
- **THEN** the skill passes the exact model ID `claude-sonnet-5`

#### Scenario: Haiku is selected
- **WHEN** the user selects Haiku or Haiku 4.5 for either test or general work
- **THEN** the skill passes the exact model ID `claude-haiku-4-5` and accepts the caller-selected supported effort

#### Scenario: Fable is selected for a core decision
- **WHEN** the user selects Fable for core decision discussion or planning
- **THEN** the skill passes the exact model ID `claude-fable-5` and reports it as the highest relative capability/spend tier

#### Scenario: Fable is considered for routine coding
- **WHEN** the parent is choosing a model for ordinary code implementation without an explicit Fable request
- **THEN** the skill recommends Sonnet or Opus instead of spending Fable capacity

#### Scenario: Requested model is unavailable
- **WHEN** Claude Code rejects the requested model for the active account
- **THEN** the skill reports the rejection and does not retry under another model

#### Scenario: Another available Claude model is requested
- **WHEN** spawn explicitly requests an older, dated, partial, or otherwise available model outside `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`, and `claude-fable-5`
- **THEN** the runtime rejects the model before launching Claude

#### Scenario: No model is explicitly selected
- **WHEN** spawn omits a model under either execution profile
- **THEN** the runtime rejects the request before creating an Agent reservation or launching Claude

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

### Requirement: Legacy Agent model migration is evidence-only and recoverable
A pre-v0.3 Agent without `selectedModel` SHALL be backfilled only from an exact supported model proven by a retained runtime receipt or a bounded read of its own Claude session artifact. Dated artifact evidence matching the verified Haiku 4.5 family SHALL normalize to canonical `claude-haiku-4-5`; arbitrary dated public requests SHALL remain unsupported. Reconciliation SHALL index pending session artifacts once per Claude config root rather than rescan the full history per Agent. It SHALL defer an evidence-free active turn. It SHALL preserve identity and history while blocking terminal continuation when the model is unsupported or not yet proven, SHALL retry a directly located unproven artifact, and SHALL never infer or substitute a supported model.

#### Scenario: Pruned job has a supported Claude artifact
- **WHEN** a terminal legacy Agent has no retained job but its bound Claude session artifact proves `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`, `claude-fable-5`, or a dated `claude-haiku-4-5-YYYYMMDD` backend
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

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL default its observation upper bound to 600000 ms, SHALL reject values above 3600000 ms, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. Model-facing guidance SHALL make omission of `timeout_ms` the canonical ordinary wait invocation and SHALL reserve an explicit bound for an intentional immediate probe, shorter observation window, or longer bounded wait. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include the complete stored Agent final message, its legacy-compatible truncation flag, and opaque delivery token; a progress update SHALL include only the safe bounded public-progress projection when its adaptive delivery interval is eligible. It SHALL omit raw inbox state, full Agent records, result pointers, native session evidence, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one status/summary/complete-final-message update with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous completion prefix
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent publishes progress
- **WHEN** any current-root Agent publishes safe progress before timeout and no completion is unread
- **THEN** wait reports one bounded progress update without returning Claude text or tool inputs

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait reports completion activity with the complete stored Agent final message

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without new current-root Agent progress or completion activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

#### Scenario: Ordinary caller omits timeout
- **WHEN** the parent performs an ordinary wait without a specific scheduling deadline
- **THEN** model-facing guidance omits `timeout_ms` and the observation deadline is 600000 ms while eligible progress or completion may return earlier

#### Scenario: Caller intentionally overrides timeout
- **WHEN** the parent needs an immediate probe, shorter observation window, or longer bounded wait
- **THEN** it may pass an explicit `timeout_ms` without changing Agent execution lifetime

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

### Requirement: No public cancellation operation exists
The model-facing runtime, CLI, and skill surfaces SHALL NOT expose `cancel`, `cancel_job`, or a destructive Agent deletion action.

#### Scenario: Caller requests legacy cancel
- **WHEN** an old cancel command or skill name is invoked after migration
- **THEN** it is rejected as removed and directs the caller to `interrupt_agent` without executing a compatibility alias

### Requirement: All canonical Agent skills disclose Experimental status
Each of the seven model-visible CC Agent skills and its discovery metadata SHALL identify the feature as Experimental and SHALL state that the local plugin cannot automatically start a new Codex model turn after the parent has ended.

#### Scenario: A newly started Codex task discovers the plugin
- **WHEN** the seven Agent skills are loaded from the installed local snapshot
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
When `wait_agent` returns a completion update, the parent SHALL synthesize its complete final message directly and SHALL NOT start a follow-up turn, read history, or ask the Agent to write a temporary file solely to recover that current completed result. `read_agent_messages` SHALL be reserved for retrospective access to earlier native messages or explicit recovery investigation.

#### Scenario: Required Agent completes
- **WHEN** wait returns a complete final message for required work
- **THEN** the parent uses that message for disposition and synthesis without a result-recovery follow-up or history read

#### Scenario: Parent needs an older Agent message
- **WHEN** the current completion is already disposed or the requested evidence belongs to an earlier Agent turn
- **THEN** the parent may use `read_agent_messages` on the same exact Agent without activating Claude

### Requirement: read_agent_messages provides root-scoped retrospective access
`read_agent_messages` SHALL require an exact current-root Agent target, SHALL accept only optional `before` and `limit` pagination fields, SHALL default to the latest one eligible outer-assistant native message, and SHALL reject limits outside 1 through 20. It SHALL return messages newest first with complete text and opaque message IDs, plus a next cursor only when older eligible messages remain. It SHALL be observation-only and SHALL NOT activate, resume, interrupt, steer, or change acknowledgement or lifecycle state.

#### Scenario: Parent requests latest history
- **WHEN** the parent calls `read_agent_messages` with only an exact Agent target
- **THEN** it receives at most the latest one eligible outer-assistant message without changing the Agent

#### Scenario: Parent requests an older page
- **WHEN** the parent echoes a valid returned message ID as `before`
- **THEN** it receives only older eligible messages up to the requested message-count limit

#### Scenario: Parent supplies an invalid cursor or limit
- **WHEN** `before` is not an eligible message ID for that Agent or `limit` is outside 1 through 20
- **THEN** the operation fails before returning unrelated transcript content

#### Scenario: Parent attempts a foreign read
- **WHEN** the target does not resolve exactly inside the current root
- **THEN** the operation fails under the same root-isolation boundary as other Agent mutations

### Requirement: Public runtime exposes only seven canonical Agent operations
The public runtime SHALL expose `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, and `read_agent_messages` as its complete model-facing Agent surface.

#### Scenario: Public runtime is inspected
- **WHEN** a caller enumerates the frozen Agent interface
- **THEN** exactly the seven canonical operations are present and old job-oriented operations are absent

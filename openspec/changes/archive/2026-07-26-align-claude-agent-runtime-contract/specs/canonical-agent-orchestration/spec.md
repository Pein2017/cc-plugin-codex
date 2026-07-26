## MODIFIED Requirements

### Requirement: Plugin skills map directly to the canonical operations
The installed plugin SHALL expose exactly `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, and `$cc-for-pein:list-agents`, each delegating to the matching checkout-owned snake_case runtime operation. All six SHALL be eligible for model-visible skill discovery in a newly started Codex task.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads plugin version `0.3.0`
- **THEN** all six lifecycle skills are present in the model-visible catalog and none of the old lifecycle skills is discoverable

### Requirement: Spawn skill uses exact Claude model and effort identifiers
The `spawn-agent` skill SHALL require an explicit model selection and SHALL pass model and effort as separate arguments. It SHALL support only Sonnet 5 as `claude-sonnet-5` and Opus 5 as `claude-opus-5` across every execution profile, SHALL NOT pass partial identifiers such as `sonnet-5` or `opus-5`, and SHALL NOT silently default or substitute a model.

#### Scenario: Public alias and effort are requested
- **WHEN** the user requests Opus 5 with x-high effort
- **THEN** the skill passes model `claude-opus-5` and reasoning effort `xhigh` as separate canonical arguments

#### Scenario: Orchestration label resembles a model version
- **WHEN** an `Ops5` substring appears only inside an Agent or task name
- **THEN** the skill does not infer any model argument from that label

#### Scenario: Sonnet is selected
- **WHEN** the user selects Sonnet or Sonnet 5
- **THEN** the skill passes the exact model ID `claude-sonnet-5`

#### Scenario: Requested model is unavailable
- **WHEN** Claude Code rejects the requested model for the active account
- **THEN** the skill reports the rejection and does not retry under another model

#### Scenario: Another available Claude model is requested
- **WHEN** spawn explicitly requests Fable, Haiku, an older Sonnet/Opus, or any model other than `claude-sonnet-5` and `claude-opus-5`
- **THEN** the runtime rejects the model before launching Claude

#### Scenario: No model is explicitly selected
- **WHEN** spawn omits a model under either execution profile
- **THEN** the runtime rejects the request before creating an Agent reservation or launching Claude

### Requirement: spawn_agent creates identity and starts the first turn
`spawn_agent` SHALL accept canonical `task_name`, `message`, explicit `fork_turns`, and explicit supported model fields, atomically reserve a root-unique Agent identity, and start its first internal Claude job using optional description, Claude effort, and execution-profile extensions. It SHALL accept only `fork_turns=none`; other Codex context-fork modes SHALL fail explicitly because they cannot be reproduced as native Claude session inheritance.

#### Scenario: New Agent starts successfully
- **WHEN** the name is unique, the model is explicit and supported, `fork_turns=none`, and readiness passes
- **THEN** the call returns the stable Agent ID/path and a `pending_init` or `running` first-turn receipt

#### Scenario: Unsupported context fork is requested
- **WHEN** `fork_turns` is `all` or a positive integer
- **THEN** spawn fails with an explicit cross-model context-inheritance limitation and does not inject Codex history into Claude

#### Scenario: Foreign session adoption is requested
- **WHEN** spawn includes an existing Claude session ID
- **THEN** spawn rejects it because session adoption is deferred to a separate future OpenSpec

### Requirement: Legacy Agent model migration is evidence-only and recoverable
A pre-v0.3 Agent without `selectedModel` SHALL be backfilled only from an exact model proven by a retained runtime receipt or a bounded read of its own Claude session artifact. Reconciliation SHALL index pending session artifacts once per Claude config root rather than rescan the full history per Agent. It SHALL defer an evidence-free active turn. It SHALL preserve identity and history while blocking terminal continuation when the model is unsupported or not yet proven, SHALL retry a directly located unproven artifact, and SHALL never infer or substitute a supported model.

#### Scenario: Pruned job has a supported Claude artifact
- **WHEN** a terminal legacy Agent has no retained job but its bound Claude session artifact proves `claude-sonnet-5` or `claude-opus-5`
- **THEN** the runtime persists that exact selected model and preserves exact-session continuation

#### Scenario: Historical model is unsupported
- **WHEN** retained evidence proves that a legacy Agent ran an older or otherwise unsupported model
- **THEN** continuation is blocked with the observed model recorded, while Agent identity and Claude history remain intact

#### Scenario: Active legacy model is not yet observable
- **WHEN** a legacy Agent still has an active turn and no exact model evidence is available
- **THEN** migration persists a non-blocking pending marker and direct artifact candidate without changing the active continuation mode or repeatedly scanning the full history tree

#### Scenario: Terminal model evidence arrives after an unproven block
- **WHEN** a terminal legacy Agent was blocked because its artifact had no model evidence and that same artifact later proves a supported exact model
- **THEN** reconciliation persists the model and restores exact-session continuation

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL first acknowledge only a valid oldest Agent-linked contiguous prefix from a prior response, and then return a Codex-V2-shaped message/timed-out receipt with at most the oldest unread current-root completion summary. It SHALL omit final output, raw inbox state, full Agent records, and reconciliation detail, and SHALL NOT acknowledge the newly returned update in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one bounded status/summary update with an opaque delivery token, no final output, and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes the valid token for the oldest previously returned Agent update
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait reports completion activity without returning the Agent's final message

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without current-root Agent activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

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

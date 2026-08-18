## RENAMED Requirements

- FROM: `Public runtime exposes only seven canonical Agent operations`
- TO: `Public runtime exposes only eight canonical Agent operations`
- FROM: `followup_task guarantees activation`
- TO: `followup_task guarantees only capability-valid activation`
- FROM: `list_agents reports logical state and unread completions`
- TO: `list_agents reports logical state and immutable route`

## MODIFIED Requirements

### Requirement: Plugin skills map directly to the canonical operations
The installed Plugin SHALL expose exactly `$codex-harnessdock:spawn-agent`, `$codex-harnessdock:send-message`, `$codex-harnessdock:followup-task`, `$codex-harnessdock:wait-agent`, `$codex-harnessdock:interrupt-agent`, `$codex-harnessdock:list-agents`, `$codex-harnessdock:read-agent-messages`, and `$codex-harnessdock:list-harnesses` as Experimental orchestration guidance for the matching eight `mcp__codex_harnessdock__*` typed tools. Each MCP tool SHALL delegate to the matching checkout-owned snake_case runtime operation. All eight Skills and tools SHALL be eligible for model-visible discovery in a newly started Codex task. Skills SHALL NOT silently substitute shell execution when the typed server is unavailable; the checkout CLI remains an operator/debug fallback.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads the new public generation
- **THEN** all eight Experimental Agent Skills and all eight typed tools are present, none of the old lifecycle Skills is discoverable, and ordinary lifecycle calls require no shell command

#### Scenario: Typed MCP server is unavailable
- **WHEN** a model-facing lifecycle operation cannot resolve its matching MCP tool
- **THEN** the Skill reports Plugin discovery or startup failure instead of silently invoking a Harness CLI or checkout CLI

### Requirement: Model-facing activation selects write intent deliberately
The `spawn-agent` Skill SHALL require explicit Harness, full model, topology, and write intent and SHALL pass every value unchanged. It SHALL describe `write` as immutable behavioral authority whose enforcement is route-specific and observable, never a universal CLI permission or OS sandbox. `followup-task` SHALL explain that Harness, model, topology, and authority are inherited and cannot change; a different route or authority requires a new Agent.

#### Scenario: Parent delegates a read-only OpenCode audit
- **WHEN** Codex chooses the admitted Explorer route
- **THEN** it passes `opencode`, `opencode-go/deepseek-v4-flash`, `leaf`, and `write: false` explicitly

#### Scenario: Parent delegates authorized Claude implementation
- **WHEN** Codex chooses a Claude route whose Driver admits mutation
- **THEN** it passes that exact Harness/model/topology plus `write: true` and limits mutation to the delegated task

#### Scenario: Follow-up would change authority
- **WHEN** new work needs a different authority or route
- **THEN** Codex creates a new explicitly routed Agent instead of changing the old identity

### Requirement: Claude-native delegation is explicit and bounded
Every new Claude Agent SHALL persist immutable topology selected explicitly at spawn. `leaf` SHALL deny native `Agent`, `Workflow`, and the reviewed high-blast-radius tools. Exact Opus 5 and Fable 5 MAY use `native_orchestrator`; Haiku and Sonnet SHALL reject it. An orchestrator SHALL enable the experimental native team transport for that Claude process and SHALL fail observably rather than accept ordinary-subagent work as a native team when required definitions or transport proof are unavailable. The Plugin SHALL track only the durable parent CC Agent and instruct it to return one self-contained synthesis. OpenCode SHALL admit only `leaf` and SHALL not project its task/subagent facilities as Plugin Agent communication.

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

### Requirement: interrupt_agent ends only the current turn
`interrupt_agent` SHALL address only the target Agent's current turn and preserve the logical Agent. If the accepted route does not support interruption, it SHALL return `unsupported` without native action. When interruption is supported, durable request acknowledgement SHALL remain nonterminal: only authoritative terminal Driver evidence may produce `interrupted`. A pending/rejected request SHALL return `interrupt_requested` or `still_working`; lost ownership without authoritative settlement SHALL return `settlement_unknown`. A terminal Agent SHALL return `no_active_turn`. The public operation SHALL NOT auto-escalate a rejected or unobserved graceful request to destructive cancellation.

#### Scenario: Graceful interruption proves terminal settlement
- **WHEN** the Driver accepts the request and later proves the exact native turn interrupted with settled execution
- **THEN** the Agent becomes interrupted, no turn worker remains resident, and the receipt reports `interrupted`

#### Scenario: Request is accepted but settlement is pending
- **WHEN** the Driver has acknowledged interruption but the exact turn remains nonterminal
- **THEN** the receipt reports `interrupt_requested` and the Agent remains active

#### Scenario: Route does not support interruption
- **WHEN** the accepted capability snapshot declares interrupt unsupported
- **THEN** the receipt reports `unsupported` without calling native abort, signal, status, or recovery APIs

#### Scenario: Worker loss leaves settlement unknown
- **WHEN** an interruption may have been requested but no authoritative terminal evidence can be obtained
- **THEN** the receipt reports `settlement_unknown`, affected leases remain held, and no interrupted completion is synthesized

#### Scenario: Agent has no active turn
- **WHEN** interruption targets a terminal Agent
- **THEN** the receipt reports `no_active_turn` without changing Agent identity or history

### Requirement: spawn_agent creates identity and starts the first turn
`spawn_agent` SHALL require canonical `task_name`, `message`, explicit admitted `harness`, explicit full `model`, explicit `topology`, and explicit boolean `write`. It SHALL accept only optional `description` and Driver-discriminated `reasoning_effort`; removed or Driver/config/session/repository-policy selectors SHALL be absent and rejected. Before readiness, Agent creation, mailbox mutation, or job preparation, it SHALL synchronously validate the complete route and intent. On success it SHALL atomically reserve a root-unique v3 Agent identity with the first-turn message as mailbox sequence one, then start its first internal job from the ordered assignment.

#### Scenario: New Agent starts successfully
- **WHEN** the name is unique and every explicit route, authority, effort, and readiness check passes
- **THEN** the call returns the stable Agent name and a bounded route-qualified starting/working projection

#### Scenario: Route combination is invalid
- **WHEN** Harness, model, topology, effort, or authority are unsupported or incompatible
- **THEN** spawn fails synchronously before creating an Agent, message, job, native session, or model request

#### Scenario: Required route field is omitted
- **WHEN** spawn omits Harness, model, topology, or write
- **THEN** the request fails rather than inferring from configuration, model prefix, or the only ready Driver

#### Scenario: Native session adoption is requested
- **WHEN** spawn includes an existing Claude or OpenCode session ID
- **THEN** spawn rejects it because session adoption is outside the public contract

### Requirement: followup_task guarantees only capability-valid activation
`followup_task` SHALL inherit the Agent's immutable route and accept only a new message plus optional route-admitted turn effort. For a terminal Agent it SHALL start an exact-session or receipt-proven safe-fresh turn when admitted. For an active Agent it SHALL deliver only when its accepted capability proves active input; otherwise it SHALL fail before mailbox mutation rather than promise later activation. It SHALL reject route, authority, topology, model, Driver, tool, session, configuration, scope, or questions overrides.

#### Scenario: Terminal OpenCode Agent receives follow-up
- **WHEN** its exact session binding, authoritative Server/session incarnation, and route remain valid and its snapshot declares exact resume
- **THEN** a new turn starts on that exact session and consumes queued `send_message` entries in order

#### Scenario: Terminal OpenCode Agent is fresh-only
- **WHEN** the accepted snapshot lacks authoritative exact-resume evidence
- **THEN** follow-up rejects before mailbox mutation and Codex must create a new explicitly routed Agent

#### Scenario: Active OpenCode Agent receives follow-up
- **WHEN** its snapshot declares initial input only
- **THEN** follow-up fails without enqueueing a message under a false activation guarantee

#### Scenario: Active Claude Agent receives follow-up
- **WHEN** its snapshot proves acknowledged active input
- **THEN** the message is durably delivered at the supported stream boundary without a competing job

#### Scenario: Agent is activation-blocked
- **WHEN** neither exact resume nor proven safe fresh is available
- **THEN** follow-up rejects with bounded route-qualified blocking evidence

### Requirement: list_agents reports logical state and immutable route
`list_agents` SHALL accept only optional canonical `path_prefix` and return every matching current-root logical Agent, including nonresident terminal history, with canonical Agent name, bounded status, immutable Harness, full model, topology, behavioral authority, and maturity. It SHALL not return native sessions, instance keys, endpoints, credentials, completion events/tokens/output, reconciliation receipts, or storage metadata. Cross-root all-state remains operator-only.

#### Scenario: Mixed root is listed
- **WHEN** one root owns Claude and OpenCode Agents
- **THEN** each Agent card preserves its own immutable route and logical status without consuming completion or progress delivery

#### Scenario: Legacy Agent is listed
- **WHEN** a valid v1/v2 Claude Agent is observed
- **THEN** it is identified as Claude with its evidence-backed model/topology and historical authority reported honestly, without rewriting it as v3

### Requirement: Public runtime exposes only eight canonical Agent operations
The public runtime SHALL expose `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, `read_agent_messages`, and `list_harnesses` as its complete model-facing surface.

#### Scenario: Public runtime is inspected
- **WHEN** a caller enumerates the frozen Agent interface
- **THEN** exactly the eight canonical operations are present and job, server, session, endpoint, provider, config, login, cancel, and delete operations are absent

### Requirement: Follow-up and interrupt acknowledgements are operation-specific
A successful `followup_task` model-facing receipt SHALL contain only stable `agent_name` and `delivery`. A successful `interrupt_agent` model-facing receipt SHALL contain only stable `agent_name` and one closed operation `status`: `no_active_turn`, `interrupt_requested`, `still_working`, `unsupported`, `settlement_unknown`, or `interrupted`. Request acknowledgement SHALL NOT be presented as terminal effect. Their Skills SHALL present one concise disposition-aware sentence and SHALL NOT echo raw JSON. Actionable failures SHALL remain visible through the existing failure boundary.

#### Scenario: Follow-up is handed off
- **WHEN** a follow-up is durably delivered, pending activation, already active, or starts a new turn
- **THEN** the receipt reports only the Agent name and exact delivery disposition

#### Scenario: Active turn reaches proven interruption
- **WHEN** authoritative Driver evidence proves interruption and settlement
- **THEN** the receipt reports the Agent name and `interrupted`

#### Scenario: Interruption remains pending or unknown
- **WHEN** request acknowledgement or lost ownership cannot prove terminal effect
- **THEN** the receipt reports `interrupt_requested`, `still_working`, or `settlement_unknown` without process-control details

#### Scenario: Route does not support interruption
- **WHEN** the target capability declares interruption unsupported
- **THEN** the receipt reports the Agent name and `unsupported`

#### Scenario: Agent has no active turn
- **WHEN** interruption targets an Agent without an active turn
- **THEN** the receipt reports the Agent name and `no_active_turn`

### Requirement: All canonical Agent skills disclose Experimental status
Each of the eight model-visible CC Agent Skills and its discovery metadata SHALL identify the feature as Experimental and SHALL state that the local Plugin cannot automatically start a new Codex model turn after the parent has ended.

#### Scenario: A newly started Codex task discovers the plugin
- **WHEN** the eight Agent Skills are loaded from the installed local snapshot
- **THEN** every Skill is visibly Experimental without claiming automatic idle-parent wakeup or automatic route selection

### Requirement: Agent Skill guidance has a bounded context footprint
The eight installed Agent Skills SHALL remain self-contained and preserve typed inputs, lifecycle distinctions, explicit immutable routing, behavioral authority, capability-specific unsupported paths, completion/acknowledgement mechanics, and actionable failure handling. Their aggregate whitespace-delimited word count SHALL NOT exceed 2,200, and successful presentation guidance SHALL prefer concise synthesis over raw receipt repetition or route policy.

#### Scenario: Plugin contract tests inspect Skills
- **WHEN** all eight installed `SKILL.md` files are measured
- **THEN** their aggregate word count is at most 2,200 while every required contract marker remains present

#### Scenario: Typed tool is unavailable
- **WHEN** a Skill cannot resolve its matching MCP tool
- **THEN** it reports Plugin discovery or startup failure instead of invoking shell or a Harness CLI

## ADDED Requirements

### Requirement: Route discovery informs but never decides
The `list-harnesses` Skill SHALL explain admitted/available distinction, `liveValidated`, maturity, exact route constraints, and unsupported capabilities. It SHALL not rank Harnesses, recommend delegation thresholds, select a route, or interpret unavailable authentication/quota/service evidence as model-quality evidence.

#### Scenario: Codex needs current route facts
- **WHEN** the lead has not already been given a valid explicit route
- **THEN** it may inspect `list_harnesses` and then makes its own route decision from the task and user instructions

# claude-session-execution Specification

## Purpose

Define Claude Code headless transport, execution profiles, session capture, and exact-session continuation.
## Requirements
### Requirement: Claude runs through the headless streaming protocol
The runtime SHALL execute only a statically admitted Claude executable, using
print mode, stream-json input and output, verbose partial messages, and hook
events so that prompts, steering, session identity, output, tool use, and
terminal receipts can be tracked. Each attempt SHALL retain the prepared
executable fingerprint and record the runtime-reported Claude Code version.

#### Scenario: A tracked turn starts
- **WHEN** the supervisor launches a Claude attempt
- **THEN** the initial prompt is written through stdin and stream events are parsed into bounded runtime receipts

#### Scenario: A tracked turn completes
- **WHEN** Claude reports a terminal success for the admitted executable
- **THEN** the turn receipt records both its prepared compatibility fingerprint and runtime-reported Claude Code version

### Requirement: Account-limit exhaustion is terminal and non-fallback
The runtime SHALL classify explicit native Claude subscription, usage, credit, weekly/monthly, session-capacity, or quota-limit exhaustion as `usage_or_subscription_limit`. It SHALL expose the terminal failure without automatic reconnect or model fallback. Terminal result error strings SHALL participate in classification so a structured Claude error cannot be hidden by an empty final message. The classification SHALL use native failure evidence and SHALL NOT treat successful assistant prose that merely discusses a session limit as an account failure.

#### Scenario: Structured result reports a periodic usage limit
- **WHEN** Claude exits with a terminal result whose errors state that a weekly, monthly, subscription, usage, credit, or quota limit is exhausted
- **THEN** the attempt fails as `usage_or_subscription_limit` and the supervisor performs no reconnect

#### Scenario: Native result reports the Claude session limit
- **WHEN** native Claude failure evidence states `You've hit your session limit` and may include a reset time
- **THEN** the attempt fails as `usage_or_subscription_limit` and public blocking becomes account-scoped operator intervention without a new-Agent retry

#### Scenario: Successful assistant discusses a session limit
- **WHEN** a successful final assistant message mentions `session limit` without matching stderr, warning, terminal-error, failed-result, or exit evidence
- **THEN** the job is not classified as account-limit exhaustion

#### Scenario: Limit text also contains HTTP 429
- **WHEN** explicit account-exhaustion text is accompanied by HTTP 429
- **THEN** permanent account-limit classification takes precedence over transport retry

#### Scenario: Generic transport rate limit is transient
- **WHEN** an attempt reports HTTP 429 without explicit subscription, usage, credit, periodic, session-capacity, or quota exhaustion
- **THEN** the existing bounded transport-recovery policy remains applicable

#### Scenario: Rate limit mentions a usage tier
- **WHEN** HTTP 429 reports a request or rate limit for the current usage tier and provides retry guidance without saying account capacity is exhausted
- **THEN** the failure remains eligible for bounded exact-session transport recovery

#### Scenario: User-directed wording names a rate or request limit
- **WHEN** HTTP 429 says the caller has hit, reached, or exceeded a rate limit or request limit and provides retry guidance
- **THEN** the failure remains eligible for bounded exact-session transport recovery rather than being treated as account-capacity exhaustion

#### Scenario: Billing-period allowance is exhausted
- **WHEN** Claude explicitly reports that the current period allowance or billing-period limit is exhausted or reached
- **THEN** the attempt fails as `usage_or_subscription_limit` and the supervisor performs no reconnect

#### Scenario: Caller-imposed command budget is exhausted
- **WHEN** Claude reports `error_max_budget_usd` or otherwise identifies that the caller's `--max-budget-usd` ceiling was reached, even if its prose contains "usage limit"
- **THEN** the attempt terminates without being classified as subscription or usage exhaustion

### Requirement: Safe execution profile applies explicit safeguards
The explicit opt-in safe profile SHALL apply the runtime-owned sandbox and permission policy and SHALL restrict tools for read-only work unless the caller supplies an explicit allowed-tool set. It SHALL still require the caller-selected supported model inherited from the Agent request.

#### Scenario: Read-only safe task starts
- **WHEN** a caller starts a safe task without write access or explicit allowed tools
- **THEN** Claude receives the read-only sandbox settings, bounded read-only tool policy, and caller-selected supported model

### Requirement: Runtime appends a bounded delegation envelope
Every public Claude turn SHALL receive a runtime-owned `--append-system-prompt` envelope without replacing Claude's native system prompt. The common envelope SHALL identify the turn as a bounded delegation from the Codex lead, preserve the supplied task/workspace boundary, state the current activation's write intent as a behavioral authority boundary, assign user-facing synthesis and final acceptance to Codex, require one self-contained final result, and instruct Claude to end the turn with the exact question and supporting evidence when progress requires a decision only the Codex lead or user can make. False write intent SHALL forbid workspace and repository mutation even though terminal parity grants full Claude CLI authority; true write intent SHALL permit only task-scoped mutation. Every mode SHALL emit a hard native `Workflow` denial. Leaf mode SHALL additionally forbid delegation and emit a hard native `Agent` denial. Fable orchestrator mode SHALL permit only one native `Agent` child generation and require the parent to join and synthesize its children.

#### Scenario: Read-intent leaf turn starts
- **WHEN** an Agent activates in leaf mode with `write: false`
- **THEN** Claude receives the common read-only behavioral instruction and leaf instruction plus hard native `Agent` and `Workflow` tool denials

#### Scenario: Write-intent leaf turn starts
- **WHEN** an Agent activates in leaf mode with `write: true`
- **THEN** Claude receives task-scoped mutation authority and the leaf instruction plus hard native `Agent` and `Workflow` tool denials

#### Scenario: Fable orchestrator starts
- **WHEN** a `claude-fable-5` Agent activates in `claude_orchestrator` mode
- **THEN** Claude receives the current write-intent instruction and orchestrator instruction with `Workflow` denied and `Agent` available

#### Scenario: Lead-owned decision blocks progress
- **WHEN** Claude cannot continue without a decision reserved to the Codex lead or user
- **THEN** the envelope instructs Claude to end the turn with the precise question and supporting evidence so the same session can receive a follow-up

#### Scenario: Exact job reconnects
- **WHEN** transport recovery reconnects the same Agent job
- **THEN** the same delegation mode, tool denials, and write-intent envelope are reconstructed from that durable job evidence

#### Scenario: Follow-up changes write intent
- **WHEN** a follow-up activates the same Claude session with a new explicit write intent
- **THEN** the new job receives the envelope for the new intent without changing Agent or Claude session identity

#### Scenario: Native Claude customizations exist
- **WHEN** hooks, memories, skills, plugins, Serena MCP, or other native configuration is enabled
- **THEN** the runtime appends its bounded envelope rather than replacing or disabling Claude's native system and configuration sources

### Requirement: Default terminal-parity profile preserves native configuration with full access
The model-facing terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, and native tools while requiring the explicit supported model and explicit spawn write intent. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR`, set `IS_SANDBOX=1`, and pass `--dangerously-skip-permissions` for both false and true write intent. It SHALL NOT add an allowed-tool list, model fallback, effort, settings, MCP, or replacement-system-prompt override. Its only implicit prompt/tool policy SHALL be the runtime-owned delegation envelope for the current write intent, the hard native `Workflow` denial for every Agent, and the additional hard native `Agent` denial for leaf Agents.

#### Scenario: Read-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model with `write: false`
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, `--dangerously-skip-permissions`, the explicit model, a read-only behavioral delegation envelope, and no allowed-tool list

#### Scenario: Write-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model and `write: true`
- **THEN** Claude receives the same full-access process envelope with task-scoped mutation authority and no allowed-tool list

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal-parity leaves those native configuration sources enabled for both read and write intent rather than replacing them with runtime-owned settings

#### Scenario: Fable orchestrator uses native subagents
- **WHEN** terminal parity activates an explicit Fable orchestrator
- **THEN** the profile denies `Workflow`, leaves `Agent` available, and applies no native tool allow-list

#### Scenario: Operator safe profile is selected
- **WHEN** an explicit operator/debug path selects the safe profile
- **THEN** safe behavior remains internal and is not exposed as a model-facing activation choice

### Requirement: Initial Agent sessions have an explicit Claude display name
The runtime SHALL pass the durable Agent name through Claude's `--name` option when creating a new session, so Claude Code does not need an auxiliary model to generate an automatic title. Exact-session resumes SHALL retain the existing session identity without renaming it.

#### Scenario: Initial Agent turn starts
- **WHEN** a new Agent turn creates a fresh Claude session
- **THEN** Claude receives the Agent name through `--name` together with the selected canonical `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`, or `claude-fable-5` model

#### Scenario: Exact session resumes
- **WHEN** a follow-up resumes an existing Claude session
- **THEN** the runtime uses the exact session ID without adding a new `--name`
  argument

### Requirement: Dangerous permission bypass is constrained
The terminal-parity profile SHALL always apply dangerous permission bypass and SHALL NOT combine it with an explicit permission mode. The safe profile SHALL reject dangerous permission bypass. Write intent SHALL NOT enable or disable the terminal-parity bypass.

#### Scenario: Terminal-parity read intent starts
- **WHEN** a caller starts an Agent with false write intent
- **THEN** the runtime selects terminal-parity with dangerous permission bypass and a read-only behavioral prompt

#### Scenario: Terminal-parity write intent starts
- **WHEN** a caller starts an Agent with `write: true`
- **THEN** the runtime selects terminal-parity with dangerous permission bypass and a task-scoped mutation prompt

#### Scenario: Explicit permission mode conflicts with terminal parity
- **WHEN** a terminal-parity caller supplies an explicit permission mode
- **THEN** the runtime rejects the request before launching Claude

#### Scenario: Dangerous bypass is requested in safe mode
- **WHEN** a caller combines dangerous permission bypass with the safe profile
- **THEN** the runtime rejects the request before launching Claude

### Requirement: Claude session identity is captured and resumable
The runtime SHALL preserve Claude Code session persistence by default, capture the Claude session ID from protocol events or results, and use `--resume` with that exact ID for recovery or follow-up.

#### Scenario: New Claude session completes
- **WHEN** Claude reports a session ID during a new tracked job
- **THEN** the job receipt stores that Claude session ID independently from the Codex owner session ID

#### Scenario: Exact-session follow-up starts
- **WHEN** a caller follows up on a resumable terminal job
- **THEN** the new attempt invokes Claude with the recorded Claude session ID and rejects observed session drift

### Requirement: Session ownership is sequential
The runtime SHALL prevent concurrent plugin workers from owning the same canonical `CLAUDE_CONFIG_DIR` and Claude session ID.

#### Scenario: A second worker requests an actively leased session
- **WHEN** a session lease is held by another active plugin job
- **THEN** the second request fails without launching a competing Claude owner

### Requirement: Claude Code Driver extraction preserves established execution semantics
The `claude-code` Harness Driver SHALL compose the existing Claude Code execution, environment, profile, compatibility, stream-json, steering, session, history, interruption, and recovery owners without changing their observable public behavior. Extraction behind the Driver boundary SHALL preserve supported model/effort admission, fixed terminal-parity environment, dangerous permission bypass, prompt-level write intent, bounded delegation envelope, universal Workflow denial, leaf Agent denial, Fable one-generation orchestration, exact-session drift rejection, usage-limit classification, native customizations, completion content, and public lifecycle receipts.

#### Scenario: Existing Claude leaf Agent runs after extraction
- **WHEN** the unchanged public API starts a supported non-Fable route in leaf mode
- **THEN** the same admitted command, fixed environment, stream protocol, prompt/tool envelope, native configuration, receipts, session binding, and terminal result are produced through the Claude Code Driver

#### Scenario: Existing Fable orchestrator runs after extraction
- **WHEN** the unchanged public API starts `claude-fable-5` in `claude_orchestrator` mode
- **THEN** Workflow remains denied, one native Agent generation remains available, and the outer Claude turn still joins and synthesizes its children

#### Scenario: Active steering is acknowledged after extraction
- **WHEN** a running Claude turn receives a valid active message
- **THEN** the Driver preserves the current dispatch, acknowledgement, ordering, and recovery semantics rather than reducing the message to an unproven generic capability

#### Scenario: Claude history is read after extraction
- **WHEN** the root reads bounded assistant messages for its nonresident Agent
- **THEN** the Driver uses the same native Claude history owner and returns the same bounded message semantics without activating the Agent

#### Scenario: Claude compatibility or account limit fails
- **WHEN** the host Claude version is incompatible or the selected account reports explicit exhaustion
- **THEN** the Driver preserves the existing fail-closed compatibility or non-fallback usage-limit result

### Requirement: Claude final handoff is the latest complete outer-assistant message
The Claude Code Driver SHALL return the latest complete top-level outer-assistant message as `finalMessage`, SHALL exclude earlier tool-boundary narration and intermediate assistant messages, and SHALL not truncate that selected message.

#### Scenario: Turn contains intermediate narration and tools
- **WHEN** stream-json contains an assistant message before tool use and a later complete assistant message after tool use
- **THEN** `finalMessage` contains only the later complete outer-assistant message

#### Scenario: Message boundaries are unavailable
- **WHEN** a compatible Claude stream contains no complete outer-assistant message boundary but provides terminal result text
- **THEN** the Driver uses the terminal result as a fallback without concatenating duplicate prefixes

### Requirement: Harness failure classification uses native execution evidence
The runtime SHALL derive Harness-scoped authentication, account-limit, transport, and process blocking only from structured terminal events, stderr, warnings, exit state, or equivalent native execution evidence, not from Claude assistant prose.

#### Scenario: Assistant discusses an account limit hypothetically
- **WHEN** a successful final assistant message mentions quota, authentication, or permission errors without matching native failure evidence
- **THEN** the job is not classified as a Harness-scoped operator-required failure

### Requirement: CC Agent turns enable native Auto Memory by default
Every model-facing Claude Code turn launched by the CC runtime SHALL receive
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` from the canonical fixed environment so
Claude native Auto Memory is enabled for new and resumed Agent turns. The fixed
value SHALL override a conflicting inherited model-facing value. The runtime
SHALL NOT emulate Auto Memory with `CLAUDE.md`, prompt content, public receipts,
or Plugin-owned memory storage, and SHALL NOT set `autoMemoryDirectory`; Claude
SHALL retain its repository-derived memory isolation and shared-worktree
behavior.

#### Scenario: New CC Agent starts
- **WHEN** `spawn_agent` activates a new Claude Code turn
- **THEN** the Claude child environment contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`

#### Scenario: Durable Agent resumes
- **WHEN** `followup_task` activates a proven native Claude session
- **THEN** the resumed Claude child receives the same force-enabled Auto Memory environment

#### Scenario: Inherited host value disables Auto Memory
- **WHEN** the inherited model-facing environment contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
- **THEN** the canonical fixed environment replaces it with `0` before Claude starts

#### Scenario: Claude selects memory storage
- **WHEN** Auto Memory is available to an Agent working in a Git repository or worktree
- **THEN** the Plugin passes no shared memory directory or memory content and Claude retains native repository-derived storage

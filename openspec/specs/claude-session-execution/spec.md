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
The runtime SHALL classify explicit Claude subscription, usage, credit, weekly/monthly, or quota-limit exhaustion as `usage_or_subscription_limit`. It SHALL expose the terminal failure without automatic reconnect or model fallback. Terminal result error strings SHALL participate in classification so a structured Claude error cannot be hidden by an empty final message.

#### Scenario: Structured result reports a periodic usage limit
- **WHEN** Claude exits with a terminal result whose errors state that a weekly, monthly, subscription, usage, credit, or quota limit is exhausted
- **THEN** the attempt fails as `usage_or_subscription_limit` and the supervisor performs no reconnect

#### Scenario: Limit text also contains HTTP 429
- **WHEN** explicit account-exhaustion text is accompanied by HTTP 429
- **THEN** permanent account-limit classification takes precedence over transport retry

#### Scenario: Generic transport rate limit is transient
- **WHEN** an attempt reports HTTP 429 without explicit subscription, usage, credit, periodic, or quota exhaustion
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
Every public Claude turn SHALL receive a runtime-owned `--append-system-prompt` envelope without replacing Claude's native system prompt. The common envelope SHALL identify the turn as a bounded delegation from the Codex lead, preserve the supplied task/workspace/authority boundary, assign user-facing synthesis and final acceptance to Codex, and require one self-contained final result. Leaf mode SHALL additionally forbid delegation and SHALL emit `--disallowedTools Agent`. Fable orchestrator mode SHALL omit that deny, permit only one native child generation, and require the parent to join and synthesize its children.

#### Scenario: Leaf turn starts
- **WHEN** any Agent activates in leaf mode
- **THEN** Claude receives the common and leaf appended instruction plus a hard native `Agent` tool denial

#### Scenario: Fable orchestrator starts
- **WHEN** a `claude-fable-5` Agent activates in `claude_orchestrator` mode
- **THEN** Claude receives the common and orchestrator appended instruction without the `Agent` tool denial

#### Scenario: Exact session resumes
- **WHEN** a follow-up or reconnect resumes an Agent's Claude session
- **THEN** the same immutable delegation envelope and tool boundary are reconstructed from durable Agent/job evidence

#### Scenario: Native Claude customizations exist
- **WHEN** hooks, memories, skills, plugins, Serena MCP, or other native configuration is enabled
- **THEN** the runtime appends its bounded envelope rather than replacing or disabling Claude's native system and configuration sources

### Requirement: Default terminal-parity profile preserves native configuration with intent-bound permissions
The model-facing terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, and native tools while requiring the explicit supported model and explicit spawn write intent. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR` and set `IS_SANDBOX=1`. It SHALL pass `--dangerously-skip-permissions` exactly when the activation has explicit or inherited `write: true`; false write intent SHALL omit that flag and leave permissions to native Claude configuration. It SHALL NOT add model fallback, effort, settings, MCP, or replacement-system-prompt overrides. Its only implicit prompt/tool policy SHALL be the immutable runtime-owned delegation envelope and, for leaf Agents, the hard native `Agent` denial.

#### Scenario: Read-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model with `write: false`
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, the explicit model, and delegation envelope without `--dangerously-skip-permissions`

#### Scenario: Write-intent Agent starts
- **WHEN** `spawn_agent` supplies a supported model and `write: true`
- **THEN** Claude additionally receives `--dangerously-skip-permissions` while retaining the delegation envelope

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal-parity leaves those native configuration sources enabled for both read and write intent rather than replacing them with runtime-owned settings

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
The terminal-parity profile SHALL derive dangerous permission bypass from explicit write intent and SHALL NOT combine it with an explicit permission mode. An explicit dangerous-bypass request without write intent SHALL fail validation. The safe profile SHALL reject dangerous permission bypass.

#### Scenario: Terminal-parity read intent starts
- **WHEN** a caller starts an Agent with false or omitted write intent
- **THEN** the runtime selects terminal-parity without dangerous permission bypass

#### Scenario: Terminal-parity write intent starts
- **WHEN** a caller starts an Agent with `write: true`
- **THEN** the runtime selects terminal-parity and applies dangerous permission bypass

#### Scenario: Explicit bypass lacks write intent
- **WHEN** a terminal-parity caller requests dangerous permission bypass with false or omitted write intent
- **THEN** the runtime rejects the request before launching Claude

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

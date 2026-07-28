## MODIFIED Requirements

### Requirement: Spawn skill presents a concise acknowledgement by default
The `spawn-agent` skill SHALL retain the complete runtime receipt for machine reasoning while presenting only a concise successful acknowledgement derived from the selected model, its configured relative capability/spend role, stable Agent path, and current status. The relative model ladder SHALL be identified as approximate Plugin guidance rather than exact pricing. It SHALL NOT print the complete JSON receipt unless the user explicitly requests raw or debug output, and it SHALL preserve actionable error or recovery information when spawn fails.

#### Scenario: Agent starts successfully
- **WHEN** `spawn-agent` receives a successful runtime receipt and the user did not request raw or debug output
- **THEN** Codex reports the selected model, its concise role and relative tier within `Haiku < Sonnet < Opus < Fable`, Agent path, and current status without dumping the complete JSON receipt

#### Scenario: Raw receipt is explicitly requested
- **WHEN** the user explicitly requests raw or debug receipt output
- **THEN** Codex may present the complete runtime receipt

#### Scenario: Spawn fails or requires recovery
- **WHEN** the runtime receipt contains a spawn failure or actionable recovery condition
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
- **THEN** the skill passes model `claude-opus-5` and reasoning effort `xhigh` as separate canonical arguments

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

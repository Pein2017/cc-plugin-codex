## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Spawn skill uses exact Claude model and effort identifiers
The `spawn-agent` skill SHALL require an explicit model selection and SHALL pass model and effort as separate arguments. It SHALL support Sonnet 5 as `claude-sonnet-5` and Opus 5 as `claude-opus-5` for general delegation, plus Haiku 4.5 as `claude-haiku-4-5` only for Plugin smoke, hook, environment-parity, and integration testing. It SHALL NOT pass partial identifiers such as `sonnet-5`, `opus-5`, or `haiku-4-5`, and SHALL NOT silently substitute a different model after an availability or account-limit rejection.

#### Scenario: Public alias and effort are requested
- **WHEN** the user requests Opus 5 with x-high effort
- **THEN** the skill passes model `claude-opus-5` and reasoning effort `xhigh` as separate canonical arguments

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

## ADDED Requirements

### Requirement: Spawn skill presents a concise acknowledgement by default
The `spawn-agent` skill SHALL retain the complete runtime receipt for machine
reasoning while presenting only a concise successful acknowledgement derived
from the stable Agent path and current status. It SHALL NOT print the complete
JSON receipt unless the user explicitly requests raw or debug output, and it
SHALL preserve actionable error or recovery information when spawn fails.

#### Scenario: Agent starts successfully
- **WHEN** `spawn-agent` receives a successful runtime receipt and the user did
  not request raw or debug output
- **THEN** Codex reports the Agent path and current status without dumping the
  complete JSON receipt

#### Scenario: Raw receipt is explicitly requested
- **WHEN** the user explicitly requests raw or debug receipt output
- **THEN** Codex may present the complete runtime receipt

#### Scenario: Spawn fails or requires recovery
- **WHEN** the runtime receipt contains a spawn failure or actionable recovery
  condition
- **THEN** Codex reports the actionable condition instead of hiding it behind a
  generic concise success message

### Requirement: Spawn skill uses exact Claude model and effort identifiers
The `spawn-agent` skill SHALL pass model and effort as separate arguments. It
SHALL support only Sonnet 5 as `claude-sonnet-5` and Opus 5 as
`claude-opus-5` across every execution profile, SHALL NOT pass partial
identifiers such as `sonnet-5` or `opus-5`, and SHALL NOT silently substitute a
different model after an availability rejection.

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

#### Scenario: Requested model is unavailable
- **WHEN** Claude Code rejects the requested model for the active account
- **THEN** the skill reports the rejection and does not retry under another model

#### Scenario: Another available Claude model is requested
- **WHEN** spawn explicitly requests Fable, Haiku, an older Sonnet/Opus, or any
  model other than `claude-sonnet-5` and `claude-opus-5`
- **THEN** the runtime rejects the model before launching Claude

#### Scenario: No model is explicitly selected
- **WHEN** spawn omits a model under either execution profile
- **THEN** the runtime explicitly selects `claude-opus-5` rather than
  inheriting an unrestricted configured default

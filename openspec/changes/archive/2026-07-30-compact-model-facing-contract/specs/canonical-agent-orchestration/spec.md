## MODIFIED Requirements

### Requirement: Spawn skill presents a concise acknowledgement by default
The `spawn-agent` skill SHALL receive only a bounded successful projection containing stable `agent_name`, exact `model`, and bounded lifecycle `status`. It SHALL present one concise acknowledgement derived from those fields and the configured approximate model role. It SHALL NOT print raw JSON or expose Agent IDs, delegation metadata, workspace, native session/config, job, continuation, or mailbox internals; deeper evidence SHALL use the operator diagnostics path. Actionable error or recovery information SHALL remain visible when spawn fails.

#### Scenario: Agent starts successfully
- **WHEN** `spawn-agent` receives a successful bounded runtime receipt
- **THEN** Codex reports the selected model, concise role, stable Agent name, and current status without dumping JSON or internal state

#### Scenario: Deeper diagnostics are requested
- **WHEN** the user needs Agent ID, delegation, session, job, continuation, workspace, or mailbox evidence
- **THEN** the ordinary Agent receipt remains bounded and the operator diagnostics path is used instead

#### Scenario: Spawn fails or requires recovery
- **WHEN** spawn fails or reaches an actionable recovery condition
- **THEN** Codex reports the actionable condition instead of hiding it behind a generic concise success message

## ADDED Requirements

### Requirement: Follow-up and interrupt acknowledgements are operation-specific
A successful `followup_task` model-facing receipt SHALL contain only stable `agent_name` and `delivery`. A successful `interrupt_agent` model-facing receipt SHALL contain only stable `agent_name` and operation `status`, using `no_active_turn`, `interrupted`, `failed`, or `still_working`. Their Skills SHALL present one concise disposition-aware sentence and SHALL NOT echo raw JSON. Actionable failures SHALL remain visible.

#### Scenario: Follow-up is handed off
- **WHEN** a follow-up is durably delivered, pending activation, already active, or starts a new turn
- **THEN** the receipt reports only the Agent name and exact delivery disposition

#### Scenario: Active turn is interrupted
- **WHEN** graceful interruption succeeds
- **THEN** the receipt reports the Agent name and `interrupted`

#### Scenario: Interruption cannot safely stop the turn
- **WHEN** forced termination fails safely or produces an unresumable failure
- **THEN** the receipt reports `still_working` or `failed` without exposing process-control or reconciliation evidence

#### Scenario: Agent has no active turn
- **WHEN** interruption targets an Agent without an active turn
- **THEN** the receipt reports the Agent name and `no_active_turn`

### Requirement: Agent Skill guidance has a bounded context footprint
The seven installed Agent Skills SHALL remain self-contained and preserve their typed inputs, lifecycle distinctions, model and effort policy, behavioral write boundary, delegation depth, join obligations, account-limit stop rule, and actionable failure handling. Their aggregate whitespace-delimited word count SHALL NOT exceed 1,800, and successful presentation guidance SHALL prefer concise synthesis over raw receipt repetition.

#### Scenario: Plugin contract tests inspect Skills
- **WHEN** all seven installed `SKILL.md` files are measured
- **THEN** their aggregate word count is at most 1,800 while every required contract marker remains present

#### Scenario: Typed tool is unavailable
- **WHEN** a Skill cannot resolve its matching MCP tool
- **THEN** it reports Plugin discovery or startup failure instead of silently invoking a shell fallback

#### Scenario: User requests debug output
- **WHEN** the user explicitly asks for raw or operator diagnostic detail
- **THEN** the Skill may present requested evidence through the existing diagnostic boundary without enlarging ordinary success output

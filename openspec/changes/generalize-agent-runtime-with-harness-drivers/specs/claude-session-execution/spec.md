## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Typed spawn schema exposes only lead decisions
The typed `spawn_agent` schema SHALL require `task_name`, `message`, exact supported `model`, and boolean `write`. It SHALL expose only optional `description`, `reasoning_effort`, and `delegation_mode`. The typed `followup_task` schema SHALL expose only `target`, `message`, optional `reasoning_effort`, and optional `write`. Both SHALL reject `allowed_tools`; spawn SHALL also reject `fork_turns`, `execution_profile`, working-directory, environment-file, native-session, permission-mode, and dangerous-bypass fields as unknown public inputs.

#### Scenario: Minimal read-only spawn is submitted
- **WHEN** Codex supplies task name, message, exact model, and `write: false`
- **THEN** typed validation accepts the request without requiring a fork, profile selector, or tool list

#### Scenario: Retired tool allow-list is submitted to spawn
- **WHEN** a caller supplies `allowed_tools` to `spawn_agent`
- **THEN** strict typed validation rejects the call before the runtime factory mutates state

#### Scenario: Retired tool allow-list is submitted to follow-up
- **WHEN** a caller supplies `allowed_tools` to `followup_task`
- **THEN** strict typed validation rejects the call before mailbox or activation state changes

#### Scenario: Legacy public selectors are submitted
- **WHEN** a caller supplies `fork_turns` or `execution_profile`
- **THEN** strict typed validation rejects the call before the runtime factory mutates state

#### Scenario: Delegation mode is omitted
- **WHEN** a valid spawn request supplies no `delegation_mode`
- **THEN** the runtime receives a leaf activation

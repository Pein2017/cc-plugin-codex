## ADDED Requirements

### Requirement: Typed spawn schema exposes only lead decisions
The typed `spawn_agent` schema SHALL require `task_name`, `message`, exact supported `model`, and boolean `write`. It SHALL expose only optional `description`, `reasoning_effort`, `allowed_tools`, and `delegation_mode`. It SHALL reject `fork_turns`, `execution_profile`, working-directory, environment-file, native-session, permission-mode, and dangerous-bypass fields as unknown public inputs.

#### Scenario: Minimal read-only spawn is submitted
- **WHEN** Codex supplies task name, message, exact model, and `write: false`
- **THEN** typed validation accepts the request without requiring a fork or profile selector

#### Scenario: Legacy public selectors are submitted
- **WHEN** a caller supplies `fork_turns` or `execution_profile`
- **THEN** strict typed validation rejects the call before the runtime factory mutates state

#### Scenario: Delegation mode is omitted
- **WHEN** a valid spawn request supplies no `delegation_mode`
- **THEN** the runtime receives a leaf activation

## MODIFIED Requirements

### Requirement: Typed activation exposes one write intent
The typed `spawn_agent` tool SHALL require boolean `write` and `followup_task` SHALL expose optional boolean `write` for caller-owned mutation intent. False intent SHALL select permission-respecting terminal parity, true intent SHALL authorize terminal-parity dangerous permission bypass, and omitted follow-up intent SHALL inherit the Agent's latest activation authority. The MCP adapter SHALL NOT expose an execution-profile selector, add a second permission switch, or reinterpret the field outside the checkout-owned runtime.

#### Scenario: Typed read spawn is requested
- **WHEN** a caller passes `write: false` to spawn
- **THEN** the runtime activation omits terminal-parity dangerous permission bypass

#### Scenario: Typed spawn omits write intent
- **WHEN** a caller omits `write` from spawn
- **THEN** typed validation rejects the request before durable runtime state changes

#### Scenario: Typed write activation is requested
- **WHEN** a caller passes `write: true`
- **THEN** the runtime activation may add terminal-parity dangerous permission bypass

#### Scenario: Follow-up omits write intent
- **WHEN** an activating follow-up omits `write`
- **THEN** the runtime inherits the Agent's latest proven write authority without exposing an execution profile

## MODIFIED Requirements

### Requirement: Typed activation exposes one write intent
The typed `spawn_agent` tool SHALL require boolean `write` and `followup_task` SHALL expose optional boolean `write` for caller-owned mutation intent. False intent SHALL impose a prompt-level read/review boundary, true intent SHALL permit task-scoped mutation, and omitted follow-up intent SHALL inherit the Agent's latest activation authority. Both values SHALL use full-access terminal parity. The MCP adapter SHALL NOT expose an execution-profile selector, add a second permission switch, or reinterpret the field outside the checkout-owned runtime.

#### Scenario: Typed read activation is requested
- **WHEN** a caller passes `write: false` to spawn
- **THEN** the runtime activation uses terminal-parity dangerous permission bypass with a read-only behavioral delegation envelope

#### Scenario: Typed spawn omits write intent
- **WHEN** a caller omits `write` from spawn
- **THEN** typed validation rejects the request before durable runtime state changes

#### Scenario: Typed write activation is requested
- **WHEN** a caller passes `write: true`
- **THEN** the runtime activation uses terminal-parity dangerous permission bypass with task-scoped mutation authority

#### Scenario: Follow-up omits write intent
- **WHEN** an activating follow-up omits `write`
- **THEN** the runtime inherits the Agent's latest proven behavioral authority without exposing an execution profile

## ADDED Requirements

### Requirement: Typed activation exposes one write intent
The typed `spawn_agent` and `followup_task` tools SHALL expose only the optional boolean `write` field for caller-owned mutation intent. False or omitted intent SHALL select permission-respecting terminal parity, while true intent SHALL authorize terminal-parity dangerous permission bypass. The MCP adapter SHALL NOT add a second permission switch or reinterpret the field outside the checkout-owned runtime.

#### Scenario: Typed read activation is requested
- **WHEN** a caller passes `write: false` or omits `write`
- **THEN** the runtime activation omits terminal-parity dangerous permission bypass

#### Scenario: Typed write activation is requested
- **WHEN** a caller passes `write: true`
- **THEN** the runtime activation may add terminal-parity dangerous permission bypass

### Requirement: MCP annotations reflect reconciliation effects
MCP tool annotations SHALL describe observable runtime effects rather than treating logically observational output as proof of a zero-write implementation. `list_agents` SHALL advertise `readOnlyHint: false`, `destructiveHint: false`, and `idempotentHint: true` because it can persist convergent owner-scoped reconciliation repairs without consuming completion delivery.

#### Scenario: Host discovers list_agents
- **WHEN** Codex reads the typed tool catalog
- **THEN** `list_agents` is advertised as non-read-only, non-destructive, and idempotent

#### Scenario: Caller repeats list_agents
- **WHEN** no new lifecycle evidence appears between repeated calls
- **THEN** reconciliation converges on the same logical Agent projection without acknowledging completion delivery

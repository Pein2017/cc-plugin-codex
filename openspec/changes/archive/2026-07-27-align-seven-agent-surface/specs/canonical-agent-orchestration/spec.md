## REMOVED Requirements

### Requirement: Public runtime exposes only six canonical lifecycle operations
**Reason**: The public runtime now intentionally includes the root-scoped, observation-only `read_agent_messages` operation.
**Migration**: Use the replacement seven-operation requirement in this same capability.

## ADDED Requirements

### Requirement: Public runtime exposes only seven canonical Agent operations
The public runtime SHALL expose `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, and `read_agent_messages` as its complete model-facing Agent surface.

#### Scenario: Public runtime is inspected
- **WHEN** a caller enumerates the frozen Agent interface
- **THEN** exactly the seven canonical operations are present and old job-oriented operations are absent

## MODIFIED Requirements

### Requirement: Plugin skills map directly to the canonical operations
The installed Plugin SHALL expose exactly `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, `$cc-for-pein:list-agents`, and `$cc-for-pein:read-agent-messages`, each delegating to the matching checkout-owned snake_case runtime operation. All seven SHALL be identified as Experimental and eligible for model-visible skill discovery in a newly started Codex task.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads Plugin version `0.4.0`
- **THEN** all seven Experimental Agent skills are present in the model-visible catalog and none of the old lifecycle skills is discoverable

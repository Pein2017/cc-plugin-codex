## ADDED Requirements

### Requirement: Timeout guidance uses the final observation guarantee
The model-facing wait guidance SHALL state that a timeout means no unread
current-root completion was visible at the call's final observation. It SHALL
instruct the lead not to call `list_agents` solely to recheck completion after
that timeout, while preserving the existing rule that timeout does not prove
failure, cancellation, health, progress, or future inactivity.

#### Scenario: Lead receives a genuine timeout
- **WHEN** `wait_agent` returns timeout after its final completion observation
- **THEN** the lead does not immediately call `list_agents` merely to ask whether completion was missed

#### Scenario: Lead needs intentional progress evidence
- **WHEN** scheduling depends on one intermediate activity observation rather than completion
- **THEN** the lead uses the existing bounded `wake_on_progress` behavior instead of treating timeout status as health evidence

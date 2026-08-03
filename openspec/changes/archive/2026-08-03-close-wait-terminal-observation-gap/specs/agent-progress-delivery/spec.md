## ADDED Requirements

### Requirement: Final completion observation outranks claimed progress
When an opt-in wait has claimed one advisory progress revision and a completion
is visible at the final post-reconciliation observation, `wait_agent` SHALL
return the completion instead of the progress update. The claimed advisory
revision SHALL remain consumed and SHALL NOT be redelivered. This override
SHALL NOT alter the progress budget of a later Agent turn.

#### Scenario: Agent completes after progress claim
- **WHEN** an opt-in wait claims progress and the same or another current-root Agent completion is unread at final observation
- **THEN** the public receipt contains the completion and not the claimed progress

#### Scenario: Superseded progress stays consumed
- **WHEN** progress was claimed before a final-observation completion superseded it
- **THEN** a later opt-in wait does not redeliver that claimed revision

#### Scenario: Later turn publishes progress
- **WHEN** the durable Agent begins a later job after a progress revision was superseded by completion
- **THEN** the later job retains its independent one-progress delivery budget

## ADDED Requirements

### Requirement: Targeted progress observation is fixed to one Agent turn
An opt-in progress wait with `targets` SHALL accept exactly one current-root Agent and SHALL snapshot that Agent's active or latest concrete job at call entry. It SHALL observe progress and completion only for that job, preserve the existing one-progress-per-job budget, and leave unrelated root activity untouched. A progress-enabled target set larger than one SHALL be rejected before any acknowledgement or progress claim.

#### Scenario: Selected target publishes progress
- **WHEN** the snapshotted target job publishes its first eligible non-hook progress before completion
- **THEN** wait may atomically claim and return that one bounded target progress update

#### Scenario: Selected target completes during progress claim
- **WHEN** target completion becomes visible at the final post-reconciliation observation after progress was claimed
- **THEN** completion outranks progress and the claimed advisory revision remains consumed

#### Scenario: Unrelated completion is unread
- **WHEN** another Agent has an older unread completion while the selected target publishes eligible progress
- **THEN** targeted progress returns the selected target update and does not freeze, acknowledge, or return the unrelated completion

#### Scenario: Multiple progress targets are supplied
- **WHEN** an opt-in progress wait names two or more targets
- **THEN** validation rejects the request without claiming progress or changing completion delivery

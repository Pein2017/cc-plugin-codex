## ADDED Requirements

### Requirement: Agent Cards may observe the latest safe phase without delivering progress
An explicit `list_agents` call MAY project the latest already-persisted public-progress activity into a closed safe Agent Card phase and activity timestamp. This logical observation SHALL omit the progress summary and revision, SHALL NOT mark any progress revision delivered, SHALL NOT consume the per-job progress budget, and SHALL NOT change completion or Agent lifecycle state.

#### Scenario: List observes an undelivered progress revision
- **WHEN** an active job has safe persisted progress that no `wake_on_progress` wait has claimed
- **THEN** the Agent Card reports only its normalized phase and timestamp while the revision remains eligible for one explicit progress wait

#### Scenario: Latest activity is private hook evidence
- **WHEN** the latest persisted progress activity is a hook
- **THEN** the Agent Card phase is `null` and no hook name, payload, timestamp, or summary becomes model-visible

#### Scenario: Public progress is absent
- **WHEN** an Agent has no retained safe public-progress evidence
- **THEN** its Agent Card phase and activity timestamp remain `null` rather than being inferred from status or elapsed time


## ADDED Requirements

### Requirement: Operator compatibility diagnosis is zero-model and non-persistent
Doctor SHALL reuse the required Claude option/value vocabulary and executable fingerprinting semantics to run a static compatibility diagnosis without invoking a model or persisting Agent readiness evidence. Its result SHALL contain only normalized version, compatibility status, bounded missing surface, and fixed failure code.

#### Scenario: Updated Claude remains compatible
- **WHEN** doctor inspects a newly updated executable that advertises the required surface and remains stable through the probe
- **THEN** it reports static compatibility without creating a job, Agent, completion event, or compatibility-state record

#### Scenario: Updated Claude drops a required flag
- **WHEN** doctor observes a missing required CLI flag or value
- **THEN** it fails the compatibility check with bounded missing-surface evidence and launches no model

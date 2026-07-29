## ADDED Requirements

### Requirement: Operator storage diagnosis does not trigger lifecycle repair
Storage diagnosis SHALL inspect Plugin-owned files as metadata and bounded control records without calling reconciliation, stale-job reaping, completion acknowledgement, registry mutation, retention cleanup, or session-lease code. It SHALL report malformed records separately and leave every file unchanged.

#### Scenario: A stale active job record exists
- **WHEN** doctor scans a job whose process is no longer live
- **THEN** it reports the stored status as inventory and does not transition the job

#### Scenario: Unread completion exists
- **WHEN** doctor scans an inbox with events beyond its acknowledgement cursor
- **THEN** it reports the unread count without freezing delivery payloads or advancing the cursor

### Requirement: Cleanup candidates are conservative and dry-run only
Storage diagnosis SHALL classify cleanup candidates without deleting them. Candidate paths SHALL remain within the Plugin data root and SHALL be limited to stale atomic temporary files, stale reservation files, and terminal Plugin jobs beyond the newest 100 records per owner bucket. Active jobs, Agent registries, completion inboxes, session bindings, and all paths under `CLAUDE_CONFIG_DIR` SHALL be excluded.

#### Scenario: Candidate path escapes Plugin data root
- **WHEN** a discovered path does not canonicalize beneath the Plugin data root
- **THEN** it is excluded and reported as a diagnostic boundary failure

#### Scenario: Active job is old
- **WHEN** an active job record exceeds an age threshold
- **THEN** it remains inventory only and is not classified as a cleanup candidate

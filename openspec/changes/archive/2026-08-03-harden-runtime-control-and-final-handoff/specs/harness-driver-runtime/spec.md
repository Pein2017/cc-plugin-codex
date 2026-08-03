## ADDED Requirements

### Requirement: Driver activity evidence is byte bounded
Each Harness Driver SHALL persist a bounded activity summary that cannot include arbitrary tool-input values, while retaining enough tool names, input-key names, and touched-file evidence for progress observation.

#### Scenario: Tool input contains a large value
- **WHEN** a native tool event contains a multi-megabyte input field
- **THEN** the persisted activity receipt remains within its configured byte bound and does not store that value

### Requirement: Driver completion separates progress from final output
Each Harness Driver SHALL keep progress aggregation independent from the final outer-assistant handoff selected for completion delivery.

#### Scenario: Progress contains earlier assistant text
- **WHEN** progress events include assistant text that precedes the final outer-assistant message
- **THEN** progress remains observable but does not prefix the completion handoff

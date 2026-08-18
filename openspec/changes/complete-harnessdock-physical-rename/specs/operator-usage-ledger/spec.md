## MODIFIED Requirements

### Requirement: Usage report uses fixed replay-safe evidence
The operator surface SHALL produce a fixed UTC half-open-window report, defaulting to the preceding seven days, from Codex rollout `mcp_tool_call_end` events whose server is exactly `codex_harnessdock`. Events from any other server name, including the retired `cc_for_pein` identity, SHALL NOT be admitted as usage: after the authorized durable-state reset there is no pre-cutover lineage to represent, and a retired-identity event in the window SHALL be counted only as an identity diagnostic. The report SHALL index retained owning-session and direct-parent IDs, scan retained rollouts in deterministic oldest-first order, and reserve each non-empty MCP `call_id` before applying the report window, so a historical event copied into a later fork cannot become recent usage. It SHALL report primary-rollout records without an ID separately, reject malformed IDs, and fail closed for no-ID fork records or fork files whose direct parent is not retained. It SHALL aggregate tool counts, explicit tool errors, wait outcomes, spawn route selections, unique completion deliveries, closed terminal metrics, and operator dispositions. Provider-reported cost SHALL be labeled as provider-reported rather than billed or estimated cost. The report SHALL expose its generated time, window bounds, scanned-file count, qualifying-call count, retired-identity diagnostic count, replay exclusions, unresolved replay diagnostics, and malformed evidence counters.

#### Scenario: Rollout event is replayed in another file
- **WHEN** two qualifying records carry the same non-empty MCP call ID
- **THEN** the report counts the call once and increments its replay-exclusion counter

#### Scenario: Historical call is copied into a later fork
- **WHEN** a canonical pre-window event and an in-window fork-materialized copy carry the same non-empty MCP call ID
- **THEN** the report reserves the canonical occurrence before windowing and does not count the copied event as in-window usage

#### Scenario: Retired-identity event appears in the window
- **WHEN** a rollout records a `cc_for_pein` MCP event inside the report window
- **THEN** the report excludes it from usage totals and increments the retired-identity diagnostic counter without guessing a transition boundary

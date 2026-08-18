## MODIFIED Requirements

### Requirement: Usage report uses fixed replay-safe evidence
The operator surface SHALL produce a fixed UTC half-open-window report, defaulting to the preceding seven days, from Codex rollout `mcp_tool_call_end` events whose server is exactly `codex_harnessdock`. It MAY additionally admit events whose server is exactly `cc_for_pein` only when their event timestamp predates the accepted identity-cutover timestamp and retained source provenance proves they belong to the pre-cutover lineage; post-cutover legacy-server events SHALL be rejected and counted as identity diagnostics. The report SHALL index retained owning-session and direct-parent IDs, scan retained rollouts in deterministic oldest-first order, and reserve each non-empty MCP `call_id` before applying the report window, so a historical event copied into a later fork cannot become recent usage. It SHALL report primary-rollout records without an ID separately, reject malformed IDs, and fail closed for no-ID fork records or fork files whose direct parent is not retained. It SHALL aggregate tool counts, explicit tool errors, wait outcomes, spawn route selections, unique completion deliveries, closed terminal metrics, and operator dispositions. Provider-reported cost SHALL be labeled as provider-reported rather than billed or estimated cost. The report SHALL expose its generated time, window bounds, identity-cutover boundary, per-namespace qualifying counts, scanned-file count, qualifying-call count, replay exclusions, unresolved replay diagnostics, and malformed evidence counters.

#### Scenario: Rollout event is replayed in another file
- **WHEN** two qualifying records carry the same non-empty MCP call ID
- **THEN** the report counts the call once and increments its replay-exclusion counter

#### Scenario: Historical call is copied into a later fork
- **WHEN** a canonical pre-window event and an in-window fork-materialized copy carry the same non-empty MCP call ID
- **THEN** the report reserves the canonical occurrence before windowing and does not count the copied event as in-window usage

#### Scenario: Pre-cutover legacy event remains in the report window
- **WHEN** a retained `cc_for_pein` event predates the accepted cutover timestamp and satisfies the ordinary replay/provenance rules
- **THEN** the report counts it under the legacy namespace without rewriting it as HarnessDock traffic

#### Scenario: Legacy server event occurs after cutover
- **WHEN** a rollout records `cc_for_pein` at or after the accepted cutover timestamp
- **THEN** the report excludes it from usage totals and increments an identity-drift diagnostic

#### Scenario: Accepted cutover timestamp is unavailable
- **WHEN** the report cannot validate an accepted identity-cutover timestamp
- **THEN** it admits no `cc_for_pein` event, reports legacy coverage unavailable, and does not guess a transition boundary

#### Scenario: Forked event has no call ID
- **WHEN** a fork rollout contains an in-window HarnessDock or admitted legacy event without a non-empty call ID
- **THEN** the report records unresolved replay evidence and does not aggregate that event

#### Scenario: Fork parent is no longer retained
- **WHEN** a fork rollout names a direct parent session that is absent from the retained session corpus
- **THEN** the report records the unresolved file and rejects all of its candidate HarnessDock or admitted legacy events rather than guessing which are imported

#### Scenario: Completion is redelivered
- **WHEN** the same delivery token appears in multiple successful wait receipts
- **THEN** completion metrics and acceptance disposition are counted once while redelivery is reported separately

#### Scenario: Fixed report end is supplied
- **WHEN** the operator supplies an explicit UTC report end and a valid day count
- **THEN** the report covers exactly `[end - days, end)` and emits those bounds

#### Scenario: Provider metrics are absent
- **WHEN** a completion has no closed terminal metrics receipt
- **THEN** the report counts the completion without inventing tokens, duration, or cost

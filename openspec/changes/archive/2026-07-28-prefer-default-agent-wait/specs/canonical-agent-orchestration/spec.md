## MODIFIED Requirements

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL default its observation upper bound to 600000 ms, SHALL reject values above 3600000 ms, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. Model-facing guidance SHALL make omission of `timeout_ms` the canonical ordinary wait invocation and SHALL reserve an explicit bound for an intentional immediate probe, shorter observation window, or longer bounded wait. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include the complete stored Agent final message, its legacy-compatible truncation flag, and opaque delivery token; a progress update SHALL include only the safe bounded public-progress projection when its adaptive delivery interval is eligible. It SHALL omit raw inbox state, full Agent records, result pointers, native session evidence, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one status/summary/complete-final-message update with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous completion prefix
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent publishes progress
- **WHEN** any current-root Agent publishes safe progress before timeout and no completion is unread
- **THEN** wait reports one bounded progress update without returning Claude text or tool inputs

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait reports completion activity with the complete stored Agent final message

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without new current-root Agent progress or completion activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

#### Scenario: Ordinary caller omits timeout
- **WHEN** the parent performs an ordinary wait without a specific scheduling deadline
- **THEN** model-facing guidance omits `timeout_ms` and the observation deadline is 600000 ms while eligible progress or completion may return earlier

#### Scenario: Caller intentionally overrides timeout
- **WHEN** the parent needs an immediate probe, shorter observation window, or longer bounded wait
- **THEN** it may pass an explicit `timeout_ms` without changing Agent execution lifetime

#### Scenario: Caller exceeds the maximum
- **WHEN** the parent requests `timeout_ms` greater than 3600000
- **THEN** wait rejects the invalid bound before changing Agent or delivery state

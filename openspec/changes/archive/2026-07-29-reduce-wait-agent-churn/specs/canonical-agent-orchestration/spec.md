## MODIFIED Requirements

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms`, optional `wake_on_progress`, plus the CC durable-delivery extension `acknowledge_tokens`, SHALL default its observation upper bound to 600000 ms, SHALL reject values above 3600000 ms, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. Model-facing guidance SHALL make omission of `timeout_ms` and `wake_on_progress` the canonical ordinary join, SHALL reserve an explicit timeout for an intentional immediate probe, shorter observation window, or longer bounded wait, and SHALL reserve `wake_on_progress: true` for one intentional intermediate observation. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include the complete stored Agent final message, its legacy-compatible truncation flag, and opaque delivery token. A progress update SHALL include only the safe bounded public-progress projection when the caller opted in and its adaptive delivery interval is eligible. It SHALL omit raw inbox state, full Agent records, result pointers, native session evidence, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one status/summary/complete-final-message update with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous completion prefix
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent publishes progress during ordinary join
- **WHEN** a current-root Agent publishes safe progress before timeout, no completion is unread, and the caller omitted or disabled `wake_on_progress`
- **THEN** wait does not return or acknowledge that progress and continues toward completion or timeout

#### Scenario: Caller requests one progress observation
- **WHEN** a current-root Agent publishes eligible safe progress before timeout, no completion is unread, and the caller set `wake_on_progress: true`
- **THEN** wait reports one bounded progress update without returning Claude text or tool inputs

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait reports completion activity with the complete stored Agent final message regardless of `wake_on_progress`

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without unread current-root completion or explicitly eligible progress activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

#### Scenario: Ordinary caller omits timeout and progress wakeup
- **WHEN** the parent performs an ordinary required join without a specific scheduling deadline
- **THEN** model-facing guidance omits both optional fields, the observation deadline is 600000 ms, and completion may return earlier

#### Scenario: Caller intentionally overrides timeout
- **WHEN** the parent needs an immediate probe, shorter observation window, or longer bounded wait
- **THEN** it may pass an explicit `timeout_ms` without changing Agent execution lifetime

#### Scenario: Caller exceeds the maximum
- **WHEN** the parent requests `timeout_ms` greater than 3600000
- **THEN** wait rejects the invalid bound before changing Agent or delivery state

### Requirement: Parent orchestration uses explicit join policy
The spawn and wait skill contracts SHALL require the parent to classify delegated work as required, parallel-then-join, or explicitly detached. The parent SHALL NOT give its final answer while a required or parallel-then-join result remains undisposed, SHALL continue meaningful non-overlapping work before waiting when possible, and SHALL use detached mode only when the user clearly requests background execution and the result is not needed in the current answer. The parent SHALL call `wait_agent` sparingly: an ordinary join SHALL omit progress wakeup, while an explicit progress wakeup SHALL be used only for one intentional intermediate observation and SHALL NOT be reflexively repeated.

#### Scenario: Child result is required evidence
- **WHEN** the parent's conclusion depends on a spawned Agent's result
- **THEN** the parent performs one completion-first join and synthesizes that completion before giving its final answer

#### Scenario: Independent parent work remains
- **WHEN** a spawned Agent can run concurrently with meaningful non-overlapping parent work
- **THEN** the parent performs that work before joining rather than immediately polling by reflex

#### Scenario: Parent intentionally samples progress
- **WHEN** intermediate Agent activity materially informs scheduling or intervention
- **THEN** the parent may request one progress wakeup and returns to a completion-first join instead of repeatedly requesting progress

#### Scenario: User explicitly requests background execution
- **WHEN** the user asks to detach work whose result is not needed for the current answer
- **THEN** the parent may end after reporting the durable Agent identity and the lack of automatic host reactivation

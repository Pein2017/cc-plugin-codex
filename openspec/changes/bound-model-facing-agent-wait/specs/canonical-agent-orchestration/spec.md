## MODIFIED Requirements

### Requirement: wait_agent returns bounded root mailbox activity
Model-facing `wait_agent` SHALL accept optional `wake_on_progress` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL NOT expose `timeout_ms`, SHALL use a fixed 600000 ms observation upper bound, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and SHALL then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. Model-facing guidance SHALL make omission of `wake_on_progress` the canonical ordinary join and SHALL reserve `wake_on_progress: true` for one intentional intermediate observation whose result changes scheduling. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include the complete stored Agent final message, its legacy-compatible truncation flag, and opaque delivery token. A progress update SHALL include only one safe bounded public-progress projection per active Agent job when the caller opted in and that job has not already exposed progress. It SHALL omit hook activity, raw inbox state, full Agent records, result pointers, native session evidence, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one status/summary/complete-final-message update with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous completion prefix
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent publishes progress during ordinary join
- **WHEN** a current-root Agent publishes safe progress before the fixed deadline, no completion is unread, and the caller omitted or disabled `wake_on_progress`
- **THEN** wait does not return or acknowledge that progress and continues toward completion or timeout

#### Scenario: Caller requests one progress observation
- **WHEN** a current-root Agent job publishes its first eligible non-hook safe progress before the fixed deadline, no completion is unread, and the caller set `wake_on_progress: true`
- **THEN** wait reports that job's single bounded progress update without returning Claude text or tool inputs

#### Scenario: Caller repeats progress observation for the same job
- **WHEN** a current-root Agent job already exposed one progress update and remains active
- **THEN** later waits do not expose another progress update for that job and remain completion-first

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before the fixed deadline
- **THEN** wait reports completion activity with the complete stored Agent final message regardless of `wake_on_progress`

#### Scenario: Root mailbox remains quiet
- **WHEN** the fixed 600000 ms observation window expires without unread current-root completion or eligible first progress activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

#### Scenario: Model supplies timeout override
- **WHEN** the parent includes `timeout_ms` in a model-facing wait request
- **THEN** the strict typed boundary rejects the field before changing Agent or delivery state

### Requirement: Parent orchestration uses explicit join policy
The spawn and wait skill contracts SHALL require the parent to classify delegated work as required, parallel-then-join, or explicitly detached. The parent SHALL NOT give its final answer while a required or parallel-then-join result remains undisposed, SHALL continue meaningful non-overlapping work before waiting when possible, and SHALL use detached mode only when the user clearly requests background execution and the result is not needed in the current answer. The parent SHALL call `wait_agent` only when the critical path is blocked: an ordinary join SHALL use the fixed completion-first observation, while an explicit progress wakeup SHALL be used only for one intentional intermediate observation and SHALL NOT be reflexively repeated.

#### Scenario: Child result is required evidence
- **WHEN** the parent's conclusion depends on a spawned Agent's result
- **THEN** the parent performs one completion-first join and synthesizes that completion before giving its final answer

#### Scenario: Independent parent work remains
- **WHEN** a spawned Agent can run concurrently with meaningful non-overlapping parent work
- **THEN** the parent performs that work before joining rather than immediately polling by reflex

#### Scenario: Parent intentionally samples progress
- **WHEN** intermediate Agent activity materially informs scheduling or intervention
- **THEN** the parent may request one progress wakeup and then does useful work, steers, or returns to a completion-first join instead of requesting more progress from the same job

#### Scenario: User explicitly requests background execution
- **WHEN** the user asks to detach work whose result is not needed for the current answer
- **THEN** the parent may end after reporting the durable Agent identity and the lack of automatic host reactivation


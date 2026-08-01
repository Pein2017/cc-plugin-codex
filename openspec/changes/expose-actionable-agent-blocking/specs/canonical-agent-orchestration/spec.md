## MODIFIED Requirements

### Requirement: send_message never activates an idle Agent
`send_message` SHALL append the complete message and delivery evidence to the Agent-level durable mailbox, deliver to an active Agent turn when possible, and leave the message queued without starting a new turn when the Agent is terminal. A successful model-facing receipt SHALL contain only stable `agent_name` and `delivery`; it SHALL preserve the `dispatched_active`, `activation_pending`, and `queued_no_turn` dispositions while excluding Agent status, the message text, message and Agent IDs, timestamps, assignment, job, steering, model, and delegation metadata. A rejection against a blocked Agent SHALL name only the closed `reason`, `scope`, and `retry` values and SHALL NOT interpolate stored continuation evidence text. Model-facing guidance SHALL summarize success in one concise disposition-aware sentence and SHALL NOT print raw JSON unless the user explicitly requests debug detail.

#### Scenario: Agent is running
- **WHEN** a message is sent during an active Claude stream
- **THEN** it is delivered in durable order at the next supported stream boundary and the public receipt reports `dispatched_active` without internal delivery evidence

#### Scenario: Agent is terminal
- **WHEN** a message is sent while no turn is active
- **THEN** it is retained as a `queued` Agent-mailbox entry, the public receipt reports `queued_no_turn`, and no Claude process starts

#### Scenario: Agent activation is pending
- **WHEN** the message is durably assigned to an Agent activation that has not yet reached a supported stream boundary
- **THEN** the public receipt reports `activation_pending` without exposing its assigned job or mailbox record

#### Scenario: Agent is activation-blocked
- **WHEN** an errored Agent has `continuation=blocked`
- **THEN** send rejects the message with the closed blocking reason, scope, and retry instead of queueing it indefinitely or repeating the stored continuation reason text

#### Scenario: Parent presents successful delivery
- **WHEN** the model receives a successful `send_message` receipt
- **THEN** it presents one concise sentence reflecting the delivery disposition and does not repeat the message or raw receipt unless the user requested debug detail

### Requirement: followup_task guarantees activation
`followup_task` SHALL make the message available to an active Agent promptly or start a new exact-session or receipt-proven safe-fresh turn when the Agent is terminal. It SHALL inherit the Agent's immutable delegation mode and SHALL reject any attempted mode override or retired `allowed_tools` field. Before any path that activates a new turn mutates the mailbox, job store, or steering state, it SHALL synchronously validate the complete inherited mode and requested effort and write intent. Activation SHALL atomically assign queued Agent-mailbox entries to the winning job. A rejection against a blocked Agent SHALL name only the closed `reason`, `scope`, and `retry` values and SHALL NOT interpolate stored continuation evidence text.

#### Scenario: Agent is completed
- **WHEN** a valid follow-up is submitted to an owner-valid completed Agent
- **THEN** a new internal job starts on the Agent's exact Claude session, inherits its delegation mode, and consumes queued messages in order

#### Scenario: Activating follow-up has invalid execution options
- **WHEN** a terminal Agent receives a follow-up with an unsupported effort, permission combination, or delegation-mode override
- **THEN** follow-up fails before appending or assigning mailbox messages, preparing a job, or writing steering state

#### Scenario: Retired tool allow-list is supplied
- **WHEN** follow-up includes `allowed_tools`
- **THEN** follow-up rejects the retired field before mailbox mutation or activation

#### Scenario: Agent is already running
- **WHEN** follow-up is submitted during an active turn
- **THEN** the message is durably delivered at the next supported boundary without starting a competing job

#### Scenario: Errored first turn is safe to retry fresh
- **WHEN** the Agent has no session and its durable receipt proves no possible side effect
- **THEN** follow-up may start a fresh Claude session on the same stable Agent with the same delegation mode

#### Scenario: Errored Agent is activation-blocked
- **WHEN** neither exact-session resume nor receipt-proven safe fresh retry is available
- **THEN** follow-up is rejected with the closed blocking reason, scope, and retry rather than the stored continuation reason text

#### Scenario: Blocked Agent identity cannot be reused
- **WHEN** an Agent is blocked by a lost native session and its retry value names a new Agent
- **THEN** the rejection states that recovery requires a new Agent, the blocked Agent retains its identity, name, and history, and no unblock, close, archive, or name-release path exists

### Requirement: wait_agent returns bounded root mailbox activity
Model-facing `wait_agent` SHALL accept optional `wake_on_progress` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL NOT expose `timeout_ms`, SHALL use a fixed 600000 ms observation upper bound, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and SHALL then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. Model-facing guidance SHALL make omission of `wake_on_progress` the canonical ordinary join and SHALL reserve `wake_on_progress: true` for one intentional intermediate observation whose result changes scheduling. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include the complete stored Agent final message, its legacy-compatible truncation flag, opaque delivery token, and one nested `blocking` field holding only closed `reason`, `scope`, and `retry` values. That field SHALL be non-null for every `failed` terminal fact and for an `interrupted` terminal fact without proven safe flush, and SHALL be `null` for a `completed` terminal fact and for an `interrupted` terminal fact whose receipt proves a safe flush. A progress update SHALL include only one safe bounded public-progress projection per active Agent job when the caller opted in and that job has not already exposed progress. It SHALL omit hook activity, raw inbox state, full Agent records, result pointers, native session evidence, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call. The checkout CLI and public runtime operation MAY retain an explicit 0..3600000 ms diagnostic bound that is never reachable from the model-facing boundary.

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

#### Scenario: Root Agent fails without producing text
- **WHEN** a current-root Agent turn ends failed and produced no outer-assistant text
- **THEN** wait reports the failed status together with the closed blocking reason, scope, and retry rather than only a fixed summary and an empty completion message

#### Scenario: Successful completion carries no blocking evidence
- **WHEN** a current-root Agent turn ends completed
- **THEN** the completion update reports `blocking: null` regardless of the content of its final message

#### Scenario: Gracefully interrupted Agent carries no blocking evidence
- **WHEN** a current-root Agent turn was interrupted at the parent's request and its receipt proves a safe flush
- **THEN** the completion update reports status `interrupted` with `blocking: null`, and the parent may resume that same durable Agent with `followup_task` on its exact session

#### Scenario: Unflushed interruption is blocking
- **WHEN** a current-root Agent turn was terminated without a receipt proving a safe flush
- **THEN** the completion update reports status `interrupted` with a non-null `interrupted_unflushed` reason, Agent scope, and a new-Agent retry

#### Scenario: Root mailbox remains quiet
- **WHEN** the fixed 600000 ms observation window expires without unread current-root completion or eligible first progress activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

#### Scenario: Ordinary caller omits timeout and progress wakeup
- **WHEN** the parent performs an ordinary required join without a specific scheduling deadline
- **THEN** it supplies no timeout field at all, omits `wake_on_progress`, observes for the fixed 600000 ms upper bound, and may return earlier on completion

#### Scenario: Caller intentionally overrides timeout
- **WHEN** the parent attempts an immediate probe, shorter observation window, or longer bounded wait by supplying `timeout_ms`
- **THEN** the model-facing boundary rejects that field before changing Agent or delivery state, leaving explicit bounds available only to the checkout CLI and runtime

#### Scenario: Caller exceeds the maximum
- **WHEN** a checkout CLI or direct runtime observation requests a timeout greater than 3600000 ms
- **THEN** the runtime rejects the invalid bound before changing Agent or delivery state

### Requirement: Parent orchestration uses explicit join policy
The spawn and wait skill contracts SHALL require the parent to classify delegated work as required, parallel-then-join, or explicitly detached. The parent SHALL NOT give its final answer while a required or parallel-then-join result remains undisposed, SHALL continue meaningful non-overlapping work before waiting when possible, and SHALL use detached mode only when the user clearly requests background execution and the result is not needed in the current answer. The parent SHALL call `wait_agent` only when the critical path is blocked: an ordinary join SHALL use the fixed completion-first observation, while an explicit progress wakeup SHALL be used only for one intentional intermediate observation and SHALL NOT be reflexively repeated. When a join returns non-null blocking evidence, the parent SHALL branch on its `scope`: a Harness-scoped block SHALL stop further Agent starts in that workflow without substituting another model or Harness, while an Agent-scoped block SHALL affect only that lane and SHALL leave sibling Agents running. A join that returns `blocking: null` SHALL NOT be treated as a blocked lane, and the parent SHALL NOT treat its own successful interrupt as a failure.

#### Scenario: Child result is required evidence
- **WHEN** the parent's conclusion depends on a spawned Agent's result
- **THEN** the parent performs one completion-first join and synthesizes that completion before giving its final answer

#### Scenario: Independent parent work remains
- **WHEN** a spawned Agent can run concurrently with meaningful non-overlapping parent work
- **THEN** the parent performs that work before joining rather than immediately polling by reflex

#### Scenario: Parent intentionally samples progress
- **WHEN** intermediate Agent activity materially informs scheduling or intervention
- **THEN** the parent may request one progress wakeup and then does useful work, steers, or returns to a completion-first join instead of requesting more progress from the same job

#### Scenario: Join returns a Harness-scoped block
- **WHEN** a required join reports blocking evidence whose scope is the Harness
- **THEN** the parent reports the condition, starts no further Agents in that workflow, and does not retry or substitute another model or Harness

#### Scenario: Join returns an Agent-scoped block
- **WHEN** a required join reports blocking evidence whose scope is one Agent and whose retry names a new Agent
- **THEN** the parent may re-delegate that lane under a new Agent while other current-root Agents continue unaffected

#### Scenario: Parent resumes an Agent it interrupted
- **WHEN** the parent interrupted an Agent, the join reports status `interrupted` with `blocking: null`, and the paused work is still wanted
- **THEN** the parent resumes that same durable Agent with `followup_task` rather than re-delegating the lane under a new Agent

#### Scenario: User explicitly requests background execution
- **WHEN** the user asks to detach work whose result is not needed for the current answer
- **THEN** the parent may end after reporting the durable Agent identity and the lack of automatic host reactivation

## ADDED Requirements

### Requirement: A completed turn that requests a decision is an ordinary join outcome
An Agent that ends its turn asking the parent for a decision SHALL reach ordinary `completed` status, and its request SHALL be carried only by the complete stored final message. The runtime SHALL NOT introduce a durable needs-input status, a sixth model-facing status value, or blocking evidence for that outcome. Model-facing guidance SHALL direct the parent to answer such a completion with `followup_task` on the same Agent, preserving its exact session and immutable route, rather than spawning a replacement Agent or treating the question as a failure.

#### Scenario: Agent ends its turn with a question
- **WHEN** a required join returns a completed Agent whose final message asks the parent for a decision
- **THEN** the parent answers with `followup_task` on that same Agent and does not spawn a replacement or report the join as failed

#### Scenario: A question is not blocking evidence
- **WHEN** a completed Agent's final message contains question, permission, quota, or blocking wording
- **THEN** the completion update still reports `completed` with `blocking: null` and the runtime derives no status from the message text

#### Scenario: Parent lacks the requested decision
- **WHEN** the parent cannot answer the Agent's question without the user
- **THEN** it reports the Agent's request as an ordinary completed result and leaves the Agent idle and resumable rather than interrupting or re-spawning it

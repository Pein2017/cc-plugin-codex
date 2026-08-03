# completion-delivery Specification

## Purpose

Define durable, bounded, at-least-once completion delivery across inactive Codex turns without a resident forwarding process.
## Requirements
### Requirement: Every terminal job emits one durable completion event
The runtime SHALL create exactly one root-owned, Agent-linked completion event when an Agent's internal job first reaches `completed`, `interrupted`, or `failed`; the event SHALL map internal `failed` to Agent `errored` and retain the complete `finalMessage`, legacy-compatible `truncated`, `detailedResultAvailable`, and `claudeSessionIdAvailable` fields. New completion events SHALL preserve the complete final message without a Plugin-defined content limit and SHALL set `truncated=false`; an existing event whose content was truncated by an older runtime SHALL retain that historical provenance.

#### Scenario: Worker publishes terminal state
- **WHEN** a non-terminal internal job first commits completed, interrupted, or failed state
- **THEN** an idempotently keyed completion event identifies both the internal job and stable Agent and uses the defined Agent-status mapping

#### Scenario: Reconciliation sees an event after a crash
- **WHEN** a terminal Agent turn exists without its deterministic completion event
- **THEN** reconciliation appends the missing Agent-linked event once without duplicating an existing event

#### Scenario: Final output exceeds the completion bound
- **WHEN** a new Agent turn's final output is larger than 64 KiB in UTF-8
- **THEN** the event retains the complete final message and records that the Plugin did not truncate it

#### Scenario: Legacy event was already truncated
- **WHEN** the runtime reads an existing completion event whose persisted truncation flag is true
- **THEN** it preserves that flag and stored prefix without claiming that discarded bytes were recovered

### Requirement: Completion events use two-phase at-least-once delivery
Each owner root SHALL have a monotonic completion sequence and an atomic cursor for the highest contiguously acknowledged Agent-linked event. A model-facing wait SHALL return at most the oldest unread Agent-linked summary with an opaque delivery token and the complete stored final message, and SHALL NOT acknowledge that update in the same response-producing call. The first model-facing delivery SHALL atomically freeze the payload identified by that token against later in-place reconciliation. The handoff SHALL carry the legacy-compatible truncation flag. Result pointers, resumability evidence, and Claude session evidence SHALL remain internal and absent from the default projection.

#### Scenario: Next Codex turn checks unread completions
- **WHEN** the same owner root reads its completion inbox after a background job finishes
- **THEN** the runtime returns one status/summary/complete-final-message update and its delivery token

#### Scenario: Completion handoff exceeds its public bound
- **WHEN** the stored Agent final message is larger than 4096 bytes in UTF-8 and was not previously truncated
- **THEN** the public update returns that complete message and reports `completion_message_truncated=false`

#### Scenario: Later call confirms contiguous delivery
- **WHEN** a later wait echoes valid delivery tokens for the oldest unread contiguous prefix
- **THEN** the cursor advances atomically through that update and any skipped legacy prefix

#### Scenario: Runtime crashes after producing a response
- **WHEN** the response does not reach Codex and no later call echoes its tokens
- **THEN** the cursor remains unchanged and the same complete update is delivered again

#### Scenario: Reconciliation changes after first delivery
- **WHEN** an event has already been returned to a model-facing wait and later reconciliation proposes different terminal content
- **THEN** the original token and complete frozen payload remain immutable for redelivery

#### Scenario: Agent starts a follow-up before acknowledgement
- **WHEN** an exposed completion remains unread while the same Agent lifecycle changes for a new turn
- **THEN** redelivery under the original token retains the frozen terminal status and is identical to the first public update

#### Scenario: Acknowledgement skips an older event
- **WHEN** an echoed token does not identify the oldest unread Agent-linked update
- **THEN** the runtime rejects the acknowledgement without advancing past unseen events

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens` from a prior response, then report the oldest already-unread Agent-linked completion or wait for the next current-root Agent completion up to `timeout_ms`. It SHALL additionally observe safe progress activity only when the caller explicitly sets `wake_on_progress: true`. Every newly returned completion SHALL remain unread until its token is echoed in a later wait. Observation that finds no unread Agent-linked completion or only an already-frozen completion SHALL use the validated inbox snapshot without acquiring the persistence write lock or calling fsync. Reconciliation of an existing byte-equivalent normalized completion fact SHALL likewise return from the validated snapshot without acquiring the persistence write lock or calling fsync, regardless of whether the event has been delivered or acknowledged. Reconciliation of an already-published immutable or acknowledged completion and an already-recorded Agent projection SHALL likewise remain observation-only. A complete wait that times out after all relevant completion, acknowledgement, Agent-projection, and explicitly requested progress-delivery facts are settled SHALL acquire no persistence lock, call no fsync, and write no durable state. First delivery of an unfrozen completion SHALL lock, reread, and durably freeze its public payload before returning. A missing completion event or a genuinely different mutable completion fact SHALL retain lock-and-reread repair. `list_agents` SHALL not participate in completion or progress delivery.

#### Scenario: List reports logical state
- **WHEN** `list_agents` renders completed Agent state
- **THEN** it returns `completed: null` without reading, returning, or acknowledging completion messages or progress updates

#### Scenario: Repeated list observes an identical unread Agent completion
- **WHEN** repeated `list_agents` calls reconcile a terminal Agent job whose deterministic unread and unfrozen completion event already contains the exact normalized fact and whose Agent projection is recorded
- **THEN** each call returns the logical Agent state without acquiring a completion-inbox persistence lock, calling fsync, writing durable state, or changing completion delivery state

#### Scenario: Repeated list observes identical quarantined legacy evidence
- **WHEN** repeated `list_agents` calls encounter a retained terminal legacy job whose deterministic unowned completion event already contains the exact normalized fact
- **THEN** each call leaves that quarantined event unchanged without acquiring its completion-inbox persistence lock, calling fsync, or writing durable state

#### Scenario: Completion arrives during wait
- **WHEN** any current-root Agent reaches a terminal state before the timeout
- **THEN** wait returns one complete completion update and opaque token without same-call acknowledgement

#### Scenario: Progress arrives during an opt-in wait
- **WHEN** a current-root Agent publishes safe progress before any completion and before timeout while `wake_on_progress: true`
- **THEN** wait returns one advisory progress update without changing completion acknowledgement state

#### Scenario: Progress arrives during an ordinary wait
- **WHEN** a current-root Agent publishes safe progress before any completion and before timeout while progress wakeup is omitted or false
- **THEN** wait does not return or claim that progress and continues toward completion or timeout

#### Scenario: Later wait acknowledges the prior update
- **WHEN** a later wait echoes the valid token for the oldest returned completion update
- **THEN** the cursor advances before returning or waiting for subsequent Agent activity

#### Scenario: Partial acknowledgement races a frozen batch snapshot
- **WHEN** a diagnostic multi-event snapshot is returned while another waiter has already acknowledged only its leading token prefix
- **THEN** a later acknowledgement treats that already-acknowledged prefix idempotently and advances only the exact oldest unread Agent-linked suffix without skipping an event

#### Scenario: Wait times out
- **WHEN** no current-root Agent produces a completion or explicitly eligible progress update before the deadline
- **THEN** wait returns a timeout receipt without changing Agent state or acknowledging future events

#### Scenario: Existing inbox remains quiet
- **WHEN** repeated wait polls find no unread Agent-linked completion in an existing validated inbox
- **THEN** each observation returns no completion without acquiring the inbox write lock, calling fsync, or changing durable state

#### Scenario: Settled terminal Agent remains quiet
- **WHEN** a terminal Agent has no unread completion because its completion is acknowledged, its Agent projection marker is already recorded, and no explicitly requested progress remains eligible before timeout
- **THEN** the complete wait call returns a timeout without acquiring a persistence lock, calling fsync, or writing durable state

#### Scenario: Registry finalization outruns its job marker
- **WHEN** recovery finds that the Agent registry already finalized a terminal job but that job lacks `agentProjectionReconciledAt`
- **THEN** reconciliation repairs the missing marker once so normal retention can prune the detailed job before later settled waits become observation-only

#### Scenario: Frozen completion is redelivered
- **WHEN** an unread Agent-linked completion already has an immutable first-delivery payload
- **THEN** wait returns the identical token and complete frozen payload from the validated snapshot without acquiring the inbox write lock or calling fsync

#### Scenario: Completion requires first-delivery freezing
- **WHEN** an unread Agent-linked completion has not been exposed before
- **THEN** wait acquires the inbox lock, rereads current state, durably freezes the complete public payload, and returns the resulting token and payload

#### Scenario: Missing completion requires repair
- **WHEN** reconciliation finds a terminal Agent job whose deterministic completion event is absent
- **THEN** it acquires the required persistence lock and durably appends the event before delivery

#### Scenario: Mutable completion fact requires correction
- **WHEN** reconciliation finds an existing unread and unfrozen completion event whose normalized durable fields differ from the current terminal job fact
- **THEN** it acquires the completion-inbox lock, rereads the latest state, and durably corrects the event without changing its deterministic identity or sequence

### Requirement: Proactive wakeup is not a local-runtime dependency
The local runtime SHALL NOT require a resident forwarding agent, background terminal, or unsupported host callback to preserve completion delivery.

#### Scenario: Codex task is inactive when Claude completes
- **WHEN** no Codex model turn is running at completion time
- **THEN** the durable unread event remains available for the next turn without keeping Claude resident

### Requirement: Unread completion survives normal job pruning
Unread Agent completion summary metadata and its complete public final-message handoff SHALL remain available if its detailed internal job receipt later exceeds the normal job-retention limit. Result pointers and native Claude session evidence SHALL remain internal details and SHALL NOT appear in default `list_agents` or `wait_agent` output.

#### Scenario: Old unread job exceeds 100-job retention
- **WHEN** cleanup prunes the detailed job record before the owner acknowledges its Agent completion
- **THEN** `wait_agent` still exposes a self-contained status, complete stored final message, legacy truncation flag, and token

### Requirement: Legacy unowned completions cannot block Agent delivery
Completion records with no durable Agent identity SHALL remain stored as quarantined legacy evidence but SHALL be skipped by model-facing Agent delivery and acknowledgement-prefix selection.

#### Scenario: Legacy events precede a current Agent completion
- **WHEN** one or more unread `agentId=null` events precede an unread Agent-linked event
- **THEN** `wait_agent` returns the Agent-linked summary immediately and does not expose the legacy records

#### Scenario: Agent update after a legacy prefix is acknowledged
- **WHEN** the caller acknowledges the oldest returned Agent-linked update
- **THEN** the cursor may advance across the preceding quarantined legacy sequences without rewriting their event IDs or delivery tokens

### Requirement: Bound Agent history is readable from native Claude transcripts
The runtime SHALL provide `read_agent_messages` for exact current-root Agent targets with proven Claude session bindings. It SHALL read only outer-assistant text messages from that Agent's top-level native Claude transcript beneath its canonical `CLAUDE_CONFIG_DIR`, SHALL return each selected message's complete text without a Plugin-defined content limit, and SHALL NOT read Codex transcripts, arbitrary paths, foreign sessions, thinking, tool payloads, attachments, or internal Claude subagent transcripts.

#### Scenario: Caller reads the latest Agent message
- **WHEN** the current root requests an Agent with a valid bound native transcript and omits pagination arguments
- **THEN** the runtime returns the latest eligible outer-assistant text message with its opaque message ID and timestamp

#### Scenario: Caller pages to older messages
- **WHEN** the caller supplies a valid `before` message ID and a supported message-count limit
- **THEN** the runtime returns only older eligible messages in newest-first order and a next cursor when more exist

#### Scenario: Native message exceeds former completion bounds
- **WHEN** an eligible native assistant message is larger than 64 KiB or 4096 bytes
- **THEN** the returned message text is byte-for-byte complete

#### Scenario: Transcript contains internal or non-text records
- **WHEN** the native artifact contains thinking, tool use/results, attachments, sidechain records, subagent artifacts, or assistant records without text
- **THEN** none of that content appears in the public history response

#### Scenario: Target is foreign or history is unavailable
- **WHEN** the target is outside the current root, lacks a proven session binding, resolves ambiguously, or its native transcript expired or is missing
- **THEN** the read fails explicitly without starting Claude, mutating Agent state, or changing completion acknowledgement

#### Scenario: Caller attempts session or path adoption
- **WHEN** a model-facing read supplies a raw Claude session ID, transcript path, owner override, or foreign-root selector
- **THEN** the runtime rejects the unsupported argument before reading local history

### Requirement: Completion acknowledgement is conditional and exact
A caller that performs another `wait_agent` call after receiving a completion SHALL pass that completion token exactly once so the inbox can acknowledge it; a caller that ends its task after consuming the handoff is not required to issue a separate acknowledgement call.

#### Scenario: Caller continues waiting
- **WHEN** a caller receives a completion and invokes `wait_agent` again for the same root
- **THEN** it passes the prior completion token in that next call

#### Scenario: Caller finishes after consuming completion
- **WHEN** a caller receives and consumes the completion handoff and performs no later wait
- **THEN** no extra acknowledgement-only operation is required

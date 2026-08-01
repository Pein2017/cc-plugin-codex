## MODIFIED Requirements

### Requirement: Completion events use two-phase at-least-once delivery
Each owner root SHALL have a monotonic completion sequence and an atomic cursor for the highest contiguously acknowledged Agent-linked event. A model-facing wait SHALL return at most the oldest unread Agent-linked summary with an opaque delivery token and the complete stored final message, and SHALL NOT acknowledge that update in the same response-producing call. The first model-facing delivery SHALL atomically freeze the payload identified by that token against later in-place reconciliation. The handoff SHALL carry the legacy-compatible truncation flag and one nested `blocking` field. That field SHALL be a bounded object holding only closed `reason`, `scope`, and `retry` values for every failed terminal fact and for an interrupted terminal fact without proven safe flush, and SHALL be `null` for a completed terminal fact and for an interrupted terminal fact whose receipt proves a safe flush. Result pointers, resumability evidence, and Claude session evidence SHALL remain internal and absent from the default projection.

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

#### Scenario: Failed terminal fact is first delivered
- **WHEN** an unread completion whose terminal fact is failed is exposed for the first time
- **THEN** the frozen payload carries the closed `reason`, `scope`, and `retry` triple and that triple is redelivered unchanged under the same token

#### Scenario: Gracefully interrupted turn proved a safe flush
- **WHEN** an unread completion reports an interrupted terminal fact whose receipt proves a safe flush
- **THEN** the frozen payload reports `blocking: null` and the Agent remains resumable by follow-up on its same durable Agent and native session

#### Scenario: Interrupted turn cannot prove a safe flush
- **WHEN** an unread completion reports an interrupted terminal fact without a receipt proving a safe flush
- **THEN** the frozen payload carries `interrupted_unflushed` with Agent scope and a new-Agent retry

#### Scenario: Pre-change frozen payload is redelivered
- **WHEN** a completion frozen before blocking evidence existed is redelivered
- **THEN** it reports `blocking: null` and the runtime does not recompute or backfill a triple into that immutable payload

#### Scenario: Acknowledgement skips an older event
- **WHEN** an echoed token does not identify the oldest unread Agent-linked update
- **THEN** the runtime rejects the acknowledgement without advancing past unseen events

## ADDED Requirements

### Requirement: Blocking evidence derives deterministically from the terminal turn fact
The public `reason` vocabulary SHALL be exactly the nine closed values `auth_required`, `account_limit`, `harness_incompatible`, `transport_exhausted`, `session_lost`, `interrupted_unflushed`, `route_unsupported`, `worker_lost`, and `unclassified`. Derivation SHALL run only for a terminal fact that requires blocking evidence, and a completed terminal fact or an interrupted terminal fact with proven safe flush SHALL project `null` without selecting a reason. `blocking: null` SHALL NOT be interpreted as proof that an Agent is resumable, and a non-null object SHALL NOT be interpreted as proof that it is not; resumability is carried only by `retry`. The runtime SHALL derive `reason`, `scope`, and `retry` from one terminal job fact using a fixed precedence: a Harness-scoped condition SHALL outrank any Agent-scoped condition present in the same fact; an admitted turn-failure class SHALL outrank supervisor-origin evidence; supervisor-origin evidence SHALL decide only when no turn-failure class exists; and a closed `unclassified` value SHALL be the only fallback. `scope` SHALL be the declared scope of the selected reason. `retry` SHALL be derived from the Agent's continuation mode, where a proven exact-session or safe-fresh continuation yields same-Agent follow-up, a blocked Agent-scoped continuation yields a new Agent, and a blocked Harness-scoped continuation yields operator recovery. The derivation SHALL be a pure function of that terminal fact, with no timestamp, counter, attempt total, elapsed interval, ordering dependence, or filesystem read, so that repeated derivation of an unchanged fact is byte-identical.

#### Scenario: Account exhaustion accompanies transport evidence
- **WHEN** a terminal fact carries both explicit account-capacity exhaustion and transport failure evidence
- **THEN** the Harness-scoped account reason is selected and the Agent-scoped transport reason is not, matching the existing rule that account exhaustion suppresses transport recovery

#### Scenario: Turn-failure class and operator message are both present
- **WHEN** a terminal job carries both an admitted turn-failure class and an operator error message
- **THEN** the class decides the reason and the operator message is never read for the model-facing projection

#### Scenario: A terminal fact already carries the structured incompatibility value
- **WHEN** a terminal job fact's structured supervisor-origin field already carries the Harness-incompatibility value, with no turn-failure class present
- **THEN** the mapping selects the Harness-scoped incompatibility reason with operator recovery, without a turn-failure class, whether or not any current supervisor code path records that structured value on a terminal job today

#### Scenario: Reaped worker has no turn class
- **WHEN** a job is auto-reaped because its control process died or lacked deterministic identity
- **THEN** supervisor-origin evidence selects the Agent-scoped worker-lost reason and its retry follows the Agent's continuation mode

#### Scenario: Terminal fact is unrecognized
- **WHEN** no admitted class and no known supervisor-origin evidence explain the terminal fact
- **THEN** the projection reports the closed `unclassified` reason rather than passing through any free-text detail

#### Scenario: Graceful interruption selects no reason
- **WHEN** a terminal fact is an interrupted turn whose receipt proves a safe flush
- **THEN** the runtime projects `blocking: null` without selecting any reason and without recording a tenth vocabulary value for the parent's own successful interrupt

#### Scenario: Blocking evidence coexists with a resumable session
- **WHEN** a failed terminal fact exhausted automatic recovery while its exact native session survived
- **THEN** the projection is non-null with a same-Agent follow-up retry, proving that presence and resumability are independent

### Requirement: Blocking evidence is redacted by construction
Every model-facing blocking field SHALL be produced from the closed vocabulary alone. The runtime SHALL NOT copy any part of a job error message, failure reason, warning, standard error, manual resume command, or stored continuation evidence text into a model-facing receipt or error. Process identifiers, native session identifiers, manual resume commands, executable paths, workspace paths, and foreign-root evidence SHALL be absent from every model-facing blocking projection. Operator diagnostics SHALL retain the exact class, session, attempt, and receipt evidence unchanged.

#### Scenario: Reaped-worker message contains a process identifier
- **WHEN** a terminal job's operator error message names a control process identifier and auto-reaping
- **THEN** neither the completion update nor any activation rejection contains that identifier or that operator wording

#### Scenario: Recovery budget records a manual resume command
- **WHEN** a terminal job records that automatic recovery was exhausted and stores a manual resume command containing a native session identifier
- **THEN** no model-facing receipt exposes that command, that session identifier, or the executable path

#### Scenario: Operator inspects the same Agent
- **WHEN** an operator diagnoses an Agent whose model-facing projection reported a closed reason
- **THEN** the exact internal failure class, session evidence, attempts, and receipts remain available and unredacted through the operator path

### Requirement: Blocking evidence preserves settled-wait idempotence
Blocking evidence SHALL participate in the normalized completion-fact comparison using a structural comparison rather than a scalar identity check, so that a genuine correction converges in one step. A wait or list observation over a settled terminal Agent whose completion fact is unchanged SHALL continue to acquire no persistence lock, call no fsync, and write no durable state after blocking evidence is introduced.

#### Scenario: Repeated observation of a settled failed Agent
- **WHEN** repeated waits and lists observe a settled failed Agent whose completion event already contains the exact normalized fact including its blocking evidence
- **THEN** each call returns the same projection without acquiring a completion-inbox persistence lock, calling fsync, or writing durable state

#### Scenario: Unread unfrozen event carries stale blocking evidence
- **WHEN** reconciliation finds an unread and unfrozen completion event whose stored blocking evidence differs from the current terminal job fact
- **THEN** it corrects the event once under the existing lock-and-reread rule without changing its deterministic identity or sequence, and the next observation is write-free

## MODIFIED Requirements

### Requirement: Completion events use two-phase at-least-once delivery
Each owner root SHALL have a monotonic completion sequence, per-Agent-event acknowledgement state, and a derived compaction watermark equal to the highest sequence below which every Agent-linked event is acknowledged and every unowned legacy event is quarantined. A model-facing untargeted wait SHALL return at most the oldest unread Agent-linked summary. A completed targeted barrier SHALL return the unread completions for its fixed job set as one ordered batch. Every returned completion SHALL carry its opaque delivery token and complete stored final message and SHALL remain unacknowledged in the response-producing call. First delivery SHALL atomically freeze each payload identified by those tokens against later reconciliation. Result pointers, resumability evidence, and Claude session evidence SHALL remain internal.

#### Scenario: Untargeted wait reads the next completion
- **WHEN** the same owner root performs an untargeted wait after an Agent finishes
- **THEN** the runtime returns the oldest unread Agent-linked completion and its token

#### Scenario: Targeted barrier reads selected completions
- **WHEN** all snapshotted target jobs are terminal and their completion events are unread
- **THEN** the runtime returns those events in requested target order without returning or freezing unrelated events

#### Scenario: Later call acknowledges a selected batch
- **WHEN** a later wait echoes valid previously delivered tokens whose events are separated by older unrelated unread events
- **THEN** the named events become acknowledged atomically without marking the unrelated events read

#### Scenario: Compaction encounters an acknowledgement hole
- **WHEN** a later-sequence event is acknowledged while an earlier Agent-linked event remains unread
- **THEN** the compaction watermark stops before the unread event and no stored completion is silently evicted

#### Scenario: Runtime crashes after producing a barrier response
- **WHEN** the aggregate response does not reach Codex and no later call echoes its tokens
- **THEN** every selected event remains unread and the same frozen payloads and tokens are redelivered

#### Scenario: Reconciliation changes after first delivery
- **WHEN** a delivered event is later contradicted by reconciliation
- **THEN** its original token and complete frozen payload remain immutable

#### Scenario: Agent starts a follow-up before acknowledgement
- **WHEN** a delivered turn remains unread while the same Agent starts a new turn
- **THEN** redelivery remains bound to the original job and frozen terminal fact

#### Scenario: Version-one inbox is read
- **WHEN** an inbox has only the legacy contiguous cursor
- **THEN** events at or below that cursor derive acknowledged state, later events derive unread state, and frozen payloads and tokens are unchanged

### Requirement: Waiting is bounded and durable
`wait_agent` SHALL first process valid `acknowledge_tokens`, then either execute the unchanged untargeted completion/progress observation or resolve a fixed target-job snapshot up to `timeout_ms`. Untargeted wait SHALL remain oldest-completion-first and SHALL observe safe progress only when `wake_on_progress: true`. Targeted wait SHALL ignore unrelated completion and progress activity, SHALL deliver no partial completion payload before an all-target barrier settles, and SHALL perform its final zero-time observation against the same fixed job set. Every newly returned completion SHALL remain unread until its token is echoed later. Snapshot-only quiet observations SHALL not acquire the inbox write lock or call fsync; first delivery, genuine repair, migration, and acknowledgement SHALL retain lock-reread atomicity. `list_agents` SHALL not participate in completion or progress delivery.

#### Scenario: Untargeted completion arrives during wait
- **WHEN** any current-root Agent reaches terminal state during an untargeted wait
- **THEN** wait returns one oldest complete update without same-call acknowledgement

#### Scenario: Unrelated completion arrives during targeted wait
- **WHEN** a job outside the fixed target set reaches terminal state
- **THEN** it neither resolves the wait nor changes first-delivery or acknowledgement state

#### Scenario: Every targeted job settles
- **WHEN** all concrete jobs in the fixed target snapshot are terminal before the deadline
- **THEN** wait returns one aggregate result with each target's settled fact and every unread selected completion payload

#### Scenario: Targeted wait times out
- **WHEN** at least one joinable target remains active at the deadline
- **THEN** wait returns a status-only aggregate and leaves all completion delivery facts unchanged

#### Scenario: Completion races final observation
- **WHEN** the last target completion becomes visible at the existing final-observation linearization point
- **THEN** the aggregate completion replaces timeout without selecting a later follow-up job

#### Scenario: Acknowledgement repeats
- **WHEN** a caller repeats a valid token already acknowledged for this owner root
- **THEN** acknowledgement is idempotent and no unrelated event changes state

#### Scenario: Unknown token is supplied
- **WHEN** acknowledgement includes an unknown, foreign-root, or never-delivered token
- **THEN** the call fails before advancing acknowledgement or compaction state

#### Scenario: First barrier delivery requires freezing
- **WHEN** a settled barrier includes one or more previously unfrozen completion events
- **THEN** the runtime locks, rereads, and freezes the selected payloads atomically before returning them

#### Scenario: Settled barrier is redelivered
- **WHEN** the same unacknowledged barrier is observed again after restart
- **THEN** it returns identical per-job tokens and frozen payloads without rewriting them

#### Scenario: Legacy unowned event precedes a target
- **WHEN** a quarantined `agentId=null` event has a lower sequence than a targeted Agent event
- **THEN** the legacy event does not block target delivery or acknowledgement and remains unavailable to model-facing output

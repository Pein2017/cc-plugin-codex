## MODIFIED Requirements

### Requirement: First-turn failure does not create an unusable silent mailbox
The runtime SHALL validate the complete execution profile before reserving an Agent and SHALL roll back an Agent reservation when synchronous preparation fails before detached-worker launch. The first-turn prompt SHALL already exist as the Agent's first mailbox entry; rollback SHALL remove the Agent and name only when that original message is still its sole entry and no job or session was established, otherwise it SHALL preserve every concurrently queued message in order. A terminal receipt retaining `preClaudeLaunch=true` SHALL restore the prior Agent lifecycle and requeue its linked messages. After durable Claude child acceptance, the runtime SHALL permit a fresh-session retry on the same Agent only when later durable evidence proves no Claude session and no possible side effect; otherwise it SHALL retain lifecycle `errored`, set `continuation=blocked` with evidence, and reject non-activating messages that could never be delivered.

#### Scenario: Validation fails before reservation
- **WHEN** the requested execution profile is invalid
- **THEN** no Agent, name reservation, mailbox entry, or job is created

#### Scenario: Readiness fails before launch
- **WHEN** Agent creation succeeded but synchronous readiness or job preparation fails
- **THEN** the Agent and name are removed only if no concurrent mailbox entry, job, or session exists; otherwise the ordered mailbox and identity remain durable

#### Scenario: Attached activation fails before Claude launch
- **WHEN** a terminal receipt linked to the Agent still has `preClaudeLaunch=true`
- **THEN** reconciliation releases that activation, restores prior Agent state, requeues its assigned or dispatched messages, and publishes no completion

#### Scenario: First turn fails safely before session capture
- **WHEN** post-launch evidence proves no session, tool use, file touch, or other possible side effect
- **THEN** `followup_task` may retry the same Agent on a fresh session

#### Scenario: First turn fails ambiguously
- **WHEN** no resumable session exists and possible side effects cannot be excluded
- **THEN** the Agent is errored with blocked continuation evidence, and `send_message` rejects instead of queueing forever

### Requirement: Agent mailbox outlives individual jobs
Each Agent SHALL own a versioned durable message sequence beginning with the initial spawn prompt. Entries SHALL transition atomically through `queued`, `assigned` to one job, `dispatched`, and `acknowledged`; mailbox identity and unconsumed entries SHALL remain independent from bounded job retention. Pre-Claude recovery SHALL return entries still linked to the failed diagnostic to `queued` in original sequence order without changing message identity, duplicating entries, or acknowledging content Claude did not receive.

#### Scenario: Idle Agent receives a message
- **WHEN** `send_message` targets a resumable terminal Agent
- **THEN** the message remains queued without starting a process and is atomically assigned when a later follow-up activates the Agent

#### Scenario: First activation races with additional messages
- **WHEN** messages are queued after Agent creation but before activation reservation completes
- **THEN** the initial prompt and raced messages are assigned and delivered in stable mailbox sequence order

#### Scenario: Runtime restarts before Claude launch
- **WHEN** assigned or dispatched messages reference a terminal job with `preClaudeLaunch=true`
- **THEN** reconciliation requeues those exact entries once without acknowledgement, duplication, or completion publication

#### Scenario: Runtime restarts after dispatch
- **WHEN** a message was assigned or dispatched and its linked job crossed the durable Claude-child boundary before a crash
- **THEN** reconciliation uses that post-launch job receipt to prevent silent loss or duplicate acknowledgement

### Requirement: Terminal jobs are the reconciliation fact source
Agent registry state and Agent-linked completion events SHALL be rebuildable projections of durable internal job receipts. Reconciliation SHALL process terminal pre-Claude diagnostics before generic job projection, apply only monotonic evidence-backed transitions, and preserve a previously validated session pointer on drift. Recovery SHALL be idempotent and SHALL NOT regress an Agent that already advanced to a newer job.

#### Scenario: Job is terminal while Agent still appears running
- **WHEN** startup finds a normal terminal Agent-linked job and stale Agent or inbox projection
- **THEN** it clears `activeJobId`, retains `latestJobId`, advances lifecycle/continuation from the job evidence, and idempotently restores the missing completion

#### Scenario: Pre-Claude diagnostic is reconciled twice
- **WHEN** restart recovery repeatedly sees the same terminal receipt with `preClaudeLaunch=true`
- **THEN** the Agent and mailbox are restored at most once, no completion sequence is created, and the diagnostic keeps a stable projection marker

#### Scenario: Agent advanced before old diagnostic recovery
- **WHEN** the Agent already owns a newer active or terminal job
- **THEN** recovery does not overwrite newer lifecycle or session evidence and only releases mailbox entries still linked to the old diagnostic

## ADDED Requirements

### Requirement: Recovered pre-Claude diagnostics have bounded retention
An attached terminal pre-Claude diagnostic SHALL remain retained until Agent recovery is durably marked. After that marker exists, bounded cleanup MAY prune the diagnostic without requiring a completion event. Unrecovered attached diagnostics SHALL NOT disappear behind the terminal receipt limit.

#### Scenario: More than one hundred diagnostics exist
- **WHEN** bounded cleanup evaluates old attached terminal pre-Claude receipts
- **THEN** only receipts with durable Agent recovery markers are eligible for pruning without completion publication

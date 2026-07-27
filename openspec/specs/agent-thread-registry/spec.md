# agent-thread-registry Specification

## Purpose
Define durable, root-scoped Claude Agent identity, mailbox, session ownership,
continuation, reconciliation, and nonresident lifecycle semantics.
## Requirements
### Requirement: Agent Thread has a stable durable identity
The runtime SHALL persist each Agent with a schema version, stable generated ID, flat `/root/<task_name>` path, root-unique name, optional description, root thread ID identical to hardened `ownerRootId`, canonical workspace root, separate active and latest job pointers, validated Claude session pointer, lifecycle status, explicit continuation classification and evidence, timestamps, and latest completion sequence.

#### Scenario: Agent finishes its first turn
- **WHEN** the initial job reaches a terminal state
- **THEN** the same Agent ID and path remain while its lifecycle, continuation, active/latest job pointers, Claude session, and completion sequence are atomically updated

### Requirement: Agent names are unique within a Codex root
The runtime SHALL reject a duplicate Agent name within the same root and SHALL NOT silently rename, suffix, or resume an existing Agent.

#### Scenario: Root spawns a duplicate name
- **WHEN** an Agent with the requested normalized name already exists in that root
- **THEN** spawn fails with the conflicting Agent identity and no Claude job starts

#### Scenario: Different roots use the same name
- **WHEN** two Codex roots independently spawn the same Agent name
- **THEN** each receives a distinct root-scoped Agent identity

### Requirement: Agent registry is root-scoped by default
Normal Agent lookup, control, and lifecycle reconciliation SHALL use the immutable root thread ID injected by the Codex bootstrap and SHALL resolve and mutate only Agents owned by that logical root scope. This is an accidental cross-root isolation boundary, not a cryptographic authorization claim. Model-facing calls SHALL NOT supply or override this identity.

#### Scenario: Root lists its Agents
- **WHEN** `list_agents` is called
- **THEN** only Agents owned by the current root are returned

#### Scenario: Foreign Agent path is supplied
- **WHEN** a root references an Agent owned by another root
- **THEN** lookup fails without exposing or modifying the foreign Agent

#### Scenario: Current root observes a foreign terminal receipt
- **WHEN** root A reconciles its Agent registry while a root B terminal receipt lacks session binding or Agent projection
- **THEN** root A leaves root B's receipt, Claude-session binding, completion inbox, and Agent registry unchanged

### Requirement: All-roots view is explicit and read-only
The runtime SHALL allow an explicit diagnostic all-roots Agent listing only through a separate operator CLI and SHALL keep it absent from the six model-facing operations. All Agent mutations SHALL remain trusted-root scoped.

#### Scenario: Debug all view is requested
- **WHEN** the operator invokes the Agent diagnostic CLI with `--all`
- **THEN** redacted Agent snapshots across roots are returned for diagnosis

#### Scenario: Debug output is used for mutation
- **WHEN** the caller attempts to message, follow up, wait on, interrupt, or acknowledge a foreign Agent
- **THEN** the normal logical root scope rejects it

### Requirement: One Agent has at most one active turn
The registry SHALL permit at most one active internal job for an Agent while allowing different Agents in the same root to run concurrently within the active capacity policy.

#### Scenario: Follow-up is requested twice concurrently
- **WHEN** two callers try to activate the same terminal Agent
- **THEN** exactly one wins the atomic transition and the other receives an already-active receipt

### Requirement: Agent topology is flat and targeting is exact
Every v0.2 Agent SHALL use a stable path `/root/<task_name>`. Mutating operations SHALL resolve an exact Agent ID, exact path, or exact normalized name; only `list_agents(path_prefix)` may use prefix filtering.

#### Scenario: Prefix is used as a mutation target
- **WHEN** a caller supplies a non-exact path prefix to message, follow up, or interrupt
- **THEN** resolution fails without selecting an arbitrary descendant

### Requirement: Agent continuity is independent from job retention and process residency
Agent identity and its latest validated Claude session pointer SHALL remain usable after old internal jobs are pruned and after every Claude worker has exited.

#### Scenario: Agent's older jobs are pruned
- **WHEN** the root exceeds its 100 terminal-job receipt limit
- **THEN** the Agent remains listed and eligible for exact-session follow-up using its registry pointer

### Requirement: Agent session pointer rejects drift
The registry SHALL update an Agent's Claude session pointer only from an owner-valid job whose observed session matches its expected exact-session contract.

#### Scenario: Resumed turn reports another session
- **WHEN** Claude reports a different session ID from the Agent's resume target
- **THEN** the turn becomes errored and the prior valid Agent session pointer is preserved

### Requirement: Plugin-created Claude session identity is bound to one root and Agent
The registry SHALL persist a canonical `(CLAUDE_CONFIG_DIR, Claude session ID)` binding to `ownerRootId` and `agentId` when a new Agent session is first observed. Neither model-facing nor operator v0.2 operations SHALL adopt an unbound or foreign session.

#### Scenario: New Agent session is observed
- **WHEN** the first turn reports a Claude session ID and all lease checks pass
- **THEN** the runtime atomically binds that session to the trusted root and Agent before making it resumable

#### Scenario: Caller attempts foreign session adoption
- **WHEN** any v0.2 spawn path supplies or references an existing unbound or foreign Claude session
- **THEN** the runtime rejects the input and records that adoption requires a separate future OpenSpec

### Requirement: First-turn failure does not create an unusable silent mailbox
The runtime SHALL validate the complete execution profile before reserving an
Agent and SHALL roll back an Agent reservation when synchronous preparation
fails before detached-worker launch. The first-turn prompt SHALL already exist
as the Agent's first mailbox entry; rollback SHALL remove the Agent and name only
when that original message is still its sole entry and no job or session was
established, otherwise it SHALL preserve every concurrently queued message in
order. A prepared Agent and its mailbox MAY be rolled back only for a structured
`rollback_safe` disposition proving that OS worker spawn never succeeded. Once
detached worker launch is durably marked, `lifecycle_owned` or
`ownership_uncertain` SHALL preserve the Agent attachment, lifecycle, mailbox
assignment, and exact-session lease until worker lifecycle or terminal
pre-Claude reconciliation resolves them. A terminal receipt retaining
`preClaudeLaunch=true` SHALL restore the prior Agent lifecycle and requeue its
linked messages. After durable Claude child acceptance, the runtime SHALL permit
a fresh-session retry on the same Agent only when later durable evidence proves
no Claude session and no possible side effect; otherwise it SHALL retain
lifecycle `errored`, set `continuation=blocked` with evidence, and reject
non-activating messages that could never be delivered.

#### Scenario: Validation fails before reservation
- **WHEN** the requested execution profile is invalid
- **THEN** no Agent, name reservation, mailbox entry, or job is created

#### Scenario: Readiness fails before launch
- **WHEN** Agent creation succeeded but synchronous readiness or job preparation
  fails
- **THEN** the Agent and name are removed only if no concurrent mailbox entry,
  job, or session exists; otherwise the ordered mailbox and identity remain
  durable

#### Scenario: Parent fails before worker spawn
- **WHEN** activation reports `rollback_safe` because OS worker spawn never
  succeeded
- **THEN** Agent and mailbox rollback may proceed under the existing empty-
  reservation and concurrency safeguards

#### Scenario: Parent errors after spawning
- **WHEN** activation reports `lifecycle_owned` or `ownership_uncertain` after
  detached worker launch began
- **THEN** the Agent lifecycle, active job, assigned mailbox, and exact-session
  lease remain durable until worker lifecycle or pre-Claude reconciliation
  resolves them

#### Scenario: Attached activation fails before Claude launch
- **WHEN** a terminal receipt linked to the Agent still has `preClaudeLaunch=true`
- **THEN** reconciliation releases that activation, restores prior Agent state, requeues its assigned or dispatched messages, and publishes no completion

#### Scenario: First turn fails safely before session capture
- **WHEN** post-launch evidence proves no session, tool use, file touch, or other
  possible side effect
- **THEN** `followup_task` may retry the same Agent on a fresh session

#### Scenario: First turn fails ambiguously
- **WHEN** no resumable session exists and possible side effects cannot be
  excluded
- **THEN** the Agent is errored with blocked continuation evidence, and
  `send_message` rejects instead of queueing forever

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

### Requirement: Agent v1 has no close or archive lifecycle
Completed, interrupted, and errored Agents SHALL remain logical root-owned records without requiring close, archive, or delete for resource cleanup.

#### Scenario: Completed Agent has no follow-up yet
- **WHEN** its current turn finishes
- **THEN** it remains visible with no resident Claude process and no required cleanup action

### Requirement: Recovered pre-Claude diagnostics have bounded retention
An attached terminal pre-Claude diagnostic SHALL remain retained until Agent recovery is durably marked. After that marker exists, bounded cleanup MAY prune the diagnostic without requiring a completion event. Unrecovered attached diagnostics SHALL NOT disappear behind the terminal receipt limit.

#### Scenario: More than one hundred diagnostics exist
- **WHEN** bounded cleanup evaluates old attached terminal pre-Claude receipts
- **THEN** only receipts with durable Agent recovery markers are eligible for pruning without completion publication

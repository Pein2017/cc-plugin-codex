# tracked-job-control Specification

## Purpose

Define the baseline public lifecycle of durable Claude jobs and their owner-scoped control surface.
## Requirements

### Requirement: One canonical owner root identity scopes orchestration
Normal plugin execution SHALL receive one non-empty immutable `ownerRootId` from the Codex bootstrap/host boundary. This identity is a logical default-isolation boundary that prevents accidental cross-root orchestration; it is not a cryptographic authorization claim. Model-facing skills and commands SHALL NOT accept an owner override. Normal lookup and lifecycle reconciliation SHALL filter raw durable records to the current owner before stale reaping, completion publication, Agent-session binding, retention, or projection mutation. A legacy `job.sessionId` equal to the current root SHALL be upgraded without changing its value; foreign legacy values SHALL remain operator-visible only. Explicit workspace-wide worker maintenance MAY reconcile all roots, but SHALL remain separate from model-facing lifecycle operations.

#### Scenario: Trusted bootstrap launches the runtime
- **WHEN** the Codex plugin bootstrap invokes a lifecycle operation
- **THEN** it injects the host's canonical thread identity as immutable `ownerRootId` for lookup, retention, inbox, and later Agent ownership

#### Scenario: Model-facing caller supplies an owner override
- **WHEN** a skill or normal lifecycle command includes an owner-root argument or override
- **THEN** the runtime rejects it before reading or mutating root-owned state

#### Scenario: Current-root reconciliation encounters a foreign terminal or stale job
- **WHEN** root A invokes a normal list, wait, status, or interruption lookup while root B has a repairable job in the shared workspace store
- **THEN** root A does not reap, bind, publish, project, or otherwise mutate root B's job, completion inbox, session binding, or Agent registry

#### Scenario: Foreign owner later invokes reconciliation
- **WHEN** root B next invokes a normal lifecycle operation for its own repairable job
- **THEN** root B performs its own stale recovery, completion publication, session binding, and Agent projection under the existing lifecycle rules

#### Scenario: Explicit global worker maintenance runs
- **WHEN** the trusted worker cleanup path reconciles the shared workspace
- **THEN** it may repair all roots before applying owner-bucketed retention without exposing a model-facing owner override

### Requirement: Jobs are internal Agent turn receipts
Tracked jobs SHALL remain internal execution records linked to one Agent and SHALL NOT be the model-facing orchestration identity. A terminal receipt that retains `preClaudeLaunch=true` SHALL be treated as a non-turn activation diagnostic until Agent recovery is durably projected; it SHALL NOT bind a Claude session or publish Agent completion.

#### Scenario: Agent starts a later turn
- **WHEN** `followup_task` activates a terminal Agent
- **THEN** a new internal job is linked to the same Agent while callers continue addressing the stable Agent path or ID

#### Scenario: Activation terminates before Claude launch
- **WHEN** an attached job becomes terminal while `preClaudeLaunch=true`
- **THEN** the receipt remains diagnostic evidence and is excluded from session binding and completion publication until dedicated recovery marks it projected

### Requirement: Internal process termination is not public cancellation
The runtime MAY use identity-verified bounded process-tree termination to implement interruption or stale-worker cleanup, but SHALL default forced termination to errored/non-resumable unless platform-specific evidence proves safe resume. It SHALL NOT expose destructive cancellation as a public lifecycle operation.

#### Scenario: Graceful signal is unavailable
- **WHEN** an active turn must stop on a platform without portable graceful SIGINT
- **THEN** bounded internal termination stops the process and produces errored/non-resumable state unless the durable platform receipt proves safe interruption

### Requirement: Durable Claude child evidence gates turn execution
For a Claude-backed prepared or running job, the Claude Driver/legacy adapter SHALL retain `preClaudeLaunch=true` until a valid exact Claude child PID identity is atomically accepted for that active job. The adapter SHALL perform this acceptance before writing initial prompt bytes, starting an input pump, or invoking a hook that can expose the task to Claude. A rejected, throwing, or identity-less Claude child acceptance SHALL terminate the child without writing the prompt. Clearing the marker SHALL conservatively end safe-fresh replay eligibility even if a later receipt does not prove a prompt write. Non-Claude and version-three generic turns SHALL instead use the durable launch-claim/attempt and exact native-turn acceptance contract; they SHALL NOT fabricate a Claude PID or use `preClaudeLaunch` as their universal gate.

#### Scenario: Claude child is accepted
- **WHEN** the spawned Claude child has valid PID identity and the active-job compare-and-swap accepts it
- **THEN** the same durable transition records the child evidence, clears `preClaudeLaunch` and safe-fresh retry, and only then permits prompt delivery

#### Scenario: Claude child acceptance is rejected
- **WHEN** the Claude job no longer owns the activation, PID identity is missing, or the acceptance callback rejects or throws
- **THEN** zero prompt bytes are written, the child is terminated, and the durable job retains its pre-Claude marker

#### Scenario: Crash follows accepted Claude child evidence
- **WHEN** the Claude launch receipt was durably accepted but the runtime crashes before proving a prompt write
- **THEN** recovery treats the job as potentially executed and does not safe-fresh replay it

#### Scenario: Service-backed Driver submits a turn
- **WHEN** a non-Claude Driver begins a version-three attempt
- **THEN** launch claim and exact native-turn evidence gate acceptance without requiring or inventing a Claude child identity

### Requirement: Detached worker handoff transfers job and session-lease ownership once
A prepared Agent activation SHALL first be owned by an identity-verified
launcher and a unique durable launcher generation. Before detached worker
spawn, the job SHALL durably record that worker launch has begun. Once spawn
succeeds, the parent SHALL transfer ownership only by publishing a deterministic
child PID identity or observing that the same worker identity claimed the job.
Worker PID publication SHALL use compare-and-swap guarded by launcher PID,
launcher identity, and launcher generation so a stale parent cannot overwrite
newer ownership. It SHALL NOT release an exact-session lease or permit
prepared-job deletion merely because a post-spawn parent operation failed.

Before an unproven child is signalled, the parent SHALL atomically transition
the launcher-owned job from `queued` to `cancelling` under that same launcher
predicate. A worker SHALL claim only from `queued`; therefore a successful
`queued` terminal or `queued`-to-`cancelling` CAS is an execution fence and
prevents an old child from accepting Claude input. If the cleanup fence loses to
the same worker's `running` claim, the parent SHALL accept handoff and SHALL NOT
signal that child. If the fence wins but child exit is not observed, the runtime
SHALL preserve `cancelling`, its exact-session lease, and durable uncertainty
before it may unref the child.
After either publication or a matching worker claim accepts the handoff, the
turn SHALL be independent from launcher and Codex parent residency. Parent
exit, UI closure, or connectivity loss SHALL NOT implicitly interrupt or
terminate the accepted worker; only an explicit lifecycle control action or
the worker's own terminal transition may end that turn.

#### Scenario: Parent publishes worker identity
- **WHEN** detached worker spawn succeeds and the queued job still belongs to
  the launcher
- **THEN** the parent persists the child PID and deterministic identity under
  the original launcher identity and generation before unreferring the child
  and returns a queued launch receipt

#### Scenario: Worker claim wins publication race
- **WHEN** the spawned worker transitions the job to running before the parent
  can establish its cleanup fence
- **THEN** the parent accepts the handoff only after the durable job proves the
  same worker identity, it sends no cleanup signal, and it does not release the
  exact-session lease

#### Scenario: Codex parent disappears after accepted handoff
- **WHEN** worker publication or a matching running claim has durably accepted
  the detached handoff and the Codex parent exits, its UI closes, or network
  connectivity is lost
- **THEN** the worker and its Claude turn continue under durable job lifecycle
  ownership until explicit interruption or ordinary terminal completion

#### Scenario: Unclaimed child cannot be published
- **WHEN** child identity or queued publication cannot be proven and the job is
  still launcher-owned
- **THEN** the parent first fences `queued` to `cancelling`, then terminates the
  child, observes its exit, and records a terminal pre-Claude diagnostic whose
  normal lifecycle releases the lease

#### Scenario: Terminal control races worker publication
- **WHEN** the job becomes terminal before parent publication finishes
- **THEN** the terminal CAS prevents the old child from claiming from `queued`,
  so the terminal lifecycle may release the lease without a deferred
  child-exit release

#### Scenario: Cleanup fence cannot observe child exit
- **WHEN** the parent wins `queued` to `cancelling`, sends `SIGTERM`, and the
  child does not exit within the bounded observation window
- **THEN** the runtime persists `cancelling` and handoff uncertainty, retains
  the exact-session lease, and may unref only after those durable facts exist

#### Scenario: Uncertainty persistence is unavailable
- **WHEN** ownership remains unresolved and neither terminal lifecycle nor a
  durable handoff-uncertainty marker can be read back
- **THEN** the parent does not unref the child and does not release the
  exact-session lease

#### Scenario: Post-spawn ownership remains uncertain
- **WHEN** a local persistence failure prevents the parent from proving worker
  publication, same-worker claim, confirmed fenced termination, or terminal
  lifecycle execution fence
- **THEN** the parent reports `ownership_uncertain`, preserves the job, Agent
  attachment, and exact-session lease for reaper/reconciliation, and does not
  perform destructive rollback

#### Scenario: Parent fails before worker spawn
- **WHEN** launch fails before the operating system creates a child
- **THEN** the parent reports `rollback_safe` and may delete the prepared job and
  release its reserved exact-session lease without leaving a worker owner

#### Scenario: Log cleanup fails after accepted handoff
- **WHEN** closing the parent-side worker log descriptor fails after ownership
  is durably accepted
- **THEN** the Agent launch remains successful and the worker lifecycle is not
  rolled back

### Requirement: Verified supervisor residency prevents premature reaping
The runtime SHALL treat a job as actively owned while either its detached worker identity or its Claude child identity is verified live, and SHALL use the same ownership decision for stale-job reaping and native-session lease admission.

#### Scenario: Child exits before terminal commit
- **WHEN** a Claude child is no longer live but its verified detached worker is still live and has not committed a terminal state
- **THEN** the runtime does not reap the job or allow another job to acquire its native session lease

#### Scenario: Neither owner is live
- **WHEN** neither the recorded worker identity nor the recorded child identity is verified live
- **THEN** the normal stale-job recovery policy may reconcile the job and release its lease

### Requirement: Linux signal failures remain explicit
The runtime SHALL treat only an `ESRCH` signal error as proof that a target process or process group is absent and SHALL surface every other signal error as a control failure.

#### Scenario: Signal is denied
- **WHEN** Linux returns `EPERM` while probing or signalling a Claude process group
- **THEN** the runtime does not report interruption, cancellation, or absence as successful

#### Scenario: Target is already absent
- **WHEN** Linux returns `ESRCH` while signalling a Claude process group
- **THEN** the idempotent termination operation may complete as already absent

### Requirement: Control request and terminal settlement are distinct durable facts
An active turn control command SHALL have a stable command identity and separately record request state `none`, `accepted`, `rejected`, or `unsupported`; settlement `pending`, `settled`, or `unknown`; and native turn state `active`, `terminal`, or `unknown`. Accepting an interrupt request SHALL NOT itself transition the job or Agent to a terminal state.

#### Scenario: Driver accepts an interrupt request
- **WHEN** the live Driver sends the native request successfully
- **THEN** the command records request `accepted` and settlement `pending` until valid native terminal evidence arrives

#### Scenario: Settlement deadline expires
- **WHEN** no valid native terminal or restart-safe observation arrives before the bounded control deadline
- **THEN** settlement becomes `unknown`, the Agent remains conservatively nonterminal, and no interrupted completion is synthesized

#### Scenario: Interrupt is unsupported
- **WHEN** the persisted route capability does not admit interrupt requests
- **THEN** control returns `unsupported` without changing native state, Agent continuity, or leases

### Requirement: Live control executes only in the worker that owns the native connection
The supervisor SHALL persist control commands independently from the detached turn worker. The worker SHALL observe a command through the Plugin-owned durable wake path and invoke the process-local live turn handle. Another MCP call, CLI process, or recovered supervisor SHALL NOT reconstruct a socket, stream, callback, or SDK object from durable state.

#### Scenario: Interrupt arrives through another MCP call
- **WHEN** an isolated call records an interrupt for a currently running detached worker
- **THEN** that worker receives the command and uses its existing Driver-local connection to request interruption

#### Scenario: Worker disappears before handling the command
- **WHEN** no live owner can receive the durable command
- **THEN** reconciliation uses only the Driver-validated native-turn reference and optional observation capability, otherwise settlement remains unknown

### Requirement: Public interrupt never auto-escalates to destructive cancellation
The supervisor SHALL NOT turn a rejected, failed, or unobserved graceful interrupt request into automatic forced cancellation. Destructive Driver-specific cleanup MAY occur only as an internal ownership-recovery action with its own proven target and outcome; it SHALL default to unknown or failed/nonresumable evidence and SHALL NOT be represented as the successful public interrupt request.

#### Scenario: Graceful request is rejected
- **WHEN** the Driver reports that the native Harness rejected interruption
- **THEN** the current turn remains active and the public receipt reports the rejected/still-working disposition without issuing a second destructive operation

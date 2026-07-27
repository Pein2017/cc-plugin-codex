## ADDED Requirements

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

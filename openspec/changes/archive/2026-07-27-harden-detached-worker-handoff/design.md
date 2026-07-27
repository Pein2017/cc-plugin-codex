## Context

`launchPreparedStart` acquires an exact-session lease, persists a queued job,
spawns a detached Node worker, publishes the child PID, and returns. The worker
independently claims the queued job as `running` before it can start Claude.
Today the parent ignores the PID-publication compare-and-swap result, accepts a
missing PID identity, calls `unref()` before publication is proven, and releases
the lease for every exception in the surrounding block. A publication or file-
descriptor-close failure can therefore detach Agent state from a live worker
and create an exact-session concurrency hole.

This is a parent-to-worker ownership transfer, not merely observability. It
must have one durable point after which the parent no longer owns rollback or
lease release. Before that point, cleanup must first establish an execution
fence; signalling a process merely because publication failed is unsafe.

## Goals / Non-Goals

**Goals:**

- Prevent an exact-session lease from being released while the spawned worker
  can still claim or accept Claude input, or has already claimed the job.
- Prevent `abortPreparedStart` from deleting a queued receipt after worker
  launch may have occurred.
- Require deterministic PID identity for parent-side worker ownership.
- Treat a matching worker claim as authoritative when it wins a cleanup fence,
  while treating a queued terminal lifecycle CAS as an execution fence that
  makes old-worker Claude acceptance impossible.
- Fail safely before Claude when neither parent publication nor worker claim can
  be proven.

**Non-Goals:**

- Changing public Agent APIs, outputs, or persistence-required fields.
- Changing the Claude child PID acceptance and stdin boundary.
- Adding a resident daemon, PID-only liveness, automatic job replay, or broader
  retry policy.
- Changing the two-second stale-job grace globally to hide launch races.

## Decisions

### Persist `workerLaunchStartedAt` before spawning

The queued job records an optional `workerLaunchStartedAt` timestamp while it is
still owned by the launcher. `abortPreparedStart` may delete only a prepared job
that lacks this marker. If the launcher dies after the marker but before spawn,
the ordinary identity-aware reaper eventually writes the terminal fact; no
Claude input could have occurred.

Using only an in-memory `spawned` flag was rejected because another caller can
still invoke prepared-job rollback after a parent crash. Replacing the launcher
PID before a child PID exists was rejected because it removes deterministic
liveness evidence during the spawn call.

### Guarded publication and an atomic cleanup fence

After `spawn` returns, the parent keeps the child referenced while it obtains a
non-empty PID identity and attempts a queued-to-queued publication. A successful
publication records the child PID, identity, and `workerHandoffAt`. Both the
publication CAS and any cleanup CAS require the original launcher PID,
launcher identity, and durable per-launch generation. A CAS miss is accepted
only when a fresh job read proves one of these outcomes:

- the same child PID and identity has already claimed `running`; or
- a terminal control transition already owns the job.

If identity acquisition, post-spawn error handling, or publication fails while
the job is still launcher-owned and queued, the parent atomically transitions
it from `queued` to `cancelling` with that same launcher predicate before it
sends `SIGTERM`. The fence atomically persists both the `cancelling` state and
the handoff-uncertainty marker. A worker's claim accepts only `queued`, so a
successful fence proves that the old worker cannot start Claude or accept
input. Once fenced, the parent may signal the child; after observed exit it
terminalizes from `cancelling`, which releases the exact-session lease. If exit
cannot be observed, it retains `cancelling`, the lease, and the durable marker
before unreferring the child so later reconciliation can decide the terminal
fact. Any unresolved path that cannot read back a terminal or uncertainty fact
keeps the child referenced instead of detaching undocumented ownership.

If the fence loses to a matching `running` child, the worker already owns the
handoff and the parent never signals it. If it loses to a terminal lifecycle
fact, that terminal CAS is also an execution fence: an old worker cannot claim
from terminal, so the parent does not need child-exit proof to release the
lease. A predicate miss without either fact remains `ownership_uncertain` and
is deliberately not killed by the stale parent.

Treating every publication CAS miss as failure was rejected because the normal
worker can win the queued-to-running race. Treating every miss as success was
rejected because cancellation or an unrelated state transition may own the
job. Killing before a successful queued-to-cancelling fence was rejected
because it can terminate the same worker that has just claimed the job.

### Accepted handoff outlives the Codex parent

Publication of the child identity or a matching `running` claim transfers the
turn to durable job lifecycle. From that point, the detached worker is not a
child-lifetime extension of the Codex foreground process: Codex exit, UI
closure, or network loss does not signal it or reclaim its lease. It continues
until its own terminal transition or an explicit `interrupt_agent` control
action. This preserves asynchronous work across accidental foreground loss
without reintroducing the removed public destructive-cancel operation.

Applying the cleanup fence to every Codex exit was rejected because it would
turn a durable Agent into a foreground subprocess and defeat restart discovery,
completion inbox delivery, and exact-session follow-up.

### Transfer exact-session lease release at successful spawn

Before `spawn` succeeds, the parent owns cleanup and may release a lease on
failure. Once `spawn` succeeds, the durable job lifecycle owns lease release.
The parent never unlinks the lease from its generic catch path after that point.
A terminal CAS from `queued` or `cancelling` is the execution fence: the
worker's sole claim CAS expects `queued`, so it cannot later accept Claude
input. The existing terminal transition may therefore release the lease exactly
once without a deferred child-exit release path.

A global machine-level lease kill switch was rejected because subscription and
process liveness are unrelated, and exact-session leases already have one
canonical terminal-release path.

### Gate Agent rollback on a structured handoff disposition

Worker launch reports one of `rollback_safe`, `lifecycle_owned`, or
`ownership_uncertain`. `spawnAgent`, activating `followupTask`, and the internal
one-shot start path may roll back Agent lifecycle or mailbox assignment only for
`rollback_safe`, which proves that OS spawn never succeeded. Both
`lifecycle_owned` and `ownership_uncertain` preserve Agent attachment and lease;
worker completion, terminal pre-Claude reconciliation, or reaping resolves them.

Checking only whether `launchPreparedStart` threw was rejected because errors
after OS spawn do not restore parent ownership. Inferring every disposition from
`abortPreparedStart() === false` was rejected because false also covers missing,
terminal, and foreign-owner receipts and does not tell the caller which cleanup
authority now owns the activation.

### Cleanup errors cannot reverse ownership

Worker log descriptors are closed in a best-effort cleanup after the handoff
decision. A close failure may be logged but cannot turn an already accepted
asynchronous launch into a caller-visible failure. The descriptor belongs only
to parent setup; it is not an Agent or session ownership fact.

## Risks / Trade-offs

- **Worker claims before parent publication** -> Accept only the same child
  identity after the launcher-conditioned fence loses; add a deterministic
  `killCount=0` race test.
- **Identity lookup fails while the child is starting** -> Fence first, then
  terminate only if the launcher still owns `queued`; never publish PID-only
  liveness.
- **Store failure leaves ownership unknown** -> Preserve the lease, job, and
  Agent attachment for reaper/reconciliation rather than risk concurrent
  resume. This may temporarily retain capacity but is safety-preserving.
- **Parent dies between OS spawn and durable publication** -> The worker may
  self-claim; otherwise the pre-Claude job is safely reaped. This narrow crash
  can still lose availability but cannot authorize replay or release a lease
  while a proven worker owner exists.
- **Termination races worker claim** -> The atomic queued-to-cancelling fence
  decides the race. A matching running-worker fact wins with no signal; a
  fence win makes later claim impossible.

## Migration Plan

No migration is required. Existing queued jobs without the optional marker keep
their current reaper behavior. New launches write the marker and handoff
timestamp. Rollback is the code commit; retained terminal receipts remain valid
under existing reconciliation.

## Open Questions

None. The public API and persistence compatibility surface are unchanged.

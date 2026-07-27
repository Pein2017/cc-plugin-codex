## Why

The launcher reserves an exact-session lease before it spawns a detached worker,
but any later local exception currently releases that lease even when the
worker has already claimed and may be resuming Claude. A second job can then
acquire the same session concurrently. The same handoff ignores a failed PID
publication and can leave `abortPreparedStart` able to delete a job after its
worker exists.

## What Changes

- Persist that detached-worker launch has begun before calling `spawn` so the
  prepared job is no longer rollback-deletable once a child may exist.
- Resolve every successful spawn through an identity- and generation-guarded
  handoff. Before an unproven child is signalled, atomically fence the job from
  `queued` to `cancelling`; a matching worker claim that wins that race is
  accepted and is never killed.
- Keep an accepted detached handoff independent from Codex parent residency:
  closing Codex, losing its network connection, or crashing the launcher does
  not stop the background Agent. Only explicit interrupt/control or ordinary
  worker terminal lifecycle may stop that accepted turn.
- Require a deterministic worker PID identity for parent publication and treat
  a compare-and-swap miss as success only when the durable job proves that the
  spawned worker already owns the fact. Publication and cleanup fences both
  predicate on launcher PID identity and per-launch generation, so a stale
  parent cannot overwrite or terminate newer ownership.
- Release an exact-session lease from the parent only when worker spawn never
  succeeded. After spawn, terminal job lifecycle is the only release owner; a
  queued-to-terminal CAS is itself an execution fence because workers claim
  only from `queued`.
- Persist and read back terminal or handoff-uncertainty ownership before an
  unresolved child may be unreferenced; persistence failure keeps the child
  referenced and the lease owned.
- Propagate a structured `rollback_safe`, `lifecycle_owned`, or
  `ownership_uncertain` disposition so Agent lifecycle and mailbox rollback
  happen only when OS spawn provably never succeeded.
- Make post-spawn log-descriptor cleanup best-effort so it cannot reverse an
  accepted worker handoff.
- **Non-goals:** changing the six public Agent operations, Claude child-input
  acceptance, model selection, hook behavior, retry policy, or global reaper
  timing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tracked-job-control`: Define a durable detached-worker ownership handoff and
  exact-session lease transfer that cannot be rolled back after a worker exists.
- `agent-thread-registry`: Prevent Agent activation rollback from deleting or
  detaching a job whose worker launch has crossed the durable handoff boundary.

## Impact

The change is confined to internal worker launch, prepared-job rollback,
session-lease ownership, and local fault-injection tests. It adds optional
diagnostic and launcher-generation receipt fields and does not change plugin
discovery or the public runtime schema. Verification uses fake workers and
local process fixtures only; no real Claude call or subscription capacity is
required.

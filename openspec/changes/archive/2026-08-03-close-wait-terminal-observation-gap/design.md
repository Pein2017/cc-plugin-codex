## Context

The internal wait loop observes the current root's completion inbox and may
return timeout or one claimed advisory progress update. `AgentRuntime.waitAgent`
then reconciles terminal jobs before constructing the public receipt, but it
does not observe the inbox again. A completion published normally after the
loop's last poll, or repaired by that exit-time reconciliation, can therefore
already be unread while the same call reports timeout or stale progress.

Completion publication, payload freezing, delivery tokens, and acknowledgement
already have one durable owner in the existing completion inbox and internal
wait implementation. The fix must reuse that owner rather than add another
cursor, snapshot store, or MCP-side state.

## Goals / Non-Goals

**Goals:**

- Make the public wait receipt truthful at one defined final observation point.
- Preserve completion priority when terminal evidence appears after advisory
  progress was claimed.
- Retain crash-safe at-least-once delivery and quiet-timeout zero-write behavior.
- Remove the need to call `list_agents` solely to check whether a timeout missed
  a completion.

**Non-Goals:**

- No timeout Agent snapshot or `inspect_agent` operation.
- No new lifecycle states, receipt fields, cursor semantics, preflight tool,
  result envelope, write-scope enforcement, or MCP API generation bump.
- No periodic reconciliation inside the 500 ms wait loop.
- No promise about completions that become visible after the final observation.

## Decisions

### Reuse the existing wait path for one final completion observation

After the bounded internal wait returns, `AgentRuntime.waitAgent` keeps its
existing exit-time reconciliation. If the first result was not a completion,
it performs one additional internal wait with a zero timeout, no progress
wakeup, and no acknowledgement tokens. This reuses the inbox's existing
first-delivery freezing, token issuance, root isolation, and lock-free quiet
read instead of creating a second completion reader.

The final read is not another user-visible wait window. It is the linearization
point for the receipt: a completion visible there is returned; otherwise the
original progress or timeout remains authoritative for that observation.

### Completion supersedes already-claimed advisory progress

If the first wait claimed progress and the final read finds completion, the
public receipt returns the completion. The claimed progress revision remains
consumed because it was advisory and completion is authoritative. It is not
rolled back or redelivered. A later Agent turn retains its own progress budget.

### Describe the timeout guarantee instead of adding a snapshot

A genuine timeout means no unread current-root completion was visible at the
final observation. The wait Skill states this and tells the lead not to call
`list_agents` merely to repeat the completion check. It does not imply that a
`working` Agent is healthy, progressing, or unblocked; intentional progress
observation remains the existing `wake_on_progress` path.

### Keep reconciliation outside the poll loop

The rare publication/recovery boundary does not justify scanning and repairing
all Agent/job state every 500 ms. One exit-time reconciliation plus one final
zero-time read closes the misleading receipt window without adding recurring
lock, filesystem, or token cost.

## Risks / Trade-offs

- **A completion can appear immediately after final observation** → Document
  the guarantee at that observation point rather than claiming an impossible
  race-free view of future state.
- **A claimed progress update may never reach the lead** → This is intentional
  when a completion is already visible; tests prove completion priority and no
  progress redelivery.
- **The final read could regress quiet-timeout I/O** → Extend the existing
  persistence instrumentation test to require zero inbox locks, fsyncs, or
  durable writes on settled timeout.
- **A second internal wait could accidentally process acknowledgements or
  progress** → Pass empty acknowledgement tokens and disable progress, and
  cover the exact call behavior with focused tests.

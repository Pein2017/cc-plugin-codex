## Why

`wait_agent` can currently return `timedOut: true` even though its exit-time
reconciliation has just made an unread current-root completion available. This
creates an avoidable second `list_agents` or wait call and makes the timeout
receipt less truthful than the durable state visible at the same return
boundary.

## What Changes

- After the bounded wait finishes, reconcile terminal facts and perform one
  zero-time final completion observation before producing the public receipt.
- Return a completion visible at that final observation in place of a selected
  advisory progress update or timeout.
- Define a genuine timeout as proof that no unread current-root completion was
  visible at the final observation, and guide callers not to follow it with
  `list_agents` merely to recheck completion.
- Preserve the existing completion token, at-least-once redelivery, five
  lifecycle statuses, seven-tool surface, fixed model-facing wait bound, and
  quiet-timeout zero-write invariant.
- Explicitly exclude timeout snapshots, `inspect_agent`, runtime-managed
  cursors, public preflight, structured result envelopes, path-scoped write
  enforcement, and periodic reconciliation inside the wait loop.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-delivery`: make the exit-time completion observation part of the
  same wait receipt and define the resulting timeout guarantee.
- `agent-progress-delivery`: require a completion visible at final observation
  to supersede an already-claimed advisory progress update.
- `canonical-agent-orchestration`: teach the lead-facing wait guidance that a
  genuine timeout needs no immediate completion recheck through `list_agents`.

## Impact

The change is confined to checkout-owned wait orchestration, focused runtime
tests, the wait Skill, and the three modified OpenSpec capabilities. It does not
change the MCP input schema, add receipt fields, bump the MCP API generation,
alter Agent lifetime, or require a Plugin release during implementation.

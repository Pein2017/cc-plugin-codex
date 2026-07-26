## Why

The completion inbox's direct read path is observation-only, but a fully settled `wait_agent` still performs durable locks, fsyncs, and job rewrites during its pre/post reconciliation passes. Repeated quiet waits therefore create avoidable persistence traffic even when no recovery, delivery, acknowledgement, or progress transition exists.

## What Changes

- Make reconciliation treat an already-recorded Agent projection marker as a settled fact instead of rewriting its timestamp.
- Let completion reconciliation return an already-published immutable or acknowledged completion from a validated snapshot without reacquiring the inbox write lock.
- Add deterministic whole-call I/O regression coverage for quiet waits over settled terminal Agents.
- Preserve all recovery writes, first-delivery freezing, acknowledgement writes, progress claims, and missing-completion repair.
- Non-goals: change the public API, polling interval, delivery ordering, completion retention, Agent lifecycle, or Claude execution behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-delivery`: Extend the quiet-observation requirement from the direct inbox read seam to the complete `wait_agent` call once terminal completion and Agent projection facts are already settled.

## Impact

- Affected runtime seams: `runtime/agent-runtime.mjs` reconciliation and `runtime/completion-inbox.mjs` idempotent append/reconciliation.
- Affected tests: completion-inbox idempotency and Agent wait persistence-I/O regression coverage.
- No public API, dependency, installation, or Claude Code behavior changes.

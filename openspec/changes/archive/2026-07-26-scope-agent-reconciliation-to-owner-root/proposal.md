## Why

Current-root Agent operations filter foreign records only after the shared job
store has already performed stale reaping, completion publication, and Agent
session reconciliation. A read such as root A's `list_agents` can therefore
write root B's job, completion inbox, or Agent registry even though B remains
absent from A's returned view, violating the existing logical root-isolation
contract.

## What Changes

- Scope normal job reconciliation to the caller's immutable `ownerRootId`
  before any stale-job, completion, or Agent-session mutation occurs.
- Preserve explicit global maintenance and operator diagnostics as separate
  internal/read-only paths; no model-facing owner override is added.
- Preserve same-root legacy `job.sessionId` migration and current-root recovery,
  including deferred repair when that owner next invokes the runtime.
- Add deterministic cross-root regressions for stale reaping, completion
  publication, Agent session binding, and the internal status path used by
  interruption.
- **Non-goals:** filesystem/cryptographic isolation, a new public API, cross-root
  mutation, and changing retention, completion delivery, or Agent lifecycle
  semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tracked-job-control`: Clarify that normal reconciliation filters to the
  current owner before any lifecycle mutation, while explicit global
  maintenance remains separate.
- `agent-thread-registry`: Clarify that current-root reconciliation cannot bind,
  finalize, or otherwise modify a foreign Agent.

## Impact

The change affects the job-store reconciliation seam, Agent root-job discovery,
and the internal status/list path used by normal Agent operations. Public skill
names, command arguments, persisted schema, Claude sessions/artifacts,
dependencies, and installation metadata remain unchanged. Verification is local
and fake-runtime based; the change does not cross the Claude CLI/model/hook/env
boundary and therefore does not require a real Claude smoke.

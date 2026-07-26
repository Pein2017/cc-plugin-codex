## Context

Jobs for all Codex roots share one workspace-local job directory. The existing
read path loads every job, performs stale reaping, terminal Claude-session
binding, and completion reconciliation, and only then lets `AgentRuntime` or
`ClaudeRuntime` filter to the caller's root. Reproductions show root A's
`list_agents` can therefore fail root B's stale queued job, publish B's
completion, and bind B's Agent session while returning no B data to A.

The stable contract treats `ownerRootId` as a logical accidental-isolation
boundary, not a cryptographic authorization mechanism. Explicit global worker
cleanup and operator diagnostics still need workspace-wide visibility.

## Goals / Non-Goals

**Goals:**

- Filter raw job records by the current owner before any normal lifecycle
  mutation.
- Cover both Agent projection and the internal `list/status` path used by
  interruption.
- Preserve same-root legacy `job.sessionId` migration, stale recovery,
  completion repair, Agent projection, and the unprojected receipt tail beyond
  the normal 100-terminal retention view.
- Keep settled same-root reads write-free under the existing inbox guarantees.

**Non-Goals:**

- Filesystem, process-user, or cryptographic isolation between roots.
- A model-facing owner selector or cross-root mutation API.
- Persisted schema, retention-limit, public lifecycle, or Claude artifact
  changes.
- Restricting explicit global cleanup or read-only operator diagnostics.

## Decisions

### Split owner-scoped normal reads from explicit global maintenance

`job-store.mjs` will expose an owner-scoped bounded list and an owner-scoped
Agent reconciliation list. Both start from raw records, select jobs with
`ownerRootIdOf(job) === ownerRootId`, then reap and reconcile only that subset.
The Agent view additionally retains terminal Agent jobs whose projection marker
is missing, even outside the normal retention window.

Filtering the result of the current global reconciler was rejected because the
foreign writes have already happened. Making all reconciliation owner-scoped
was also rejected because worker cleanup is intentionally global.

### Use explicit owner first and legacy session fallback only when absent

Selection reuses the canonical owner rule: a non-empty explicit `ownerRootId`
wins; only a record without it may use legacy `job.sessionId`. A job declaring
root B cannot be adopted by root A merely because its legacy field or job ID
matches A.

After owner-scoped reap/reconciliation, normal runtime call sites migrate a
matching legacy job to explicit `ownerRootId`. Keeping migration after reaping
avoids refreshing `updatedAt` before the two-second startup grace decision.

### Route every normal status path through the owner-scoped seam

`AgentRuntime.rootJobs()` passes its immutable owner to the Agent view, migrates
matching legacy records, and then applies only Agent relevance
(`agentId` or a current Agent's `activeJobId`). `ClaudeRuntime.list/status`
uses the bounded owner view, covering the internal lookup performed by
`interrupt_agent`.

The zero-argument global list and `cleanupOldJobs` remain explicit internal
maintenance paths. Global session-uniqueness inspection, where needed, should
use the read-only stored-job view rather than cause lifecycle reconciliation.

### Preserve deferred recovery

Root A does not repair root B. When B next invokes a normal lifecycle operation,
the same owner-scoped logic performs B's stale reaping, session binding,
completion publication, legacy migration, and Agent projection. This preserves
durability while removing cross-root side effects.

## Risks / Trade-offs

- **Risk: a normal call site keeps using the global reconciler** → Cover both
  `AgentRuntime.rootJobs()` and `ClaudeRuntime.list/status` with cross-root
  regression tests, including the interruption lookup path.
- **Risk: legacy current-root records stop projecting** → Select through
  `ownerRootIdOf`, migrate after reap, and test same-root and foreign legacy
  records separately.
- **Risk: old unprojected receipts disappear behind retention** → Preserve
  the existing projection-tail union after owner-scoped reconciliation.
- **Trade-off: each root still scans the shared directory** → Reading raw
  headers remains necessary with the current flat storage; this change prevents
  writes but does not introduce a per-root filesystem index.
- **Risk: global cleanup semantics regress** → Keep its entry point global
  and retain existing multi-root cleanup/retention tests.

## Migration Plan

No data migration or reinstall is required. Existing jobs remain readable; a
matching legacy owner is upgraded on that owner's next normal call. Rollback is
the code commit only, although rollback would reintroduce the cross-root writes.

## Open Questions

None. Public API, persistence, and permission boundaries are unchanged.

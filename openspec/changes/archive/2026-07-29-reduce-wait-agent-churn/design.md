## Context

The durable runtime already projects bounded public progress and completion events into separate persisted paths. `wait_agent` currently merges them unconditionally: completion wins, but any eligible progress revision may wake the parent every 5 to 30 seconds. That behavior is useful for an intentional health observation and too noisy as the default join primitive.

The lifecycle remains owned by `runtime/index.mjs` and its existing Agent, job, mailbox, and completion stores. MCP is only a typed adapter. Claude workers remain asynchronous and independent of the lifetime of an individual wait call.

## Goals / Non-Goals

**Goals:**

- Make an ordinary join wait for completion or its bounded timeout without repeated progress wakeups.
- Preserve an explicit, bounded way to observe one safe intermediate progress update.
- Preserve completion priority, delivery acknowledgement, root isolation, recovery, and Agent process lifetime.
- Align lead guidance with Codex Multi-Agent V2's sparse-wait policy.

**Non-Goals:**

- Add a delegate convenience operation, background waiter, push notification, or persistent monitor state.
- Change progress persistence, Claude stream parsing, completion contents, or Agent residency.
- Use MCP progress notifications as a model-visible delivery channel.

## Decisions

### Ordinary waits are completion-first

`wait_agent` will accept an optional `wake_on_progress` boolean. When absent or false, the job-store wait selects unread completion only and returns timeout if no completion arrives. It does not inspect or claim the public-progress cursor.

This is preferable to changing the existing adaptive interval because any periodic model-visible wakeup still encourages another tool call. It is also preferable to a mode enum because the system needs only one exceptional behavior.

### Progress wakeup is call-local and one-shot

When `wake_on_progress: true`, that call may return one eligible safe progress update after checking completion. The setting is not persisted on the Agent or root. A later call therefore reverts to completion-first unless the caller explicitly opts in again.

Existing adaptive delivery and atomic claim logic remains the owner of deduplication and racing waits. Completion continues to outrank progress.

### Public surfaces expose one matching optional field

The MCP schema, checkout CLI, lifecycle adapter, and Skill use the same `wake_on_progress` name. The CLI spelling is `--wake-on-progress`. No eighth operation or compatibility alias is introduced.

### Process, persistence, and recovery boundaries remain unchanged

Cancelling or timing out a wait stops only that observation. It does not signal Claude, change Agent lifecycle, or mutate completion delivery. Ordinary waits leave persisted progress delivery state untouched; opt-in progress waits use the existing atomic progress claim. Restarts continue to recover from the existing durable stores, with no MCP-local state.

## Risks / Trade-offs

- [A parent may see less intermediate activity by default] → The Skill explains the explicit one-shot progress option and retains `list_agents` for logical health inspection.
- [Old Codex tasks cannot discover the new field] → Omission is safe and receives the quieter default; a versioned local refresh plus a new task enables the new schema and guidance.
- [A caller can still repeatedly opt in] → The Skill explicitly limits progress wakeup to an intentional observation and directs the next join back to the default.
- [A completion-only wait can occupy a tool call for ten minutes] → Completion returns immediately when available, the one-hour transport margin remains valid, and callers retain explicit shorter bounds.

## Migration Plan

1. Add the call-local runtime option and tests proving ordinary waits leave progress unclaimed.
2. Expose the optional MCP/CLI field and update model guidance.
3. Bump the Plugin minor version, run `npm run check`, and install the checkout-owned release snapshot.
4. Start a new Codex task to discover the updated schema and Skill. Existing tasks remain safe but cannot request progress through the stale schema.

Rollback is a normal checkout revert plus versioned local refresh. Durable Agent, completion, and progress records require no migration.

## Open Questions

None.

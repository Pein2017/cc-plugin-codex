## Context

CC for Pein already owns durable Agent identity, Claude session continuation,
and an at-least-once completion inbox. The current public projection exposes
the internal objects almost unchanged: `wait_agent` returns a raw inbox and all
Agents, while `list_agents` repeats the inbox and per-Agent completions. Stored
events can contain 64 KiB of final output each. The launcher also defaults to a
model and the safe profile, so headless Claude does not match Pein's native
full-access terminal envelope.

Codex Multi-Agent V2 separates these concerns: `wait_agent` only reports
mailbox/timeout activity, `list_agents` is a compact status projection, and
completion content travels through a separate parent mailbox. CC cannot depend
on a host wake callback, so it keeps a durable completion extension while
making the model-visible projection V2-like and bounded.

The previous linked worktree used `/data/CoordExp/external/cc-plugin-codex` as
its Git common directory. The implementation has been migrated to the
standalone `/data/CoordExp/cc-plugin-codex` clone with one Pein2017 `origin`;
the external checkout is reference-only.

## Goals / Non-Goals

**Goals:**

- Require the caller to choose Sonnet or Opus when creating an Agent.
- Launch Claude full-access by default with the native config and sandbox
  marker required for root execution.
- Keep final output durable internally but absent from default list/wait output.
- Preserve root isolation, exact-session continuation, crash recovery, and
  at-least-once completion acknowledgement.
- Let runtime edits take effect from the checkout immediately and refresh only
  Codex discovery metadata when skills or manifests change.

**Non-Goals:**

- Changing or elevating the parent Codex permission policy.
- Adding a result-fetch lifecycle operation, host callback, forwarding
  subagent, Sendbird dependency, or upstream compatibility layer.
- Deleting Claude Code session artifacts or the external reference checkout.

## Decisions

1. **Spawn owns the model choice.** `spawn_agent` rejects a missing model and
   accepts only the two exact IDs after normalizing the public Sonnet/Opus
   aliases. Follow-up turns inherit the Agent's original job request; the model
   is not inferred from task labels or Claude settings.

2. **Terminal parity becomes the default Claude envelope.** The effective
   config directory is `CLAUDE_NATIVE_CONFIG_DIR`, then `CLAUDE_CONFIG_DIR`,
   then `/data/CoordExp/.claude`. `runtime/execution-profile.mjs` sets
   `IS_SANDBOX=1` and always passes `--dangerously-skip-permissions` for the
   default terminal-parity profile. The explicit `safe` profile remains an
   opt-in sandboxed alternative. No Codex permission change is attempted.

3. **Stored detail and public projection are separate.** Completion events keep
   their existing bounded final output for durability and debugging. A new
   summary projection caps UTF-8 text, omits final output, result/session
   pointers, reconciliation internals, and protection metadata, and exposes at
   most the oldest Agent-linked update. `wait_agent` returns a Codex-like
   message/timed-out receipt plus that optional CC update and acknowledgement
   token. `list_agents` returns only canonical names and statuses; completed
   status contains `null`, not the final message.

4. **Legacy unowned events are quarantined in place.** Events with
   `agentId=null` remain stored for forensic compatibility but are treated as
   non-deliverable when scanning the contiguous sequence. The scanner advances
   across them before selecting the oldest Agent-linked update, so they cannot
   starve current Agent activity. A later acknowledgement may advance the
   cursor across skipped legacy sequences without rewriting IDs or tokens.

5. **Discovery refresh is atomic, runtime is checkout-hot.** Bootstrap keeps
   delegating every call to `CC_RUNTIME_CHECKOUT`, so runtime edits require no
   plugin action. A cachebuster helper and refresh command use `codex plugin
   add` to atomically replace the installed discovery snapshot without first
   removing the plugin or marketplace. Initial installation may rebind the
   local marketplace once when its root differs; subsequent refreshes fail on
   root drift instead of silently changing source.

6. **Legacy model migration is evidence-only and fail-closed.** A pre-v0.3
   Agent with no `selectedModel` may be backfilled only from an exact model in
   its retained runtime receipt or the bounded tail of its own Claude session
   artifact. Reconciliation groups pending session IDs by Claude config root
   and scans each `projects/` tree once, then persists either the exact
   supported selection or a terminal blocking reason. An active legacy turn
   with no evidence keeps its continuation mode and persists a non-blocking
   pending marker plus direct artifact candidate, avoiding repeated tree scans
   until evidence or a terminal state exists.
   An unsupported or terminal-unproven Agent keeps its identity and history but
   cannot accept messages or follow-up; a located unproven artifact is retried
   directly and restores exact-session continuation if supported evidence later
   appears. No model is inferred or substituted.

## Risks / Trade-offs

- **Full-access Claude can modify anything available to the host** → document
  the deliberate security posture, keep `safe` explicit, and verify the exact
  launch argv/environment in tests.
- **A summary may omit information needed for a decision** → retain complete
  job/event detail internally and make truncation explicit without adding it to
  default model context.
- **Skipped legacy events weaken delivery for removed one-shot jobs** → preserve
  them on disk and scope delivery strictly to the current six-operation Agent
  contract.
- **Installed skill changes are not visible to an already-started Codex task**
  → validate the cached snapshot and require a new task after refresh; runtime
  changes remain live without refresh.
- **Old Agent records may refer to models outside the v0.3 allowlist** → retain
  their durable identity/session evidence, defer active unproven turns, retry a
  directly located terminal artifact, and otherwise block continuation rather
  than silently changing the model.

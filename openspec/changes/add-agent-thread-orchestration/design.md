## Context

After foundation hardening, a Claude execution is a durable but bounded job, its terminal result produces a root-owned completion event, and its process exits. What is still missing is a logical identity that survives across those jobs. Codex Multi-Agent V2 provides the target mental model: an Agent is a durable thread with a stable name and history pointer; a turn is temporary work; completion does not destroy identity; follow-up transparently starts another turn.

CC for Pein remains a skill-based local plugin. Exact un-namespaced built-in tool registration is neither required nor available through skill naming, so the plugin exposes hyphenated skill names while the public runtime and CLI use canonical snake_case operation names. No resident MCP server is added.

## Goals / Non-Goals

**Goals:**

- Make a named Agent Thread, rather than a job ID, the public orchestration object.
- Align the feasible lifecycle names and semantics with Codex Multi-Agent V2, document deviations precisely, and preserve no old API aliases.
- Scope every Agent to one trusted Codex root while retaining cross-root diagnostics only in an operator CLI.
- Maintain one exact Claude Code session per Agent across sequential turns.
- Preserve logical identity without resident Claude processes or manual close/archive.
- Keep low-level jobs and receipts as internal execution evidence with bounded retention.

**Non-Goals:**

- Expose old `run/steer/status/result/cancel` names or auto-convert legacy jobs into Agents.
- Add tags, templates, auto-generated nicknames, archive, close, delete-history, or workspace-global employees.
- Add a model-visible destructive cancellation action.
- Reimplement Claude Code history, memory, hooks, skills, plugins, or MCP behavior.
- Claim that namespaced plugin skills are literal replacements for Codex built-in tools.

## Decisions

### 1. Agent Thread is the durable public identity; job is an internal turn receipt

Each Agent record contains:

- `schemaVersion` and stable generated `agentId`;
- stable root-relative `path`;
- user-supplied `name` and optional `description`;
- `rootThreadId` (identical to hardened `ownerRootId`) and canonical `workspaceRoot`;
- `currentJobId` or null;
- validated `claudeSessionId` or null;
- `status`: `pending_init`, `running`, `completed`, `interrupted`, or `errored`;
- creation/update timestamps and latest completion sequence.

The first job and every later follow-up point back to the Agent. Agent continuity reads the registry's current session pointer, not an arbitrary old job file. Names are unique within a root and duplicate spawn fails rather than silently suffixing or resuming another Agent.

Alternative considered: treat the latest job ID as the Agent ID. Rejected because bounded job cleanup would destroy identity and because a logical Agent necessarily spans multiple turns.

### 2. Root ownership is durable and default visibility never crosses it

`rootThreadId` is the already-hardened trusted `ownerRootId` injected by the bootstrap and is mandatory for normal operations. Model-facing calls cannot override it. `list_agents` returns only the current root. A separate operator CLI provides explicit redacted `--all` diagnosis and does not grant cross-root messaging, follow-up, interruption, waiting/acknowledgement, or session adoption.

Alternative considered: a workspace-global Agent registry visible to every Codex task. Rejected because independent Codex roots should not unexpectedly share workers, messages, or Claude sessions.

### 3. Replace the public API atomically with six canonical operations

Version `0.2.0` exposes only:

```text
spawn_agent({task_name, message, fork_turns: "none", description?, model?, reasoning_effort?, execution_profile?}) -> agent
send_message({target, message}) -> delivery receipt
followup_task({target, message}) -> turn receipt
wait_agent({timeout_ms?, acknowledge_tokens?}) -> root mailbox activity
interrupt_agent({target}) -> interruption receipt
list_agents({path_prefix?}) -> agent snapshots + unread completions
```

The corresponding plugin skills use Codex-compatible hyphenated names. The old public methods, CLI subcommands, skills, docs, and schemas are removed in the same release. A short migration table exists in documentation, but no runtime aliases or deprecation adapter remain.

Alternative considered: keep both APIs for one release. Rejected because the plugin is pre-1.0, privately controlled, and the user explicitly prefers one canonical vocabulary over compatibility burden.

The V2 alignment contract is explicit:

| Surface | Codex Multi-Agent V2 | CC for Pein v1 |
|---|---|---|
| Operation names | Six built-in tools | Same six snake_case runtime operations, exposed as namespaced hyphenated skills |
| `spawn_agent` core input | `task_name`, `message`, explicit `fork_turns` | Same core names; only `fork_turns=none` is supported because native Claude sessions cannot safely inherit Codex turns |
| Spawn routing extras | `agent_type`, Codex model/reasoning, service tier | Claude model/effort and execution profile extensions; no `agent_type` or Codex service tier |
| Message target | `target` path/name | Same |
| Wait | Untargeted root mailbox, `timeout_ms`; wakes on Codex mailbox activity or newly steered user input | Untargeted root completion inbox plus optional prior `acknowledge_tokens`; it does not reproduce arbitrary Codex inter-agent mailbox messages or user-steer wakeups |
| List | Root tree with optional `path_prefix` | Same model-facing behavior; cross-root `--all` exists only in operator CLI |
| Residency | Runtime unload/reload | Every Claude turn exits; exact-session follow-up starts a new process |

Unsupported `fork_turns`, `agent_type`, or service-tier inputs fail explicitly rather than being ignored or injected into Claude prompts.

### 4. Match V2 message-versus-follow-up semantics

`send_message` durably delivers to an Agent's active turn when possible; if no turn is active, it queues without starting one. `followup_task` uses the same durable message path but also guarantees work: it starts an exact-session turn when the Agent is terminal, or makes the message available promptly to the active turn at the next stream boundary. One Agent has at most one active job, while multiple Agents under the same root may run concurrently subject to any evidence-derived capacity policy.

Alternative considered: make both operations aliases for live steering. Rejected because the canonical distinction is whether an idle Agent is activated.

### 5. Waiting consumes durable completion state, not process residency

`wait_agent` follows Codex V2 by waiting on the current root mailbox, not on a caller-selected Agent set. It may first acknowledge opaque tokens returned by an earlier call, then returns the oldest unread contiguous activity batch or blocks up to `timeout_ms`. Newly returned events remain unread until a later call echoes their tokens, so a crash before Codex receives the response causes safe redelivery. `list_agents` accepts canonical `path_prefix` and reports unread summaries without acknowledging them; repeated list calls are read-only. Cross-root `all` exists only in the operator CLI.

Alternative considered: keep a forwarding subagent alive for every Claude Agent. Rejected because the inbox already separates eventual delivery from resident execution and the host cannot guarantee unsolicited wakeup.

### 6. Interruption ends a turn, never the Agent

`interrupt_agent` requests graceful interruption. A gracefully stopped turn becomes `interrupted` only when exact-session resumability is proven; otherwise it becomes `errored`. Bounded forced process-tree termination is allowed internally when graceful signaling is unavailable, but defaults to `errored` and non-resumable unless a platform-specific receipt proves that Claude safely persisted a resumable session. There is no public cancel operation and no new active `cancelled` state. Internal stale-process cleanup is an implementation responsibility, not a model-visible lifecycle action.

Alternative considered: retain destructive `cancel` for parity with the old plugin. Rejected because canonical V2 has no such public action and interruption plus internal cleanup covers the required resource boundary.

### 7. Completed Agents remain logical, non-resident, and unarchived

Completed, interrupted, and errored Agents remain visible within their root; only Agents with exact-session or receipt-proven safe-fresh recovery can receive follow-up. Their Claude process and worker have exited. No archive or close exists in v1 because it would neither free runtime memory nor serve a second product consumer. Agent metadata is not subject to the 100-job receipt cap; job receipts remain capped per root and Claude artifacts remain independently owned.

Alternative considered: add archive for list cleanliness. Rejected until there is a real hide/unhide or root-history management workflow.

### 8. Preserve native Claude configuration and bind session ownership explicitly

Every model-facing `spawn_agent` creates a new native Claude session; later turns resume only the Agent's root-bound session. The runtime persists a canonical `(CLAUDE_CONFIG_DIR, Claude session ID) -> ownerRootId, agentId` binding when a session is first observed. A foreign Terminal-created session can be adopted only through a separate explicit user-authorized operator workflow after the direct Terminal process stops and lease/config checks pass; the model-facing spawn input cannot claim it.

Alternative considered: import or mirror Claude transcripts into the Agent registry. Rejected because Claude Code owns their schema, compaction, and resume behavior.

## Risks / Trade-offs

- [The canonical names resemble built-ins but skills remain plugin-namespaced] → Document the exact `$cc-for-pein:*` mapping and keep semantics, arguments, and receipts consistent.
- [Queued `send_message` can surprise a caller when the Agent is idle] → Return a clear `queued_no_turn` delivery receipt and direct callers to `followup_task` when execution is desired.
- [A registry update and job transition can crash between writes] → Use deterministic linkage and startup reconciliation; never infer session ownership from name alone.
- [Legacy cancelled jobs still exist on disk] → Treat them as read-only diagnostic artifacts until bounded cleanup; do not retain cancellation code in the public runtime.
- [No archive means metadata accumulates] → Agent records are small and root-scoped; revisit only when measured scale or a user-facing history workflow creates a real need.
- [A direct Terminal session is outside plugin root ownership] → Require a user-authorized operator adoption action, persist the root/session binding, and require sequential handoff.
- [An initial turn can fail before a usable session exists] → Roll back a pre-launch reservation; after launch allow a fresh-session retry on the same Agent only when the receipt proves no side effect/session ambiguity, otherwise mark it permanently blocked and reject queued messages.
- [Forced termination may leave an unflushed Claude transcript] → Default to errored/non-resumable unless platform-specific evidence proves safe resume.

## Migration Plan

1. Require the two earlier changes to be archived, diff every MODIFIED/REMOVED requirement against the materialized stable specs, record a resolved requirement matrix, and require all hardening acceptance evidence to pass.
2. Add the versioned Agent registry, trusted root/name indexes, Claude session-root bindings, atomic transitions, and job/completion reconciliation.
3. Add the six canonical runtime operations and contract tests while old methods still exist only on the implementation branch.
4. Replace `runtime/index.mjs` atomically, remove old CLI commands and six old skills, and add the six new skill surfaces.
5. Remove public cancellation and active cancellation routing/statuses; retain only identity-verified bounded internal process cleanup needed by interruption and stale-worker recovery.
6. Update README, manifests, schemas, changelog, package/plugin versions to `0.2.0`, and add a concise old-to-new migration table.
7. Run focused tests, `npm run check`, multi-Agent fake-Claude tests, restart/recovery tests, and real Claude smokes for spawn, concurrent Agents, interrupt, completion, and exact-session follow-up.
8. Reinstall the local plugin snapshot from this checkout and verify the six new skills after a Codex restart before retiring the prior installed snapshot.

Rollback reinstalls the previous local plugin version and leaves the additive Agent registry untouched. It does not delete Claude session artifacts or legacy job receipts.

## Open Questions

None for v1. Archive/close, proactive host wakeup, tags/templates, and an MCP tool surface require separate future evidence and OpenSpec changes.

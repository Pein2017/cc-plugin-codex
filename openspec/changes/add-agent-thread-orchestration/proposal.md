## Why

Job IDs are useful execution receipts but are the wrong long-lived orchestration identity: every follow-up creates another job and Codex must remember which Claude session belongs to which role. After foundation hardening, CC for Pein can expose root-scoped logical Agent Threads with the canonical Codex Multi-Agent V2 operation names and a documented Claude-specific behavioral subset, while keeping Claude processes ephemeral and Claude session history native.

## What Changes

- Add a durable root-scoped Agent Thread registry with stable path, root-unique name, description, current job, exact Claude session, and lifecycle status.
- Add the canonical six public lifecycle operation names `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, and `list_agents`, with an explicit deviation table for cross-model context, durable acknowledgement, and operator diagnostics.
- Expose matching Codex skills as `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, and `$cc-for-pein:list-agents`; retain snake_case in the runtime/CLI contract.
- **BREAKING**: Remove public `start/run`, `steer`, `status`, `result`, `followUp`, and `cancel` operations and their old skills without a compatibility layer.
- **BREAKING**: Remove user-facing destructive cancellation and the active `cancelled` lifecycle path. Internal bounded process termination may support interruption/cleanup but does not become a public Agent operation.
- Keep `--all` as an explicit read-only operator CLI across Codex roots; it is not model-facing and normal Agent discovery/control remain root-scoped.
- Preserve Agent identity and latest Claude session pointer independently from the bounded 100 terminal job receipts per root.
- Keep completed/interrupted/errored Agents logically visible without resident Claude processes; allow follow-up only when exact-session or receipt-proven safe-fresh recovery is available, and add neither close nor archive in v1.

## Capabilities

### New Capabilities

- `agent-thread-registry`: Root-owned durable Agent identity, uniqueness, state, Claude-session linkage, and non-resident continuity.
- `canonical-agent-orchestration`: Canonical Multi-Agent V2 operation names, the feasible behavioral subset, documented deviations, and plugin skill surface.

### Modified Capabilities

- `tracked-job-control`: Job operations become internal execution primitives and the old public job-oriented lifecycle and cancellation surface are removed.
- `completion-delivery`: Completion inbox entries identify the owning Agent and drive `wait_agent` plus next-turn unread reporting.
- `durable-runtime-state`: Agent continuity uses its own durable registry and latest-session pointer rather than depending on retained historical job records.

## Impact

- Major-version-like breaking surface change delivered as plugin version `0.2.0` while the personal plugin remains pre-1.0.
- Affects `runtime/index.mjs`, CLI parsing/rendering, registry/store/supervisor integration, schemas, the six plugin skills, documentation, manifests, tests, and local installation snapshot.
- Existing job and Claude artifacts are not deleted. Legacy job receipts remain diagnostic data until normal bounded cleanup, but are not exposed through a compatibility API and are not automatically promoted to Agents.
- The host Claude Code CLI and configured `CLAUDE_CONFIG_DIR` remain the owners of full Claude session artifacts.
- Adopting a foreign Terminal-created Claude session is removed from the model-facing spawn path and reserved for an explicit user-authorized operator workflow with a durable root/session binding.

## Non-goals

- Providing aliases or a deprecation release for the old cc API.
- Adding an MCP server merely to imitate un-namespaced built-in Codex tool names.
- Adding tags, templates, automatic nicknames, archive, close, delete-history, or permanent resident workers.
- Making Agents visible or controllable across Codex roots by default.
- Replacing Claude Code's own session, memory, hook, skill, MCP, plugin, or artifact management.

## Lifecycle Order

Apply only after `establish-cc-runtime-baseline` and `harden-runtime-foundations` are verified, synced, and archived in that order.

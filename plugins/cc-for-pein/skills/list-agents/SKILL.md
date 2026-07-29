---
name: list-agents
description: 'Experimental: list durable CC Agents in the current Codex root, including nonresident terminal history.'
---

# List Agents

> **Experimental.** This is a state snapshot, not a progress stream, completion
> inbox read, or mechanism for reactivating an idle Codex parent.

Invoke `mcp__cc_for_pein__list_agents` with no fields for the current root, or
with the optional typed `path_prefix` field.

Before invoking, confirm the active Codex turn workspace is the checkout or
worktree whose Agent registry should be listed. Trusted Codex metadata supplies
the workspace and root identity; never add cwd, environment, owner-root, or
Claude-session selectors. If the typed MCP tool is unavailable, report the
Plugin discovery/startup failure instead of silently running a shell fallback.

- The Agent topology is flat: `/root/<task_name>`. `path_prefix` filters only
  this read-only listing; it is not a mutation target.
- Every current-root logical Agent is listed even after its Claude worker has
  exited. Completion delivery is handled only by `$cc-for-pein:wait-agent`.
- Cross-root `all` is intentionally absent. It is a redacted read-only
  operator diagnostic, never a model-facing operation.
- Terminal-session adoption is deferred and is not represented by this list.
- Present only the useful Agent names, five-state status, and immutable
  delegation mode. Status is one of `starting`, `working`, `completed`,
  `failed`, or `interrupted`. Do not echo raw JSON,
  delivery tokens, or final Claude output unless the user explicitly requests
  raw/debug detail.

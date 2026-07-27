---
name: list-agents
description: 'Experimental: list durable CC Agents in the current Codex root, including nonresident terminal history.'
---

# List Agents

> **Experimental.** This is a state snapshot, not a progress stream, completion
> inbox read, or mechanism for reactivating an idle Codex parent.

Resolve `<plugin-root>` as two directories above this `SKILL.md`, then run:

`node -- "<plugin-root>/bootstrap/cc-runtime.mjs" list_agents $ARGUMENTS`

Before invoking, confirm the host command cwd is the checkout or worktree whose
Agent registry should be listed. The lifecycle inherits that Codex cwd; never
pass `--cwd`, `-C`, or `--env-file`. The bootstrap delegates only to the fixed
local checkout and never executes a runtime from the Plugin Cache.

Supported canonical arguments: `[--path-prefix </root/prefix>]`.

- The Agent topology is flat: `/root/<task_name>`. `path_prefix` filters only
  this read-only listing; it is not a mutation target.
- Every current-root logical Agent is listed even after its Claude worker has
  exited. Completion delivery is handled only by `$cc-for-pein:wait-agent`.
- Cross-root `--all` is intentionally absent. It is a redacted read-only
  operator diagnostic, never a model-facing operation.
- Terminal-session adoption is deferred and is not represented by this list.
- Present only the useful Agent names and statuses. Do not echo raw JSON,
  delivery tokens, or final Claude output unless the user explicitly requests
  raw/debug detail.

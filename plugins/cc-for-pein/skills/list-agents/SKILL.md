---
name: list-agents
description: 'List durable CC Agents in the current Codex root, including nonresident terminal history and unread completion summaries.'
---

# List Agents

Resolve `<plugin-root>` as two directories above this `SKILL.md`, then run:

`node "<plugin-root>/bootstrap/cc-runtime.mjs" list_agents $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported canonical arguments: `[--path-prefix </root/prefix>]`.

- The Agent topology is flat: `/root/<task_name>`. `path_prefix` filters only
  this read-only listing; it is not a mutation target.
- Every current-root logical Agent is listed even after its Claude worker has
  exited. Completion summaries remain unread and repeatable until a later
  `$cc-for-pein:wait-agent` acknowledges their delivery tokens.
- Cross-root `--all` is intentionally absent. It is a redacted read-only
  operator diagnostic, never a model-facing operation.
- Terminal-session adoption is deferred and is not represented by this list.
- Present the runtime receipt exactly as returned.

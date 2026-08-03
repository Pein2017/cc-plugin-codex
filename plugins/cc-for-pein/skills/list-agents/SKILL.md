---
name: list-agents
description: 'Experimental: list durable CC Agents in the current Codex root, including nonresident terminal history.'
---

# List Agents

> **Experimental.** This is a logical state snapshot, not progress or
> completion delivery, and it cannot reactivate Codex.

Call `mcp__cc_for_pein__list_agents` with no fields, or optional `path_prefix`
for the flat `/root/<task_name>` tree. Trusted Codex metadata owns cwd/root. If
unavailable, report Plugin startup or discovery failure; never use shell.

The list includes nonresident current-root Agents. Cross-root `all` remains
operator-only; completion comes from `$cc-for-pein:wait-agent`. Never call this
solely to recheck completion after a quiet `wait_agent` timeout; if required
work remains unresolved, call `wait_agent` again directly instead. Present
names, model, immutable delegation mode, and only `starting`, `working`,
`completed`, `failed`, or `interrupted`; omit JSON, tokens, and final output
unless debug was explicitly requested.

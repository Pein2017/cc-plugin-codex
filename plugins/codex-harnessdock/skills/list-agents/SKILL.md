---
name: list-agents
description: 'Experimental: list durable Agents in the current Codex root, including nonresident terminal history.'
---

# List Agents

> **Experimental.** A state snapshot, not delivery; it cannot reactivate Codex.

Call `mcp__codex_harnessdock__list_agents` with no fields, or optional `path_prefix`
for the flat `/root/<task_name>` tree. Exact `/root` is the same unfiltered
current-root view as omitting the field. Trusted Codex metadata owns cwd/root.
If unavailable, report Plugin startup or discovery failure; never use a shell fallback.

Release drift: use the exact retained Skill path; latest-version instructions
are emergency-only; `HARNESSDOCK_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

The list includes nonresident current-root Agents. Each Agent Card states its
Harness, route maturity, retained model/effort, behavioral authority (`write:
false` is not a process sandbox), delegation mode, safe phase, and nullable
timing evidence. Elapsed time is not liveness evidence. Cross-root `all` is
operator-only; completion comes from
`$codex-harnessdock:wait-agent`. Never call this
solely to recheck completion after a quiet `wait_agent` timeout; if work
remains unresolved, call `wait_agent` again directly instead. Present names, Harness, model, and only
`starting`, `working`, `completed`, `failed`, or `interrupted`; omit JSON,
tokens, and final output unless debug was requested.

---
name: interrupt-agent
description: 'Experimental: gracefully interrupt a CC Agent current turn while keeping its durable identity and any safely proven continuation path.'
---

# Interrupt Agent

> **Experimental.** Interruption semantics depend on Claude flush evidence and
> do not imply deletion, archive, or automatic Codex-parent reactivation.

Invoke `mcp__cc_for_pein__interrupt_agent` with the typed `target` field.

Before invoking, confirm the active Codex turn workspace is the checkout or
worktree that owns the Agent. Trusted Codex metadata supplies the workspace and
root identity; never add cwd, environment, owner-root, or Claude-session
selectors. If the typed MCP tool is unavailable, report the Plugin
discovery/startup failure instead of silently running a shell fallback.

- Resolve `target` exactly within the current logical Codex root; prefixes do
  not select arbitrary Agents.
- A proven graceful interruption preserves exact-session continuation. Forced
  termination without Claude flush evidence becomes errored and non-resumable,
  while the Agent record remains listed.
- There is no public destructive cancel operation or Agent deletion action.
- Present the interruption receipt exactly as returned.

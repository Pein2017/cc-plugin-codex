---
name: followup-task
description: 'Experimental: send durable work to a CC Agent and guarantee delivery or activation through its proven continuation path.'
---

# Follow Up Agent

> **Experimental.** This can activate a Claude turn, but cannot automatically
> reactivate an idle Codex parent after that turn finishes.

Invoke `mcp__cc_for_pein__followup_task` with typed `target` and `message`
fields. Optional fields are `reasoning_effort`, `execution_profile`, `write`,
and `allowed_tools`.

Before invoking, confirm the active Codex turn workspace is the checkout or
worktree where this Agent should work. Trusted Codex metadata supplies the
workspace and root identity; never add cwd, environment, owner-root, model, or
Claude-session selectors. If the typed MCP tool is unavailable, report the
Plugin discovery/startup failure instead of silently running a shell fallback.

- `target` is exact and root-scoped: use an Agent ID, its full flat path, or
  its exact normalized name.
- Omitted `write` inherits the Agent's latest activation intent. Pass
  `write: false` whenever a new read/review follow-up reduces authority, and
  pass `write: true` only when a new mutation follow-up is explicitly
  authorized. Under default terminal parity, false omits
  `--dangerously-skip-permissions`; true adds it. False is governed by native
  Claude permissions and is not an OS-enforced read-only sandbox.
- If the Agent is idle, this starts one new exact-session or receipt-proven
  safe-fresh turn and assigns queued messages in order. If it is already
  running, it sends only one durable active-turn message.
- A blocked continuation is an explicit failure; never substitute a foreign
  or direct Terminal Claude session.
- Present the turn receipt exactly as returned.

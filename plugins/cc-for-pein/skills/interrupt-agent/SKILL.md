---
name: interrupt-agent
description: 'Experimental: gracefully interrupt a CC Agent current turn while keeping its durable identity and any safely proven continuation path.'
---

# Interrupt Agent

> **Experimental.** Interruption semantics depend on Claude flush evidence and
> do not imply deletion, archive, or automatic Codex-parent reactivation.

Resolve `<plugin-root>` as two directories above this `SKILL.md`, then run:

`node -- "<plugin-root>/bootstrap/cc-runtime.mjs" interrupt_agent $ARGUMENTS`

Before invoking, confirm the host command cwd is the checkout or worktree where
this Agent should work. The lifecycle inherits that Codex cwd; never pass
`--cwd`, `-C`, or `--env-file`. The bootstrap delegates only to the fixed local
checkout and never executes a runtime from the Plugin Cache.

Supported canonical arguments: `<target>`.

- Resolve `target` exactly within the current logical Codex root; prefixes do
  not select arbitrary Agents.
- A proven graceful interruption preserves exact-session continuation. Forced
  termination without Claude flush evidence becomes errored and non-resumable,
  while the Agent record remains listed.
- There is no public destructive cancel operation or Agent deletion action.
- Present the interruption receipt exactly as returned.

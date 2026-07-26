---
name: followup-task
description: 'Experimental: send durable work to a CC Agent and guarantee delivery or activation through its proven continuation path.'
---

# Follow Up Agent

> **Experimental.** This can activate a Claude turn, but cannot automatically
> reactivate an idle Codex parent after that turn finishes.

Resolve `<plugin-root>` as two directories above this `SKILL.md`, then run:

`node "<plugin-root>/bootstrap/cc-runtime.mjs" followup_task $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported canonical arguments: `<target> <message>`.

- `target` is exact and root-scoped: use an Agent ID, its full flat path, or
  its exact normalized name.
- If the Agent is idle, this starts one new exact-session or receipt-proven
  safe-fresh turn and assigns queued messages in order. If it is already
  running, it sends only one durable active-turn message.
- A blocked continuation is an explicit failure; never substitute a foreign
  or direct Terminal Claude session.
- Present the turn receipt exactly as returned.

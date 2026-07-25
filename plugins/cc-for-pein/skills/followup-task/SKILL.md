---
name: followup-task
description: 'Send a durable message to a CC Agent and guarantee work: deliver to its active turn or activate an idle Agent through its proven continuation path.'
---

# Follow Up Agent

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

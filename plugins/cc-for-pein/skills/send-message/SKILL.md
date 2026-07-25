---
name: send-message
description: 'Durably send a message to a named CC Agent. It delivers to an active turn when possible and queues without activation when the Agent is idle.'
---

# Send Agent Message

Resolve `<plugin-root>` as two directories above this `SKILL.md`, then run:

`node "<plugin-root>/bootstrap/cc-runtime.mjs" send_message $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported canonical arguments: `<target> <message>`.

- `target` must be an exact Agent ID, exact `/root/<task_name>` path, or exact
  normalized name in the current logical Codex root; prefixes do not mutate.
- A running Agent receives durable active-turn delivery. An idle resumable
  Agent returns `queued_no_turn`; use `$cc-for-pein:followup-task` to activate
  it.
- A blocked Agent rejects the message with its continuation evidence rather
  than queueing work that cannot run.
- Present the delivery receipt exactly as returned.

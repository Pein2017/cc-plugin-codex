---
name: send-message
description: 'Experimental: durably deliver or queue a message for a named CC Agent without implicitly activating an idle Agent.'
---

# Send Agent Message

> **Experimental.** Queueing a message does not activate an idle Claude Agent
> or reactivate an idle Codex parent.

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

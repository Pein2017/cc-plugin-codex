---
name: wait-agent
description: 'Wait durably for current-root CC Agent completion activity, with optional two-phase acknowledgement tokens. It never targets, starts, or interrupts an Agent.'
---

# Wait for Agent Activity

Resolve `<plugin-root>` as two directories above this `SKILL.md`, then run:

`node "<plugin-root>/bootstrap/cc-runtime.mjs" wait_agent $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported canonical arguments: `[--timeout-ms <ms>]`
`[--acknowledge-tokens <comma-separated-tokens>]`.

- Waiting is untargeted and reads only the current logical root mailbox.
- It first acknowledges only a valid oldest contiguous prefix from a previous
  response. Newly returned completion events remain unread until their tokens
  are echoed later, enabling crash-safe redelivery.
- A quiet mailbox returns an honest timeout without changing any Agent.
- Report only activity or timeout, plus one concise update when activity is
  available. Do not reproduce raw JSON or an Agent's final Claude output unless
  the user explicitly requests raw/debug detail.

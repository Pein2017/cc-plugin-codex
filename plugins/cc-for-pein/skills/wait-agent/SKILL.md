---
name: wait-agent
description: 'Experimental: wait for bounded current-root CC Agent progress or completion activity, with two-phase acknowledgement for completion. It never targets, starts, or interrupts an Agent.'
---

# Wait for Agent Activity

> **Experimental.** Waiting can observe a running parent turn, but it cannot
> reactivate a Codex parent that has already ended. Required joins must remain
> inside the active parent turn.

Resolve `<plugin-root>` as two directories above this `SKILL.md`, then run:

`node "<plugin-root>/bootstrap/cc-runtime.mjs" wait_agent $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported canonical arguments: `[--timeout-ms <ms>]`
`[--acknowledge-tokens <comma-separated-tokens>]`.

The default observation upper bound is 600000 ms (10 minutes); the maximum is
3600000 ms (one hour). This is an upper bound, not a sleep duration: eligible
activity returns immediately.

- Waiting is untargeted and reads only the current logical root mailbox.
- It first acknowledges only a valid oldest contiguous completion prefix from
  a previous response. Newly returned completion events remain unread until
  their tokens are echoed later, enabling crash-safe redelivery.
- Completion has priority. A completion update carries a bounded
  `completion_message` for parent synthesis plus a truncation flag and delivery
  token. Use that handoff directly; do not start a follow-up or ask the Agent to
  write `/tmp`/repository files solely to recover an already completed result.
- Progress updates are advisory, coalesced, adaptively rate-limited, and
  privacy-bounded. Routine heartbeat delivery backs off from 5 to 10, 20, and
  at most 30 seconds while retaining only the latest revision. Retry,
  reconnect, and first-response transitions reset the backoff. Updates contain
  a generic activity/phase summary and may include a sanitized tool name, but
  never Claude text, thinking, tool inputs, paths, hook payloads, session IDs,
  or raw receipts. Completion always bypasses progress cooldown and returns
  immediately.
- A quiet mailbox returns an honest timeout without changing any Agent.
- Timeout means only that this observation window was quiet. Do not call
  `list-agents` as a progress substitute, narrate unchanged timeouts, or treat a
  timeout as failure/cancellation.
- When useful non-overlapping parent work exists, do it before waiting again.
  When a required result is the active blocker, continue bounded waits until
  completion, user steering, or an actionable failure. Never give the final
  answer with an unresolved required or parallel-then-join obligation.
- Use the completion handoff for reasoning and synthesize it for the user. Do
  not dump it verbatim unless the user explicitly requests raw/debug detail.

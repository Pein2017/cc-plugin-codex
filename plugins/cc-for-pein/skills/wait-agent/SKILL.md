---
name: wait-agent
description: 'Experimental: join current-root CC completion or intentionally observe one bounded progress update; never targets or interrupts an Agent.'
---

# Wait for Agent Completion

> **Experimental.** Wait cannot reactivate an ended Codex turn; required joins
> stay inside the active parent.

Call `mcp__cc_for_pein__wait_agent` with optional `timeout_ms`,
`wake_on_progress`, and `acknowledge_tokens`. It is untargeted and current-root.
Trusted Codex metadata owns cwd/root. If unavailable, report Plugin startup or
discovery failure; never use shell.

For an ordinary join omit timeout and progress: it returns immediately on
completion with a 600000 ms (10-minute) upper bound. Use another timeout only
for an intentional probe/window (maximum 3600000 ms). Set
`wake_on_progress: true` only when one intermediate update changes scheduling;
then do useful work or return to completion-first waiting, not repeated polling.

- A later call may acknowledge only prior contiguous `delivery_token` values.
  A newly returned completion stays unread for crash-safe redelivery.
- Completion has priority and includes the complete stored
  `completion_message`, legacy truncation flag, and token. Use it directly; do
  not follow up, read history, or request a file merely to recover that result.
- Opt-in progress returns at most one sanitized, coalesced, adaptively backed-off
  update; it excludes Claude text, thinking, inputs, paths, hooks, sessions, and
  raw receipts.
- Timeout only means this window was quiet. Do not narrate unchanged timeouts,
  use list as progress, or treat timeout as failure/cancellation.
- Never finalize with an unresolved required or parallel-then-join result.
  Synthesize the complete message; quote it verbatim only when requested.

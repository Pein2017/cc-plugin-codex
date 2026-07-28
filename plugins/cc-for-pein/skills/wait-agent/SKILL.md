---
name: wait-agent
description: 'Experimental: wait for bounded current-root CC Agent progress or completion activity, with two-phase acknowledgement for completion. It never targets, starts, or interrupts an Agent.'
---

# Wait for Agent Activity

> **Experimental.** Waiting can observe a running parent turn, but it cannot
> reactivate a Codex parent that has already ended. Required joins must remain
> inside the active parent turn.

Invoke `mcp__cc_for_pein__wait_agent` with optional typed `timeout_ms` and
`acknowledge_tokens` fields.

Before invoking, confirm the active Codex turn workspace is the checkout or
worktree whose Agent mailbox should be observed. Trusted Codex metadata
supplies the workspace and root identity; never add cwd, environment,
owner-root, target, or Claude-session selectors. If the typed MCP tool is
unavailable, report the Plugin discovery/startup failure instead of silently
running a shell fallback.

For an ordinary required join, omit `timeout_ms`. The runtime then uses its
default observation upper bound of 600000 ms (10 minutes). Pass `timeout_ms`
only for an intentional immediate probe, a
shorter observation window, or a longer bounded wait; the maximum is 3600000 ms
(one hour). The timeout is an upper bound, not a sleep duration: eligible
activity returns immediately.

- Waiting is untargeted and reads only the current logical root mailbox.
- It first acknowledges only a valid oldest contiguous completion prefix from
  a previous response. Newly returned completion events remain unread until
  their tokens are echoed later, enabling crash-safe redelivery.
- Completion has priority. A completion update carries the complete stored
  `completion_message` for parent synthesis plus a legacy-compatible
  truncation flag and delivery token. New completions are not truncated by
  cc-for-pein. Use that message directly; do not start a follow-up, read history,
  or ask the Agent to write `/tmp`/repository files solely to recover the
  current completed result.
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
- Use the complete completion message for reasoning and synthesize it for the user. Do
  not dump it verbatim unless the user explicitly requests raw/debug detail.

---
name: wait-agent
description: 'Experimental: join current-root CC completion or intentionally observe one bounded progress update; never targets or interrupts an Agent.'
---

# Wait for Agent Completion

> **Experimental.** Wait cannot reactivate an ended Codex turn; required joins
> stay inside the active parent.

Call `mcp__cc_for_pein__wait_agent` with optional `wake_on_progress` and
`acknowledge_tokens`. It is untargeted and current-root.
Trusted Codex metadata owns cwd/root. If unavailable, report Plugin startup or
discovery failure; never use shell.

After asynchronous spawn, first do meaningful non-overlapping work. Call wait
only when the critical path is blocked. For an ordinary join omit progress: it
returns immediately on completion with a fixed 600000 ms (10-minute) upper
bound. Set `wake_on_progress: true` only when one intermediate update per active
Agent job changes scheduling. Then do useful work, steer, or return to an
ordinary completion-first join; never repeat progress waiting for that job.

- A later call may acknowledge only prior contiguous `delivery_token` values,
  and must pass a consumed completion token exactly once when that later wait
  is made. A caller that ends after consuming the completion does not need an
  acknowledgement-only call. A newly returned completion stays unread for
  crash-safe redelivery.
- Completion has priority and includes the complete stored
  `completion_message`, legacy truncation flag, and token. Use it directly; do
  not follow up, read history, or request a file merely to recover that result.
- Opt-in progress returns at most one sanitized update per active Agent job.
  Hook activity stays private, and the update excludes Claude text, thinking,
  inputs, paths, sessions, and raw receipts.
- Timeout only means this window was quiet. Do not narrate unchanged timeouts,
  use list as progress, or treat timeout as failure/cancellation.
- Never finalize with an unresolved required or parallel-then-join result.
  Synthesize the complete message; quote it verbatim only when requested.
- A completion carries `blocking`: `null` for `completed`, and `null` for an
  `interrupted` status the parent itself requested and that proved a safe
  flush — that Agent stays resumable via `$cc-for-pein:followup-task` on its
  same session, not a failed lane. Otherwise `blocking` is a closed
  `{reason, scope, retry}`; branch on `retry` per the spawn Skill's join
  policy. A `completed` turn whose message asks a question is still
  `blocking: null` regardless of its wording: answer with
  `$cc-for-pein:followup-task` on that same Agent, never spawn a
  replacement or infer status from message text.

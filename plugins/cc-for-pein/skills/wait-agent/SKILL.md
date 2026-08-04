---
name: wait-agent
description: 'Experimental: join current-root CC completion or an Agent turn/barrier, or intentionally observe one bounded progress update; never interrupts an Agent.'
---

# Wait for Agent Completion

> **Experimental.** Wait cannot reactivate an ended Codex turn; joins stay in
> the active parent.

Call `mcp__cc_for_pein__wait_agent` with optional `wake_on_progress`,
`acknowledge_tokens`, or `targets`. Omit `targets` for ordinary root-wide
join. When the dependency set is known, pass one to eight unique exact
current-root Agent identifiers: one target joins that turn, while
multiple targets form one all-settled barrier. `targets` and
`wake_on_progress` cannot be combined.
Trusted Codex metadata owns cwd/root. If unavailable, report Plugin startup or
discovery failure; never use shell.

After spawn, first do meaningful non-overlapping work. Call wait
only when the critical path is blocked. For an ordinary join omit progress: it
returns immediately on completion with a fixed 3600000 ms (one-hour) upper
bound. Set `wake_on_progress: true` only when one intermediate update per active
Agent job changes scheduling. Then do useful work, steer, or return to an
ordinary completion-first join; never repeat progress waiting for that job.

- A later call may acknowledge prior delivered `delivery_token` values
  independently; pass each consumed completion token exactly once when that
  later wait is made. A caller that ends after consuming the completion does
  not need an acknowledgement-only call. A newly returned completion stays
  unread for crash-safe redelivery.
- Completion has priority and includes the complete stored
  `completion_message`, legacy truncation flag, and token. Use it directly; do
  not follow up, read history, or request a file merely to recover that result.
- Opt-in progress returns at most one sanitized update per active Agent job.
  Hook activity stays private, and the update excludes Claude text, thinking,
  inputs, paths, sessions, and raw receipts.
- Timeout means no unread current-root completion was visible at this call's
  final observation, nothing more. Do not call `list_agents` or
  `read_agent_messages` immediately afterward merely to recheck completion.
  Do not narrate unchanged timeouts, use list as progress, or treat timeout
  as failure, cancellation, health, progress, or proof of future inactivity.
  If required work remains unresolved, call `wait_agent` again directly. Use
  `wake_on_progress` when intentional progress evidence is actually needed.
- Never finalize with an unresolved required or parallel-then-join result.
  Synthesize the complete message; quote it verbatim only when requested.
- A targeted barrier returns ordered `targets` entries. Settled unread turns
  include completion fields and token; acknowledged turns report
  `already_consumed` without a reconstructed message or token. Timeout is
  status-only with `unresolved_targets`; no partial payloads.
- A completion carries `blocking`: `null` for `completed`, and `null` for an
  `interrupted` status the parent itself requested and that proved a safe
  flush — that Agent stays resumable via `$cc-for-pein:followup-task` on its
  same session, not a failed lane. Otherwise `blocking` is a closed
  `{reason, scope, retry}`; branch on `retry` per the spawn Skill's join
  policy. A `completed` turn whose message asks a question is still
  `blocking: null` regardless of its wording: answer with
  `$cc-for-pein:followup-task` on that same Agent, never spawn a
  replacement or infer status from message text.

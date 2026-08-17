---
name: wait-agent
description: 'Experimental: join current-root completion or an Agent turn/barrier, or observe one bounded progress update; never interrupts an Agent.'
---

# Wait for Agent Completion

> **Experimental.** Wait cannot reactivate an ended Codex turn.

Call `mcp__codex_harnessdock__wait_agent` with optional `wake_on_progress`,
`acknowledge_tokens`, or `targets`. Omit targets for root-wide join. One to
eight unique exact current-root targets join fixed snapshotted turns; multiple
targets form one completion-only all-settled barrier.
Trusted Codex metadata owns cwd/root. If unavailable, report Plugin startup or discovery failure; never use a shell fallback.

Release drift: use the exact retained Skill path; latest-version instructions
are emergency-only; `HARNESSDOCK_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

An untargeted call observes current-root completion; a targeted call observes
only the fixed selected turn(s). Use a fixed 3600000 ms (one-hour) upper bound.
Set `wake_on_progress: true` only with exactly one target when an intermediate update
is useful; unrelated root activity remains
available to its proper consumer. Do not repeat progress waiting after its
update was consumed.

- Pass each consumed `delivery_token` once on a later wait; new completion
  stays unread for crash-safe redelivery.
- Completion has priority and carries the complete stored
  `completion_message`, truncation flag, token, and optional closed `metrics`.
  Provider `reported_cost_usd` is Harness-reported, not billed. Synthesize the
  message; quote it verbatim only when asked, and never follow up merely to
  recover a metric.
- Opt-in progress returns at most one sanitized update per active Agent job, and
  only for a route that observes turns. Hook activity stays private; the update
  excludes model text, thinking, inputs, paths, and sessions. A targeted claim
  is consumed even when that target's completion wins the observation.
- A timeout means no eligible completion was visible at this call's final
  observation -- untargeted, across the root; targeted, for its fixed turns
  only. Do not call `list_agents` or `read_agent_messages` immediately
  afterward merely to recheck completion. Do not narrate unchanged timeouts or
  treat timeout as failure, cancellation, or health. If work remains
  unresolved, call `wait_agent` again directly.
- A targeted barrier returns ordered `targets` entries: settled unread turns
  carry completion fields and token, acknowledged turns report
  `already_consumed` with neither, and timeout is status-only with
  `unresolved_targets`.
- `blocking` is `null` for `completed`, and `null` for a parent-requested
  `interrupted` that proved a safe flush; that Agent stays resumable via
  `$codex-harnessdock:followup-task`. Otherwise it is a closed
  `{reason, scope, retry}`; branch on `retry` per the spawn Skill. A `completed`
  turn asking a question is still `blocking: null`: answer with a follow-up,
  never infer status from message text.

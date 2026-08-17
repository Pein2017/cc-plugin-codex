---
name: wait-agent
description: 'Experimental: join current-root CC completion or an Agent turn/barrier, or intentionally observe one bounded progress update; never interrupts an Agent.'
---

# Wait for Agent Completion

> **Experimental.** Wait cannot reactivate an ended Codex turn.

Call `mcp__codex_harnessdock__wait_agent` with optional `wake_on_progress`,
`acknowledge_tokens`, or `targets`. Omit targets for root-wide join. One to
eight unique exact current-root targets join fixed snapshotted turns; multiple
targets form one completion-only all-settled barrier. Combine targets with
`wake_on_progress: true` only for exactly one target.
Trusted Codex metadata owns cwd/root. If unavailable, report Plugin startup or
discovery failure; never use shell.

Release drift: use the exact retained Skill path. Latest-version instructions
are emergency-only; `HARNESSDOCK_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

An untargeted call observes current-root completion; a targeted call observes
only the fixed selected turn(s). Use a fixed 3600000 ms (one-hour) upper bound
when waiting for completion. Set `wake_on_progress: true` only with exactly one
target when an intermediate update is useful; unrelated root activity remains
available to its proper consumer. Do not repeat progress waiting for the same
job after its update has been consumed.

- A later call may acknowledge prior delivered `delivery_token` values
  independently. Pass each consumed token once on a later wait if one is made;
  newly returned completion stays unread for crash-safe redelivery.
- Completion has priority and includes the complete stored
  `completion_message`, legacy truncation flag, token, and optional closed
  `metrics`. Provider `reported_cost_usd` is Claude-reported, not billed cost.
  Use it directly; do not follow up or read history merely to recover it.
- Opt-in progress returns at most one sanitized update per active Agent job.
  Hook activity stays private, and the update excludes Claude text, thinking,
  inputs, paths, sessions, and raw receipts. A targeted progress claim is still
  consumed when the same target's completion wins the final observation.
- An untargeted timeout means no unread current-root completion was visible at
  this call's final observation. A targeted timeout means only that its fixed
  selected turn produced no eligible completion/progress; unrelated root
  activity may still exist. Do not call `list_agents` or
  `read_agent_messages` immediately afterward merely to recheck completion.
  Do not narrate unchanged timeouts, use list as progress, or treat timeout
  as failure, cancellation, health, or progress. If work remains unresolved,
  call `wait_agent` again directly; use progress wake only intentionally.
- Synthesize the complete stored message when completion is returned; quote it
  verbatim only when requested.
- A targeted barrier returns ordered `targets` entries. Settled unread turns
  include completion fields and token; acknowledged turns report
  `already_consumed` without a reconstructed message or token. Timeout is
  status-only with `unresolved_targets`; no partial payloads.
- A completion carries `blocking`: `null` for `completed`, and `null` for an
  parent-requested `interrupted` status that proved a safe flush; that Agent
  stays resumable via `$codex-harnessdock:followup-task`. Otherwise `blocking` is a closed
  `{reason, scope, retry}`; branch on `retry` per the spawn Skill's blocking
  semantics. A `completed` turn asking a question is still `blocking: null`:
  answer with follow-up on that Agent, never infer status from message text.

Waiting observes only the durable parent. An experimental exact Opus/Fable Native
Agent Team lead has Claude-native same-team settle signals; no teammate wait,
roster, memory, effective model/effort, or cost surface is added here.

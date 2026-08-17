---
name: send-message
description: 'Experimental: durably deliver or queue a message for a named CC Agent without implicitly activating an idle Agent.'
---

# Send Agent Message

> **Experimental.** Queueing never activates an idle Claude Agent or Codex.

Call `mcp__codex_harnessdock__send_message` with exact current-root `target` and
`message`. Trusted Codex metadata owns cwd/root. If unavailable, report Plugin
startup or discovery failure; never use a shell fallback.

Release drift: use the exact retained Skill path. Latest-version instructions
are emergency-only; `HARNESSDOCK_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

A running Agent receives durable delivery. `queued_no_turn` requires
`$codex-harnessdock:followup-task`; a blocked Agent rejects instead of queueing,
naming only a closed `reason`/`scope`/`retry`, never raw internal evidence.
`retry: new_agent` means that blocked identity and name stay unusable: there
is no unblock, close, archive, or reuse; the lane needs a new Agent under a new name.
Present one concise sentence from `agent_name` and `delivery`: sent for
`dispatched_active`, durably accepted for `activation_pending`, or queued and
idle for `queued_no_turn`. Do not repeat the message or JSON unless debug was
explicitly requested.

`activation_pending` means an activation already owns the message; join or
observe that Agent rather than submitting a duplicate follow-up. `queued_no_turn`
means the message is still idle and requires `$codex-harnessdock:followup-task` when
the work must run.

This targets only a durable parent CC Agent. It cannot address experimental
Native Agent Team teammates: same-team `SendMessage` is Claude-local, current-
team-only coordination and has no Plugin mailbox or cross-session bridge.

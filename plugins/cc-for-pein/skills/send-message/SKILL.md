---
name: send-message
description: 'Experimental: durably deliver or queue a message for a named CC Agent without implicitly activating an idle Agent.'
---

# Send Agent Message

> **Experimental.** Queueing never activates an idle Claude Agent or Codex.

Call `mcp__cc_for_pein__send_message` with exact current-root `target` and
`message`. Trusted Codex metadata owns cwd/root. If unavailable, report Plugin
startup or discovery failure; never use a shell fallback.

A running Agent receives durable delivery. `queued_no_turn` requires
`$cc-for-pein:followup-task`; a blocked Agent rejects instead of queueing,
naming only a closed `reason`/`scope`/`retry`, never raw internal evidence.
`retry: new_agent` means that blocked identity and name stay unusable: there
is no unblock, close, archive, or reuse; re-delegate under a new Agent.
Present one concise sentence from `agent_name` and `delivery`: sent for
`dispatched_active`, durably accepted for `activation_pending`, or queued and
idle for `queued_no_turn`. Do not repeat the message or JSON unless debug was
explicitly requested.

`activation_pending` means an activation already owns the message; join or
observe that Agent rather than submitting a duplicate follow-up. `queued_no_turn`
means the message is still idle and requires `$cc-for-pein:followup-task` when
the work must run.

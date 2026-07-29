---
name: send-message
description: 'Experimental: durably deliver or queue a message for a named CC Agent without implicitly activating an idle Agent.'
---

# Send Agent Message

> **Experimental.** Queueing a message does not activate an idle Claude Agent
> or reactivate an idle Codex parent.

Invoke `mcp__cc_for_pein__send_message` with typed `target` and `message`
fields.

Before invoking, confirm the active Codex turn workspace is the checkout or
worktree that owns the Agent. Trusted Codex metadata supplies the workspace and
root identity; never add cwd, environment, owner-root, or Claude-session
selectors. If the typed MCP tool is unavailable, report the Plugin
discovery/startup failure instead of silently running a shell fallback.

- `target` must be an exact Agent ID, exact `/root/<task_name>` path, or exact
  normalized name in the current logical Codex root; prefixes do not mutate.
- A running Agent receives durable active-turn delivery. An idle resumable
  Agent returns `queued_no_turn`; use `$cc-for-pein:followup-task` to activate
  it.
- A blocked Agent rejects the message with its continuation evidence rather
  than queueing work that cannot run.
- A successful receipt contains only `agent_name` and `delivery`. Present it as
  one concise disposition-aware sentence; never print
  raw JSON or repeat the sent message unless the user explicitly requests
  debug detail.
- For `dispatched_active`, confirm that the message was sent. For
  `activation_pending`, confirm that it was durably accepted by the pending
  activation. For `queued_no_turn`, say that it was queued and that
  `$cc-for-pein:followup-task` is required to activate the idle Agent.

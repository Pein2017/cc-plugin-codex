---
name: followup-task
description: 'Experimental: deliver work to a running CC Agent or activate its proven continuation path.'
---

# Follow Up Agent

> **Experimental.** May activate Claude; cannot reactivate an idle Codex parent.

Call `mcp__codex_harnessdock__followup_task` with exact current-root `target` and
`message`; optional: `reasoning_effort`, `write`. Trusted Codex metadata owns cwd/root.
If unavailable, report Plugin startup or discovery failure; never use shell fallback.

Release drift: use the exact retained Skill path. Latest-version instructions
are emergency-only; `HARNESSDOCK_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

- Omitted `write` inherits latest behavioral authority. Pass `false` for
  read/review and `true` only for authorized mutation. Both remain full-access terminal parity;
  false is prompt-enforced.
- Model and delegation mode are immutable. An idle Agent resumes its exact
  session or a receipt-proven safe-fresh path; a running Agent receives one
  durable message. Never substitute a Terminal Claude session.
- An experimental exact Opus/Fable `claude_orchestrator` follow-up never
  resumes in-process teammates: it starts a fresh Native Agent Team under the
  durable parent. Native teammate model/effort/cost remains unknown without
  authoritative facts; `write` stays behavioral authority.
- `activation_pending` is durably assigned to a starting activation. Use
  `$codex-harnessdock:wait-agent`; do not resend. `queued_no_turn` remains idle until
  a follow-up activates it.
- A blocked Agent rejects with a closed `reason`/`scope`/`retry` instead of
  raw internal evidence; `retry: new_agent` means that identity and name stay
  unusable and the lane needs a new Agent.
- After OAuth refresh, only a first, zero-side-effect `auth_required` turn may
  safe-fresh recover; its original task is requeued once. Other cases and
  `send_message` remain blocked.
- On success, report one concise sentence from `agent_name` and `delivery`;
  show raw JSON only when the user explicitly requests debug detail.

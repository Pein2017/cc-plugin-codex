---
name: followup-task
description: 'Experimental: deliver work to a running CC Agent or activate its proven continuation path.'
---

# Follow Up Agent

> **Experimental.** This may activate Claude, but cannot reactivate an idle
> Codex parent after completion.

Call `mcp__cc_for_pein__followup_task` with exact current-root `target` and
`message`; optional fields are `reasoning_effort` and `write`. Trusted Codex
metadata owns cwd/root. If the tool is unavailable, report Plugin startup or
discovery failure; never use a shell fallback.

- Omitted `write` inherits the latest behavioral authority. Pass `false` when
  changing to read/review-only and `true` only for authorized mutation. Both
  remain full-access terminal parity; false is prompt-enforced.
- Model and delegation mode are immutable. An idle Agent resumes its exact
  session or a receipt-proven safe-fresh path; a running Agent receives one
  durable message. Never substitute a Terminal Claude session.
- On success, report one concise sentence from `agent_name` and `delivery`;
  show raw JSON only when the user explicitly requests debug detail.

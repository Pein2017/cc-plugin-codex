---
name: interrupt-agent
description: 'Experimental: stop a CC Agent current turn while preserving its durable identity and proven continuation.'
---

# Interrupt Agent

> **Experimental.** Interrupt ends only the current turn; it never deletes the
> durable Agent or reactivates an idle Codex parent.

Call `mcp__codex_harnessdock__interrupt_agent` with exact current-root `target`.
Trusted Codex metadata owns cwd/root. If unavailable, report Plugin startup or
discovery failure; never use a shell fallback.

Release drift: use the exact retained Skill path. Latest-version instructions
are emergency-only; `HARNESSDOCK_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

The graceful interrupt request may be accepted, rejected, or left pending by
the native process; the receipt's `status` is `interrupted`, `still_working`,
or `failed`. This tool never force-kills Claude, so `still_working` is never
a forced termination -- the turn is simply still running. Exact-session
continuation is offered only when native evidence proves a safe flush; a
historical forced/unflushed classification, where it appears internally, is
a non-public legacy record, never a public receipt status.

Report one concise sentence from `agent_name` and `status`; raw JSON is
debug-only.

For an experimental exact Opus/Fable Native Agent Team lead, interrupt never
preserves or resumes in-process teammates; any later explicit follow-up forms a
fresh team under the durable parent.

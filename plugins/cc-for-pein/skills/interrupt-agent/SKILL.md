---
name: interrupt-agent
description: 'Experimental: stop a CC Agent current turn while preserving its durable identity and proven continuation.'
---

# Interrupt Agent

> **Experimental.** Interrupt ends only the current turn; it never deletes the
> durable Agent or reactivates an idle Codex parent.

Call `mcp__cc_for_pein__interrupt_agent` with exact current-root `target`.
Trusted Codex metadata owns cwd/root. If unavailable, report Plugin startup or
discovery failure; never use a shell fallback.

Release drift: use the exact retained Skill path. Latest-version instructions
are emergency-only; `CC_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

A graceful Claude flush preserves exact-session continuation. Forced unflushed
termination becomes failed and non-resumable. Report one concise sentence from
`agent_name` and `status`; raw JSON is debug-only.

For an experimental exact Opus/Fable Native Agent Team lead, interrupt never
preserves or resumes in-process teammates; any later explicit follow-up forms a
fresh team under the durable parent.

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

A graceful Claude flush preserves exact-session continuation. Forced unflushed
termination becomes failed and non-resumable. Report one concise sentence from
`agent_name` and `status`; raw JSON is debug-only.

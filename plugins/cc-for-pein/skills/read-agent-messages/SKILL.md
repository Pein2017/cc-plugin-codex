---
name: read-agent-messages
description: 'Experimental: read recent outer-assistant text messages from the native Claude history bound to a current-root CC Agent, without activating it.'
---

# Read Agent Messages

> **Experimental.** Retrospective native history cannot reactivate Codex or
> extend Claude retention.

Call `mcp__cc_for_pein__read_agent_messages` with exact current-root `target`
and optional `before`/`limit`. Trusted Codex metadata owns cwd/root; never infer
a transcript path or session ID. If unavailable, report Plugin startup or
discovery failure; never use shell.

- Default returns the latest outer-assistant text, newest first. Paginate older
  messages only with returned `next_before`.
- Text is complete within cc-for-pein; host transport may impose external
  capacity. Thinking, tools, attachments, child transcripts, and Codex history
  are excluded, and this operation never activates or changes the Agent.
- Current completion comes directly from `$cc-for-pein:wait-agent`'s complete
  `completion_message`; use history only for earlier output or recovery.
- Report missing retained history honestly. Present message text plus minimal
  context, not raw JSON, unless debug was explicitly requested.

For an experimental exact Opus/Fable Native Agent Team lead, this never reads
teammate transcripts or local memory; only the durable parent history is in
scope. Missing native-team evidence remains unverified.

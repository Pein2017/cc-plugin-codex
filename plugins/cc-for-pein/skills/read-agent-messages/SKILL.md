---
name: read-agent-messages
description: 'Experimental: read recent outer-assistant text messages from the native Claude history bound to a current-root CC Agent, without activating it.'
---

# Read Agent Messages

> **Experimental.** This is retrospective native-history access. It cannot
> reactivate an idle Codex parent, extend Claude's retention period, or recover
> a transcript that Claude already removed.

Invoke `mcp__cc_for_pein__read_agent_messages` with typed `target` and optional
`before` and `limit` fields.

Before invoking, confirm the active Codex turn workspace is the checkout or
worktree that owns the Agent. Trusted Codex metadata supplies the workspace and
root identity; never add cwd, environment, owner-root, transcript-path, or
Claude-session selectors. If the typed MCP tool is unavailable, report the
Plugin discovery/startup failure instead of silently running a shell fallback.

- Use an exact current-root Agent ID, `/root/<task_name>` path, or normalized
  name. Never supply or infer a transcript path, Claude session ID, owner/root
  override, or cross-root selector.
- With no pagination arguments, read the latest eligible outer Claude
  assistant text message. Results are newest first. Use `next_before` as the
  next `before` value only when older messages are genuinely needed.
- Message text is complete and is not truncated by cc-for-pein. The surrounding
  Codex/tool/UI transport may still impose its own external capacity.
- The operation excludes thinking, tool calls/results, attachments, internal
  Claude subagent transcripts, and Codex session history. It never starts,
  resumes, steers, interrupts, or changes the Agent.
- Normal current completion does not require this skill. When
  `$cc-for-pein:wait-agent` returns a completion, synthesize its complete
  `completion_message` directly. Use history only for an earlier message or an
  explicit recovery investigation.
- Missing history is expected after Claude's configured retention window;
  report it honestly rather than activating the Agent or searching unrelated
  local sessions.
- Present only the message text and minimal useful timestamp/Agent context. Do
  not dump raw JSON unless the user explicitly requests debugging detail.

## Context

CC for Pein currently receives Claude's complete streamed final message, truncates it to 64 KiB when normalizing a durable completion event, and truncates it again to 4096 bytes when projecting `wait_agent`. Claude Code independently persists the full session as plaintext JSONL under `${CLAUDE_CONFIG_DIR}/projects/<encoded-cwd>/<session-id>.jsonl`; the current runtime does not disable that persistence. The Agent registry already binds a canonical Claude config directory and session ID to exactly one owner root and Agent.

The user accepts Claude Code's configured native retention window (currently the default 30 days). The Plugin therefore needs durable current-result delivery plus on-demand recent history, not a second complete transcript database.

## Goals / Non-Goals

**Goals:**

- Preserve and return every byte of each new Claude final message without a Plugin-defined content limit.
- Keep completion delivery ordered, immutable after first exposure, at-least-once, and independently acknowledgeable.
- Add one model-facing operation that reads recent outer-assistant text messages through an exact current-root Agent binding.
- Keep native transcript parsing, path validation, and schema tolerance behind `runtime/index.mjs`.
- Preserve honest provenance for legacy completion events that an older runtime already truncated.

**Non-Goals:**

- Guarantee unlimited Codex context, shell output, UI rendering, or third-party transport capacity.
- Copy Claude thinking, tool inputs/results, attachments, internal subagent transcripts, or the complete native session into Plugin state.
- Extend Claude's `cleanupPeriodDays`, recover expired/deleted transcripts, adopt terminal sessions, or read another Codex root's Agent.
- Provide arbitrary transcript paths, raw Claude session IDs, search across all local Claude sessions, or Codex-session history access.

## Decisions

### 1. Current completion remains push-like and complete

`wait_agent` continues to return the oldest unread completion and delivery token, but its `completion_message` is the complete final message stored in the event. New event normalization stores `String(finalMessage ?? summary)` unchanged and records `truncated=false`. The existing truncation field remains so an old already-truncated event can still report irreversible historical loss.

This avoids a mandatory second read for the common join path and more closely matches Codex Multi-Agent V2, where completion communication carries the completed Agent's last message.

Alternative considered: keep the 4096-byte preview and require history lookup for every result. Rejected because it adds latency and a second failure point to every required join.

### 2. Native Claude JSONL is the retrospective history authority

Add `read_agent_messages({ target, before?, limit? })`. It resolves `target` through the existing current-root Agent registry, obtains only that Agent's persisted `claudeConfigDir`, `claudeSessionId`, and `workspaceRoot`, and locates the top-level native transcript. It never accepts a caller-supplied path or session ID.

The default returns the latest one outer-assistant text record. `limit` is a message-count bound (default 1, maximum 20), not a text-size bound. `before` is an opaque returned message ID for newest-first pagination. Each returned message contains its ID, timestamp, and complete ordered text blocks; a page reports `next_before` only when older eligible messages exist.

Alternative considered: duplicate every Claude record into Plugin persistence. Rejected because Claude already owns the transcript, its schema contains sensitive tool data, and the user accepts native retention.

### 3. History parsing is deliberately narrow

The reader accepts only top-level JSONL records whose session ID matches the bound session, whose record and message roles are `assistant`, whose `isSidechain` is not true, and whose content contains one or more `text` blocks (or legacy string content). It omits thinking and non-text blocks even when they share the same assistant record. Files under `subagents/`, `tool-results/`, and other nested directories are never candidates.

The expected path derived from `workspaceRoot` is tried first. A compatibility fallback scans only immediate project directories for the exact `<session-id>.jsonl` filename and succeeds only for one canonical regular file beneath `${CLAUDE_CONFIG_DIR}/projects`. Every returned record is revalidated against the bound session ID.

### 4. Missing history fails explicitly without damaging Agent lifecycle

An Agent without a proven session binding, an expired/missing transcript, an ambiguous candidate, an invalid cursor, or malformed authoritative history returns a specific read error. It does not mutate the Agent, start/resume Claude, change completion acknowledgement, or silently read Plugin job logs as substitute history.

### 5. Public naming remains explicit about the extension

The runtime operation is `read_agent_messages`; the namespaced Plugin skill is `cc-for-pein:read-agent-messages`. This is a CC durable-history extension, not a claim that Codex Multi-Agent V2 currently exposes the same seventh built-in tool.

## Risks / Trade-offs

- [Large complete messages can consume substantial Codex context or hit an external output cap] → Remove Plugin data loss, document the external boundary honestly, and keep Agent prompts oriented toward concise final synthesis.
- [Claude may evolve its undocumented JSONL record details] → Isolate parsing in one adapter, accept only a minimal role/content subset, test realistic fixtures, and fail closed rather than returning tool/thinking data.
- [Native transcripts expire after `cleanupPeriodDays`] → Return explicit history-unavailable status; current completion remains durably delivered through the Plugin. The accepted 30-day window is a product decision, not hidden persistence.
- [Plaintext history can contain sensitive material] → Enforce root/session binding and expose assistant text only; never accept arbitrary paths or surface raw transcript metadata.
- [Removing completion bounds increases Plugin state size] → Preserve existing acknowledgement compaction and job pruning; no complete transcript duplication is added.

## Migration Plan

1. New completions become complete and `truncated=false` without changing completion event version or invalidating existing inboxes.
2. Existing events retain their stored content and truncation flag; discarded legacy bytes remain unrecoverable through the event but may still exist in native Claude history.
3. Add the seventh runtime operation, CLI command, Plugin skill, discovery metadata, tests, and documentation.
4. Refresh the local marketplace snapshot and require a new Codex task to discover the new skill; checkout-owned runtime edits remain hot.

Rollback removes the history operation and restores bounded projection code. Completion inboxes written with larger strings remain valid version-1 JSON and can still be read by the prior validator, although an older runtime would truncate only when reconciling a mutable unfrozen event.

## Open Questions

None. The user accepts the native 30-day retention window and selected complete current delivery plus on-demand native history.

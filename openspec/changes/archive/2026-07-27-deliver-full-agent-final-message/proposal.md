## Why

The runtime currently truncates an Agent's Claude final message twice: first to 64 KiB in the durable completion event and again to 4096 bytes in the model-facing `wait_agent` handoff. That can discard the Agent's own final synthesis before Codex reads it, defeating the intended contract that Claude may coordinate internal subagents and return one authoritative last message.

## What Changes

- Persist each new Agent completion with the complete Claude final message, without a Plugin-defined byte limit.
- Return that complete stored final message through `wait_agent` without a second Plugin-defined handoff limit.
- Add a root-scoped `read_agent_messages` lifecycle operation and Plugin skill that reads outer-assistant text messages from the Agent's bound native Claude transcript for on-demand history lookup.
- Preserve two-phase acknowledgement, immutable first delivery, ordered redelivery, root isolation, and completion priority.
- Retain the truncation provenance of already-stored legacy events because bytes discarded by an older runtime cannot be reconstructed; new events are never marked truncated by this Plugin.
- Resolve history only through the durable Agent-to-session binding; reject arbitrary transcript paths, caller-supplied Claude session IDs, subagent transcripts, foreign roots, and missing/expired native history.
- Treat Claude's native JSONL as the history authority and accept its configured retention window; do not duplicate thinking, tool payloads, or complete transcripts into Plugin state.
- Update Plugin guidance so the Codex parent consumes the complete current completion message directly and uses history lookup only for retrospective access.
- Non-goal: this change does not claim that Codex, the shell/tool transport, the UI, or another external host has unlimited message capacity.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-delivery`: replace Plugin-bounded durable and public final-message delivery with complete delivery for new completion events while preserving legacy truncation provenance.
- `canonical-agent-orchestration`: make the complete Agent final message the canonical `wait_agent` completion payload and add root-scoped native-history lookup.

## Impact

- Runtime: `runtime/completion-inbox.mjs` persistence normalization and public completion projection.
- Runtime: a narrow native Claude transcript reader behind `runtime/index.mjs`, using the Agent registry's existing owner/session binding.
- Public lifecycle: `wait_agent` completion payload semantics plus `read_agent_messages`; the existing `completion_message_truncated` field remains meaningful only for legacy events that were already truncated.
- Tests: completion projection, persistence/redelivery, native transcript parsing/isolation, CLI integration, and Plugin-contract assertions.
- Documentation and Plugin skill guidance: `README.md`, `plugins/cc-for-pein/skills/wait-agent/SKILL.md`, and a new `read-agent-messages` skill.
- Storage/context: completion inbox records and wait results may be larger because the Plugin no longer discards final-message bytes.

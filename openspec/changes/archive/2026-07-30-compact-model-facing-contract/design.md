## Context

The runtime already keeps durable Agent, job, mailbox, recovery, and Claude-session evidence behind `runtime/index.mjs`, but three successful lifecycle operations still return nested operational receipts. Codex consumes the `structuredContent` copy, so removing the duplicate text representation would not materially reduce model input; the useful seam is the runtime's public projection itself. The seven Skill files also repeat host-context and presentation guidance, increasing context whenever Codex loads them.

## Goals / Non-Goals

**Goals:**

- Return only lead-relevant fields from successful spawn, follow-up, and interrupt calls.
- Keep actionable failure and recovery evidence unchanged.
- Keep every Skill self-contained while reducing their aggregate word count to at most 1,800 words.
- Shorten always-visible MCP descriptions and every-turn Claude delegation text without weakening semantics.
- Preserve checkout ownership, root isolation, asynchronous handoff, exact-session recovery, and complete wait delivery.

**Non-Goals:**

- No eighth tool, delegate wrapper, implicit wait, targeted wait, or Agent-residency change.
- No truncation or summarization of Claude's stored final message or native history.
- No change to MCP `content` plus `structuredContent` compatibility output.
- No durable schema migration and no change to operator diagnostics.

## Decisions

### 1. Project minimal receipts at the public runtime boundary

`spawn_agent` will return `{agent_name, model, status}`. `followup_task` will return `{agent_name, delivery}`. `interrupt_agent` will return `{agent_name, status}`, where status is the operation outcome `no_active_turn`, `interrupted`, `failed`, or `still_working`. Internal jobs, message assignments, steering sequences, reconciliation, and Agent records remain unchanged and available only to their existing owners.

This is preferable to filtering in the MCP adapter because `runtime/index.mjs` is the sole public lifecycle interface and all public callers should observe one contract. It is also preferable to compressing durable records because recovery evidence must remain complete.

### 2. Preserve errors and completion payloads

Only successful acknowledgement projections shrink. Validation, compatibility, continuation, recovery, and account-limit errors remain actionable. `wait_agent` retains its complete `completion_message`, delivery token, sparse progress, and acknowledgement semantics; `read_agent_messages` remains explicitly paginated and complete.

### 3. Keep concise Skills self-contained

Each Skill will retain the operation trigger, typed inputs, non-obvious lifecycle behavior, authority boundary, and concise presentation rule. Repeated prose about trusted workspace metadata and shell fallback will be reduced to one sentence per Skill rather than moved into another file, because an extra reference read would replace one form of friction with another. A focused test will cap the aggregate seven-Skill word count at 1,800.

### 4. Shorten descriptions and prompts without semantic change

MCP descriptions remain sufficient for tool selection. The Claude appended prompt will keep Codex ownership, task/authority bounds, self-contained final output, blocking-question escape, write/read behavior, leaf denial, Fable one-generation delegation, child joining, and `Workflow` denial in fewer words.

### 5. Treat result-shape changes as a discovered API break

The MCP generation increments and the package minor version becomes 0.11.0. A running old MCP process fails closed with `CC_MCP_RESTART_REQUIRED`; local release refresh plus a new Codex task activates the schema. No durable data migration is required.

## Risks / Trade-offs

- [Risk] Compact acknowledgements omit job IDs useful during debugging. → Keep them in operator diagnostics and internal receipts, never ordinary model output.
- [Risk] Over-compressed Skill text could weaken orchestration. → Retain explicit tests for model routing, write intent, joins, account limits, delegation depth, and failure handling, plus the aggregate size gate.
- [Risk] Existing Codex tasks cache old result expectations. → Bump the MCP generation and require restart rather than emulate both contracts.
- [Risk] Interrupt outcome loses detailed control evidence. → Preserve that evidence internally and expose actionable errors; the four public outcomes are sufficient for lead scheduling.

## Migration Plan

1. Update projections, tests, Skills, prompts, docs, API generation, and version metadata.
2. Run focused tests, `npm run check`, strict OpenSpec validation, release smoke, and doctor.
3. Refresh the checkout-owned local Plugin and verify the installed snapshot.
4. Start a new Codex task after installation. Rollback uses the prior Git revision and local release; durable Agent and Claude history remain compatible.

## Open Questions

None. The user approved all scope and explicitly excluded broader orchestration redesign.

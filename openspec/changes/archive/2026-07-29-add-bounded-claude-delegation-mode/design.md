## Context

CC for Pein currently models a durable Claude Agent but leaves native Claude subagent depth implicit. Public callers also repeat `fork_turns=none` and choose an execution profile even though the Plugin has one intended Codex-facing path. The change crosses the typed MCP schema, Agent registry, job preparation/recovery, execution-profile argument policy, Claude CLI compatibility, and seven-skill guidance.

The Codex lead remains the only owner of decomposition, user-facing synthesis, and final acceptance. A CC Agent is a bounded delegated lane. Claude Code remains the owner of native Fable child sessions and their artifacts; the Plugin must not mirror that child graph.

## Goals / Non-Goals

**Goals:**

- Make every new and legacy CC Agent a leaf unless Fable orchestration is explicitly requested.
- Enforce leaf depth with both instruction and tool denial, not prompt convention alone.
- Keep Fable orchestration explicit, one generation, opaque to the CC registry, and self-synthesizing.
- Reduce public activation inputs to durable task intent, exact model, and explicit write authority.
- Preserve existing durability, recovery, root isolation, completion delivery, and seven-operation topology.
- Expose a small stable lifecycle vocabulary without renaming persisted internal states.

**Non-Goals:**

- No `delegate` convenience tool, automatic spawn-and-wait wrapper, or implicit join.
- No Plugin scheduler, concurrency manager, child registry, native child targeting, or child receipts.
- No `needs-input` state, close/archive/delete lifecycle, or cross-Codex/CC control plane.
- No model fallback, automatic model/effort selection, or prompt replacement.
- No change to Claude's native configuration, hooks, memories, skills, plugins, or MCP ownership.

## Decisions

### 1. Public activation fixes runtime-only choices

Public `spawn_agent` requires exactly four semantic decisions: `task_name`, `message`, `model`, and `write`. It may additionally accept `reasoning_effort`, `description`, `allowed_tools`, and `delegation_mode`. `fork_turns` is removed because Claude does not inherit Codex turns and the runtime always behaves as `none`. `execution_profile` is removed because model-facing activation always uses terminal parity; safe mode remains an explicit operator/debug internal only.

`followup_task` continues to accept turn-level effort, write, and allowed-tool changes where already supported, but never accepts a delegation-mode override. This keeps identity policy separate from per-turn authority.

Alternative considered: retain deprecated fields as aliases. Rejected because the user explicitly prefers one canonical API and compatibility shims would preserve the current lead-side cognitive load.

### 2. Delegation mode is immutable Agent identity metadata

The registry persists `delegationMode` as `leaf` or `claude_orchestrator`. Spawn validates the model/mode/tool combination before readiness, Agent reservation, mailbox mutation, or job preparation. `claude_orchestrator` is valid only with exact model `claude-fable-5`. Follow-up and recovery derive the mode from the Agent and persist it in each prepared job request as evidence.

Legacy Agent records without the field normalize to `leaf` during validation/projection and persist that value on the next safe registry write. Internal durable lifecycle values remain unchanged.

Alternative considered: infer orchestration from model. Rejected because Fable must still default to leaf and delegation must be a deliberate lead decision.

### 3. Execution profile owns the appended delegation envelope

`runtime/execution-profile.mjs` remains the sole policy owner. It constructs one appended instruction for every turn:

- common: the CC Agent is delegated by a Codex lead, stays within the supplied task/workspace/authority, and returns one self-contained result for lead synthesis and acceptance;
- leaf: it must not delegate or invoke the native `Agent` tool;
- Fable orchestrator: it may use only one native child generation, must join its children, and must synthesize their work into its own final response.

The adapter only serializes the resolved policy as `--append-system-prompt`; it never uses `--system-prompt`, which would replace Claude's native defaults.

Alternative considered: teach the Codex skill to embed this text in each user message. Rejected because callers could omit or distort it, follow-up/recovery would drift, and the runtime owns the invariant.

### 4. Leaf mode has a hard native-tool boundary

Every leaf turn emits `--disallowedTools Agent` after profile/tool composition. An explicit leaf `allowed_tools` entry equal to `Agent` or an `Agent(...)` permission pattern fails before readiness or state mutation rather than creating contradictory CLI arguments. Fable orchestrator omits the hard deny.

Prompt guidance remains defense in depth and explains role semantics; tool denial is the intended enforceable boundary. Acceptance must include one real write-leaf witness because `--dangerously-skip-permissions` and `--disallowedTools` precedence is a host semantic that static help cannot prove. One-generation Fable use is required by the parent envelope and additionally relies on Claude Code's current native subagent depth constraint; the Plugin does not claim to independently enforce child internals.

Alternative considered: prompt-only leaf behavior. Rejected because it is advisory and does not provide a reliable maximum-depth contract.

### 5. Native Fable children remain opaque

The CC registry records only the durable Fable Agent. Child selection, sessions, messages, progress, and resource lifecycle remain entirely inside Claude Code. The Fable parent must wait for/join its native children and return one final synthesis; Codex consumes that parent completion through the existing wait/read history paths.

Alternative considered: mirror native children into CC Agents. Rejected because it creates a second topology owner and expands recovery, targeting, and resource semantics far beyond this need.

### 6. Public status is a projection

Persisted `pending_init`, `running`, `completed`, `errored`, and `interrupted` remain reconciliation facts. Model-facing Agent projections map them to the string values `starting`, `working`, `completed`, `failed`, and `interrupted`. `list_agents` also exposes the immutable `delegation_mode` so a lead can recover that identity decision without receiving registry internals. Detailed job/mailbox/continuation evidence stays available only in bounded debug/operator receipts. This avoids a risky storage migration.

### 7. Compatibility admission covers emitted flags

The required-surface revision adds `--append-system-prompt` and `--disallowedTools`. Readiness and doctor remain zero-model checks and reject an independently updated Claude CLI before any new activation if either flag is absent.

## Risks / Trade-offs

- **Existing Agents previously used native subagents implicitly** -> legacy records become leaf on their next activation; this is the deliberate depth-one migration and is documented as breaking.
- **Caller allowlist contradicts leaf denial** -> reject `Agent` and `Agent(...)` patterns synchronously; always emit the hard deny independently of other allowed tools.
- **Dangerous permission bypass may supersede tool denial in a future Claude release** -> require a real Haiku write-leaf denial witness for acceptance; if it fails, do not claim or ship a hard leaf boundary.
- **Native child depth is a host semantic** -> keep one-generation intent in the appended envelope and treat Claude's nested-subagent restriction as a compatibility dependency, not Plugin-owned state.
- **Fable child activity is not visible in CC progress** -> expose only the Fable parent's safe progress/final synthesis; defer child observability rather than duplicating Claude state.
- **Claude changes flag names or behavior** -> gate every fresh executable fingerprint through the existing zero-model compatibility check.
- **Public status simplification hides recovery detail** -> retain exact internal state and bounded operator/debug evidence; only the ordinary model-facing projection is simplified.
- **Dirty checkout contains earlier release-readiness work** -> preserve it, keep new edits scoped, and validate the combined tree with `npm run check` before installation.

## Migration Plan

1. Add delta contracts and red tests for schema, pre-state validation, CLI arguments, legacy-mode normalization, follow-up inheritance, and status projection.
2. Add registry/job mode persistence and validation without renaming internal states.
3. Add execution-profile prompt/tool policy, adapter serialization, and compatibility requirements.
4. Remove the two public fields from MCP/operator lifecycle schemas and update all seven Plugin skill instructions and metadata.
5. Run focused tests, `npm run check`, strict OpenSpec validation, then refresh the local Plugin snapshot and verify it from a new Codex task.

Rollback is a source rollback plus Plugin refresh. The additive registry field is safe to retain; older records without it remain interpretable as leaf by the new runtime.

## Open Questions

None. The user has explicitly selected the leaf default, Fable-only explicit orchestration, opaque native children, hard Agent denial, minimal public schema, and existing explicit-join lifecycle.

## Context

The runtime currently owns a three-model alias map and rejects Fable before creating durable Agent state. The installed Claude Code 2.1.220 help identifies `fable` as a current alias and `claude-fable-5` as its full model ID, and exposes the common `low`, `medium`, `high`, `xhigh`, and `max` effort set. The Plugin must remain explicit and fail-fast: a model choice crosses the runtime boundary only after exact normalization, and no account or availability error may trigger fallback.

This is a public policy expansion, not a lifecycle or persistence redesign. Existing Agent identities and exact-session ownership remain unchanged. A newly supported Fable Agent persists `claude-fable-5` in the same `selectedModel` field already used by the other models.

## Goals / Non-Goals

**Goals:**

- Make Haiku 4.5, Sonnet 5, Opus 5, and Fable 5 first-class supported selections.
- Accept the five Claude effort values uniformly for all four models.
- Give the parent concise relative capability/spend guidance before every spawn.
- Preserve low-cost Haiku/low real-smoke policy and make Fable a planning/decision recommendation rather than a coding default.
- Keep model rejection synchronous and fallback-free.

**Non-Goals:**

- Encode exact prices or claim that the relative ladder is an Anthropic billing guarantee.
- Infer a model from task text, silently select a default, or enforce task semantics inside the runtime.
- Prohibit an explicitly requested Fable coding task at runtime; the skill provides the policy guidance because only the parent understands task intent.
- Run Fable merely to prove the string mapping when the installed CLI already exposes the full ID.

## Decisions

### Keep one exact runtime allowlist

Extend the existing alias map with `fable -> claude-fable-5` and its exact canonical self-map. Continue rejecting partial, dated, older, or otherwise available model IDs. This keeps validation, persisted `selectedModel`, continuation, and native-history reconciliation on one canonical value.

Alternative considered: pass arbitrary Claude model strings through. Rejected because it would reintroduce silent model drift and make durable continuation dependent on an open-ended host catalog.

### Keep effort independent and uniform

Retain the global five-value effort validator and test every supported model against all five values. `terminal-parity` still forwards only an explicitly supplied effort. The private `safe` profile may retain model-specific defaults when effort is omitted, with Fable defaulting to `max`; this does not create a public implicit effort.

Alternative considered: restrict effort by model. Rejected because Claude Code exposes one common effort surface and Pein explicitly requested the full matrix.

### Put capability and spend guidance in the spawn skill

Before invocation, the parent selects from the relative ladder `Haiku < Sonnet < Opus < Fable` and reports the selected model's role and relative tier. After success it presents one concise sentence containing the selected model, role/tier, stable Agent path, and status. The runtime receipt remains compact and machine-oriented rather than duplicating mutable prose policy.

The model roles are:

- Haiku 4.5: lowest relative capability/spend; fast tests and small mechanical work.
- Sonnet 5: balanced general coding default.
- Opus 5: deep analysis, complex/high-risk implementation, and review.
- Fable 5: highest relative capability/spend; core decision discussion and planning, generally not routine code writing.

Alternative considered: add role and cost fields to every runtime receipt. Rejected because the runtime only needs canonical identity and the guidance is orchestration policy, not durable Agent state.

### Preserve process and recovery boundaries

No worker, mailbox, completion, residency, or session-lease behavior changes. The Claude subprocess continues to own native model availability and account authorization after pre-launch normalization. A rejected model or effort causes no Agent reservation; a host-side availability or account-limit failure remains terminal and never changes the requested model.

## Risks / Trade-offs

- [The relative ladder is user policy, not exact pricing] -> Label it as approximate relative capability/spend and do not publish dollar values.
- [A future Claude Code release may rename Fable] -> Pin the locally verified canonical ID and fail visibly until a later OpenSpec updates it.
- [Fable guidance cannot prevent misuse] -> Keep the recommendation explicit in the skill; do not guess task intent or block a user-explicit selection in the runtime.
- [A full model/effort live matrix would be expensive] -> Cover the matrix with fake-Claude integration tests and use Haiku/low for the one real boundary smoke.

## Migration Plan

1. Expand normalization, error messages, safe-profile default, and reconciliation coverage.
2. Update tests, spawn skill metadata, README, and changelog.
3. Run focused tests, the full local suite, and one Haiku/low real smoke unless account-limit exhaustion is reported.
4. Sync and archive the OpenSpec change, cache-bust the local Plugin, and reinstall from `pein-local`.

Rollback is a source revert plus local Plugin reinstall. Existing Fable Agents would then remain on disk but become explicitly continuation-blocked rather than silently remapped.

## Open Questions

None. Pein confirmed that all four models and all five effort levels are fully supported.

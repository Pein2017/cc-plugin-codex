## Context

The runtime currently accepts only `claude-sonnet-5` and `claude-opus-5`. That protects model identity but makes every real smoke consume a general-purpose model. A tool-free live probe against Claude Code 2.1.220 established that alias `haiku` resolves to `claude-haiku-4-5-20251001` and reports canonical model `claude-haiku-4-5`. The probe hit only its caller-imposed budget ceiling, not the user's subscription limit.

Model selection crosses the public skill, runtime validation, Claude invocation, persisted Agent identity, session-artifact recovery, and supervisor retry policy. The new model must remain explicit and must not weaken no-fallback behavior.

## Goals / Non-Goals

**Goals:**

- Add canonical `claude-haiku-4-5` and alias `haiku`; require model-facing test flows to pass effort `low` explicitly.
- Make Haiku the documented low-cost choice for real Plugin smoke, hook, environment, and integration witnesses.
- Keep Sonnet 5 and Opus 5 as the general delegation and decision-grade choices.
- Normalize dated Haiku 4.5 artifact evidence to the canonical family during recovery.
- Stop automatic reconnect/fallback and subsequent real CC tests after explicit subscription/usage/quota exhaustion.

**Non-Goals:**

- Inferring task purpose inside the runtime or adding a model-purpose flag.
- Making Haiku the implicit model for ordinary `spawn_agent`; model selection remains explicit.
- Treating a caller-imposed `--max-budget-usd` ceiling or a generic transient HTTP 429 as subscription exhaustion.
- Supporting Fable, older Haiku generations, or arbitrary dated model IDs as public inputs.

## Decisions

### 1. Pin the public model to canonical `claude-haiku-4-5`

`MODEL_ALIASES` will accept only `haiku` and `claude-haiku-4-5` for public requests. The dated backend ID observed in a session is evidence, not a stable input contract. This matches the existing canonical Sonnet/Opus policy and avoids a release for every backend snapshot date.

Accepting the generic alias without canonical persistence was rejected because Agent continuation and migration need a stable selected model. Accepting arbitrary `claude-haiku-4-5-*` input was rejected because it would expose backend snapshots as public compatibility promises.

### 2. Enforce test-only intent at the model-facing skill boundary

The spawn skill and discovery prompt will describe Haiku as test-only and direct routine real smoke/hook/integration checks to pass Haiku and low effort explicitly. `terminal-parity` will not inject an omitted effort, preserving the caller's native Claude envelope. General delegation, architecture, research judgment, and release decisions remain Sonnet/Opus. The runtime validates model identity but does not parse prompts or task names to infer purpose.

A new `--purpose test` argument was rejected: it expands the canonical API without making semantic misuse impossible. Task-name heuristics were rejected as brittle and misleading.

### 3. Normalize only verified dated Haiku evidence during recovery

Artifact model values matching `claude-haiku-4-5-<eight-digit-date>` will normalize to `claude-haiku-4-5` before `resolveModel()`. This path applies only to observed evidence; public request validation remains exact. Existing Sonnet/Opus recovery behavior is unchanged.

### 4. Make explicit account-limit exhaustion permanent

Failure classification will include strings from terminal result `errors` in addition to final output, stderr, and warning. Explicit subscription, usage allowance/quota, billing-period, weekly/monthly, credit, or quota-limit exhaustion becomes `usage_or_subscription_limit`. The classifier requires an account-capacity scope plus an exhaustion signal (or Claude's explicit "hit your limit" form), so ordinary request/rate limits mentioning a usage tier remain transient. The supervisor will refuse transport reconnect for the permanent class even if the text also contains HTTP 429. No fallback model is supplied. An explicit `error_max_budget_usd` marker takes precedence and remains an ordinary terminal caller-budget failure even if its prose includes the words "usage limit".

Generic transient HTTP 429 without account-exhaustion language retains the existing bounded reconnect policy. Caller-imposed maximum-budget errors remain ordinary terminal failures and do not globally disable later CC tests.

### 5. Parent orchestration owns the test stop rule

When a real CC test reports `usage_or_subscription_limit` or an equivalent explicit account-limit message, the parent stops additional real Claude spawns/follow-ups for that testing workflow. Local code edits, fake-Claude fixtures, unit tests, and integration tests may continue. This state is deliberately not persisted as a global machine kill switch because subscription windows reset externally and unrelated user-directed work must not be silently blocked.

## Risks / Trade-offs

- [Haiku is selected for general work despite guidance] → Keep model choice explicit and make test-only language prominent in both discovery and full skill instructions; the runtime cannot safely infer semantic purpose.
- [Anthropic changes the dated Haiku backend] → Persist the verified canonical family and accept only the narrow dated evidence pattern during recovery.
- [A transient 429 is mistaken for subscription exhaustion] → Require explicit usage/subscription/quota/period-limit wording; generic HTTP 429 keeps bounded recovery.
- [A real smoke reaches the account limit] → Stop further CC tests immediately, report the limit, and continue only local/fake verification.

## Migration Plan

No stored schema migration is needed. Existing Agents retain their selected model. New Haiku Agents persist the canonical family; legacy/session evidence with the verified dated pattern becomes resumable under that canonical family. Rollback removes the alias and policy while preserving existing Haiku Agent records as unsupported historical identities rather than substituting another model.

## Open Questions

None. The user explicitly approved Haiku as a test-only third model and the stop-on-account-limit policy.

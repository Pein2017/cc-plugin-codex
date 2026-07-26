## Why

Real Plugin smoke and hook-parity checks currently consume Sonnet or Opus subscription capacity even though they need only a cheap protocol witness. The user has approved Haiku as a third, test-only model and requires all further real CC testing to stop when Claude reports a subscription or usage-limit exhaustion.

## What Changes

- Add `haiku` and canonical `claude-haiku-4-5` model selection, verified against Claude Code 2.1.220; the live alias resolved to dated model `claude-haiku-4-5-20251001` with canonical family `claude-haiku-4-5`.
- Require real Haiku test calls to pass effort `low` explicitly and describe it as test-only in the spawn skill, discovery metadata, README, and release notes.
- Use Haiku for Plugin smoke, hook, environment-parity, and integration witnesses unless the test specifically targets Sonnet or Opus selection.
- Keep Sonnet 5 and Opus 5 as the only general delegation and decision/audit models; Haiku SHALL NOT be recommended for architecture, research judgment, or production work.
- Recognize dated Haiku 4.5 evidence as canonical `claude-haiku-4-5` during legacy/session model recovery without accepting arbitrary dated model IDs as public spawn inputs.
- Classify explicit Claude subscription/usage/quota-limit exhaustion as permanent, do not reconnect or fall back to another model, and instruct the parent to stop subsequent real CC tests while allowing local code and fake/integration verification to continue.
- Non-goals: automatic model selection for non-test work, a new model-purpose flag, silent fallback, changing existing Agent identities, or treating a caller-imposed per-command budget as subscription exhaustion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Add the exact Haiku 4.5 test-only selection and limit-exhaustion orchestration policy while preserving explicit model choice.
- `claude-session-execution`: Pass the canonical Haiku model through Claude Code, normalize dated Haiku evidence, and make subscription/usage-limit failures terminal and non-retrying.

## Impact

- Affected code: model resolution/migration, failure classification, supervisor retry gate, spawn skill/docs, and related unit/integration contracts.
- Public lifecycle operation count and stored Agent schema remain unchanged.
- One live Haiku alias probe was bounded and tool-free; no subscription-limit error was observed. The probe hit only its caller-imposed `$0.02` cap after reporting the exact model mapping.

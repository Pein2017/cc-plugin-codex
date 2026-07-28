## Why

CC for Pein currently rejects Fable and treats Haiku 4.5 as test-only even though the active Claude Code CLI exposes Fable 5 and a common five-level effort surface. The Plugin should reflect Pein's current Claude Max model policy while helping the parent choose capability and spend intentionally.

## What Changes

- Expand the exact model allowlist to Haiku 4.5, Sonnet 5, Opus 5, and Fable 5.
- Map the public `fable` alias only to the locally verified full ID `claude-fable-5`; retain exact mappings for the other three models and no fallback.
- Accept `low`, `medium`, `high`, `xhigh`, and `max` for every supported model while keeping model and effort separate and explicit.
- Present a concise capability/cost ladder at spawn selection time: Haiku < Sonnet < Opus < Fable.
- Recommend Fable for core decision discussion and planning, not routine code implementation; retain Haiku/low as the cheapest routine real-smoke route without restricting Haiku itself to testing.
- Keep existing Agent identity, mailbox, continuation, and completion behavior unchanged.
- Non-goals: exact monetary pricing, automatic cost enforcement, model fallback, a default implicit model, or an expensive live Fable acceptance call.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: expand exact spawn model selection and update model/effort guidance.
- `claude-session-execution`: allow all four canonical model IDs to cross the Claude CLI boundary.

## Impact

The change affects model normalization and validation in `runtime/`, spawn skill guidance and metadata in `plugins/cc-for-pein/`, focused and integration tests, README model documentation, and the two stable OpenSpec capabilities above. It adds no dependency and changes no persisted Agent schema; existing Agents continue with their recorded model.

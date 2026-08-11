## Why

Claude Code interactive and headless modes share one native credential store, but a headless turn can observe an expired access token immediately before an interactive terminal silently refreshes that store. Today the failed CC Agent remains permanently activation-blocked and operator diagnostics call a metadata-only `claude auth status` result “active,” forcing callers to create a new Agent or restart Codex even when the objective credential state has already changed.

## What Changes

- Persist a redacted, non-secret Claude credential generation with readiness and authentication failures so later activation can distinguish an unchanged failure from an operator-refreshed credential store.
- Preserve the original `auth_required / harness / operator_required` completion as immutable historical evidence.
- On a later `followup_task`, allow the same logical Agent to transition to a receipt-proven `safe_fresh` Claude session only when the credential generation changed and the failed turn proves no tool use, file touch, useful assistant output, or other possible side effect.
- Keep unchanged credentials, ambiguous side effects, foreign config identities, and locally expired replacement credentials blocked.
- Make readiness and doctor describe credential presence/local expiry honestly without claiming live API validation.
- Keep all credential inspection local and redacted; do not persist tokens, token hashes, account identity, or raw credential content.

Non-goals:

- No automatic `claude auth login`, background credential watcher, timed retry loop, exact resume of an authentication-failed native session, or cross-Harness/model fallback.
- No default model-backed live-auth probe and no change to the seven model-facing tools.
- No change to historical completion classification or acknowledgement semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-driver-runtime`: readiness and authentication failures carry redacted credential-generation evidence and distinguish local credential presence from live API validation.
- `canonical-agent-orchestration`: a blocked authentication failure may become receipt-proven safe-fresh continuation on the same logical Agent after an observed credential refresh and only under a closed no-side-effect proof.
- `runtime-operations-diagnostics`: doctor reports credential presence/local expiry and `liveValidated: false` without mutating Claude state or launching a model.

## Impact

- Runtime: Claude credential observation, Driver preflight/terminal evidence, Agent continuation reconciliation, and follow-up activation.
- Durable state: bounded optional credential-generation metadata on readiness/job/Agent recovery evidence; existing records remain readable and blocked unless new evidence proves recovery.
- Diagnostics: redacted doctor wording and fields; no new model-facing API.
- Tests/docs: focused Driver, blocking, follow-up, persistence, diagnostics, privacy, and Plugin contract coverage plus full Linux release validation.

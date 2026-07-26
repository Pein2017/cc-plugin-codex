## Context

The runtime correctly returns a structured spawn receipt and persists its full
state. The excess output comes from the final instruction in the model-facing
`spawn-agent` skill, not from a runtime or persistence defect.

## Goals / Non-Goals

**Goals:**

- Keep the full structured receipt available to Codex and durable runtime state.
- Make the default user-facing success response a short Agent path/status
  acknowledgement.
- Preserve explicit raw/debug inspection.
- Map an explicit `Ops5`/Opus 5 model selection to `claude-opus-5` without
  treating an `Ops5` substring in a task name as an implicit model request.

**Non-Goals:**

- Change runtime return shapes, persistence, recovery, session ownership, or
  process lifecycle.
- Change presentation rules for the other five lifecycle skills.
- Suppress errors or actionable recovery information.
- Guarantee account entitlement to any model or silently substitute another
  model when the requested one is unavailable.

## Decisions

1. Own presentation in `spawn-agent/SKILL.md`. The skill caused the current
   behavior and can correct it without introducing a second public runtime
   format.
2. Require a concise summary derived from stable receipt fields: Agent path and
   current status. Include a short error/recovery message when spawn does not
   succeed.
3. Permit full JSON only after an explicit raw/debug request. The receipt remains
   available to the model for targeting and subsequent lifecycle operations.
4. Add a static plugin-contract test so future skill edits cannot silently
   restore default raw receipt dumping.
5. Pin the supported model surface to `claude-sonnet-5` and `claude-opus-5`.
   Local low-effort probes confirmed that Claude Code aliases `sonnet` and
   `opus` resolve to those main model IDs on the active account. Effort values
   remain the separate `low`, `medium`, `high`, `xhigh`, and `max` argument.
6. Replace the stale runtime alias table (`opus` → Opus 4.7 and `sonnet` →
   Sonnet 4.6) with strict normalization to the two full 5.x IDs. Reject every
   other explicit model before launching Claude.
7. Persist the Agent name in each internal turn request and pass it as Claude
   `--name` only when creating a new session. A same-environment probe showed
   unnamed turns consumed Haiku tokens for automatic title generation, while a
   named Opus 5 turn used only `claude-opus-5`. Exact-session resumes retain the
   existing name and do not need the flag.
8. Apply the pinned Opus 5 default to `terminal-parity` as well as `safe`.
   This is the one deliberate model-policy exception to terminal parity: without
   it, an unrestricted configured Claude default could bypass the two-model
   contract even though every explicit model is validated.

Alternative considered: add a `--concise` runtime flag. This was rejected
because the runtime's structured output is the machine contract; changing it
would couple user presentation to lifecycle internals.

## Risks / Trade-offs

- [A model may omit useful failure details] → Require actionable failure or
  recovery information while limiting only successful default presentation.
- [Exact wording may vary] → Test the invariant in the skill instruction rather
  than one natural-language sentence.
- [Other lifecycle skills remain verbose] → Keep this user-requested change
  narrow; evaluate them independently if their real usage shows the same issue.
- [Account entitlement can change] → Use pinned full model IDs, avoid claiming
  future availability, and report rejection without fallback.
- [A future Claude version may change internal naming behavior] → Keep the
  selected-model whitelist authoritative and retain an adapter test for the
  initial-only `--name` argument.

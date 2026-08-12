# Bounded Native Claude Teams — Execution Design Companion

> This document is a non-authoritative Superpowers execution companion. The
> sole product and completion authority is
> [`openspec/changes/enable-bounded-native-claude-teams/`](../../../openspec/changes/enable-bounded-native-claude-teams/).

## Purpose

Translate the approved OpenSpec into reviewable implementation seams without
creating a parallel product specification. If this document and OpenSpec ever
disagree, OpenSpec wins and this companion must be corrected before code work.

## Component boundaries

| Component | Single responsibility | Must not own |
|---|---|---|
| `runtime/claude-native-team-policy.mjs` | Pure role, prompt, deny, teammate-definition, semantic-limit, cohort-label, alias, and observed-surface classification | Claude env/argument names, process launch, durable Agent/teammate state |
| `runtime/execution-profile.mjs` | Sole translation from validated route/team policy to Claude options and child environment, including Agent Teams activation | Stream parsing, compatibility persistence |
| `runtime/claude-headless-adapter.mjs` | Validate/serialize resolved `--agents`; expose bounded init/first-spawn/team witness events to an optional in-process callback | Role decisions, public API, cross-process IPC, durable teammate evidence, memory contents |
| `runtime/claude-code-driver.mjs` and job runtime | Pass durable job identity/route, enforce Driver `@2`, retain parent lifecycle, and disable team-turn auto-reconnect | Native teammate registry, transcript ingestion |
| `runtime/claude-version-compatibility.mjs` | Static CLI surface and bounded production tool-surface observations | Paid probes, model-quality claims |
| `runtime/operator-diagnostics.mjs` | Zero-model projection of static/live evidence | Starting Claude or reading native memory |
| Skills/docs/release smoke | Caller guidance and explicit acceptance witness | New MCP topology or implicit paid testing |

## Execution flow

```text
spawn/follow-up validation
  -> durable parent job ID + immutable route
  -> pure policy returns prompts/denials/definitions/semantic limits
  -> execution profile derives cohort label and activates Agent Teams
  -> adapter serializes one Claude process invocation
  -> init definitions and canonicalized reviewed tool policy are admitted
  -> first named Agent result proves status: teammate_spawned
  -> Claude owns native teammates/tasks/messages/memory inside the process
  -> parent joins/verifies/shuts down and returns one final synthesis
  -> CC runtime persists only the existing parent result
```

If an orchestrator process loses transport, the flow stops at the durable
parent result. It does not auto-reconnect an in-process team; a later explicit
follow-up starts a new job/team under Driver `claude-code@2`.

## Review units

Implementation should be reviewed in five independently rejectable units:

1. Route and team-policy contracts.
2. Profile/adapter/recovery reproduction.
3. Observable tool-surface compatibility and doctor evidence.
4. Skill/document/release-witness coherence.
5. Full fixed-diff acceptance plus the separately authorized paid witness.

Each unit starts with a failing focused test, ends with its own green focused
suite, and stages only the named files. No unit may change package version,
manifest cachebuster, installation, or release state.

## Evidence ladder

1. Pure unit tests prove role/policy/alias/serialization invariants.
2. Fake process/integration tests prove Driver-version, team admission,
   no-auto-reconnect, and fail-closed branches.
3. `npm run check` proves repository-wide regression status.
4. Independent Opus and Sol reviews challenge Claude-native feasibility and
   architecture/test completeness.
5. One explicit paid witness directly exercises the production
   Driver/profile/adapter seam using an in-process callback; it does not claim
   paid MCP/detached-worker validation, filesystem isolation, hidden teammate
   effort, effective teammate model, or cost.

## Execution stop boundaries

- Stop before code if the OpenSpec no longer validates strictly.
- Stop a task at its first production-shaped semantic contradiction; do not
  weaken the contract to make a leaf test green.
- Stop all paid Claude tests on an account/subscription/quota limit.
- Stop before install, merge, archive, version, release, or push unless the user
  separately authorizes that lifecycle action.

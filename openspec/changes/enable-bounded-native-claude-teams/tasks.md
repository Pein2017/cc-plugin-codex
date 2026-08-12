## 1. Contract-First Test Coverage

- [ ] 1.1 Add failing route/pre-publication cases to `tests/runtime/agent-launch-boundary.test.mjs` for Haiku read-only leaf, Sonnet leaf-only, exact Opus/Fable orchestrators, and invalid combinations producing no readiness or durable state.
- [x] 1.2 Add failing pure-policy/profile cases for the lead/leaf/teammate role matrix, semantic limits, Agent Teams env mapping, exact stable definitions, `memory: local`, omitted definition effort/background/isolation, definition-owned model, subagent-model override removal, behavioral authority, and reviewed deny sets.
- [x] 1.3 Add failing adapter/integration cases for deterministic one-value `--agents` JSON, init `Task`→`Agent` canonicalization, required definition/necessary-tool admission, first named `status: teammate_spawned` transport proof, rejection of ordinary-subagent results, forbidden/unknown/absent inventories, complete-inventory classification before display caps, and witness-only structured events.
- [ ] 1.4 Add failing Driver/recovery cases for `claude-code@2`, old/new prepared-job hot-refresh and rollback rejection, unchanged leaf reconnect, orchestrator zero automatic reconnect, and explicit follow-up forming a fresh team.
- [x] 1.5 Add failing environment/memory cases proving `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` wins after any selected env file and that read-only acceptance distinguishes exact native-memory paths from task-state mutation.
- [ ] 1.6 Extend plugin-contract and fake release-smoke tests for the unchanged seven-tool API, model-visible Opus/Fable team-lead guidance, production-shaped native events, missing-evidence behavior, and account-limit stop.

## 2. Native Team Policy and Profile

- [x] 2.1 Add `runtime/claude-native-team-policy.mjs` as the pure owner of role admission, teammate definitions/prompts, semantic limits, reviewed deny/baseline names, `Task` alias canonicalization, and complete-inventory classification without emitting CLI arguments or environment keys.
- [x] 2.2 Update `runtime/execution-profile.mjs` to remain the sole owner mapping policy into `--agents`, `--append-system-prompt`, `--disallowedTools`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, one-layer depth, and the concurrency value used only as a residual ordinary-subagent guard.
- [x] 2.3 Remove inherited `CLAUDE_CODE_SUBAGENT_MODEL` only for orchestrators, keep exact requested models in definitions, and require teammate prompts to omit call-level model/isolation/fork overrides while stating intended effort and inherited/unknown effective effort.
- [ ] 2.4 Derive a fresh opaque cohort label from each durable orchestrator job ID without adding a persisted field; prove each explicit follow-up receives a new label and native team while the durable parent Agent/session remains stable.
- [x] 2.5 Force `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` after one-file environment resolution for every model-facing turn without exposing the value in public receipts.

## 3. Claude CLI, Driver, and Failure Integration

- [x] 3.1 Extend `runtime/claude-headless-adapter.mjs` to validate and deterministically serialize the three definitions through one `--agents` argument, and to emit bounded structured init/tool/team witness events through an optional in-process callback without retaining raw inputs or contents.
- [x] 3.2 Add admitted Harness class `compatibility_surface_drift`, map it to `harness_incompatible`, and terminate an orchestrator on forbidden tool leakage, missing definition/necessary tool, or a first named Agent result other than structured `status: teammate_spawned`, using native evidence only.
- [ ] 3.3 Bump `CLAUDE_CODE_DRIVER_VERSION` to `claude-code@2`; thread job identity and native-team policy through Driver/job launch while keeping `runtime/index.mjs` and the public seven-operation topology unchanged.
- [ ] 3.4 Preserve leaf transport recovery but set orchestrator automatic reconnect attempts to zero; retain exact parent continuation evidence so a later explicit follow-up starts a fresh team instead of pretending in-process teammates resumed.
- [ ] 3.5 Preserve native Auto Memory and teammate `memory: local` without reading, locking, merging, redirecting, cleaning, or exposing `.claude/agent-memory-local/**` contents.

## 4. Compatibility and Operator Evidence

- [x] 4.1 Add `--agents` to the zero-model CLI surface revision while keeping version admission fingerprint-based, exact-parent-model, no-Plugin-fallback, and statically live-unverified.
- [ ] 4.2 Persist at most sixteen latest bounded observation records across executable fingerprint and delegation mode with deterministic eviction, classification-before-cap, owner-only atomic writes, and no prompt/input/output/session/roster/memory content.
- [ ] 4.3 Extend doctor to report `denySetLiveValidated`, `teamTransportLiveValidated`, missing teammate definitions/necessary tools, forbidden leakage, unknown native drift, and no-observation state without launching Claude or making a universal containment claim.
- [ ] 4.4 Add migration/reconciliation coverage proving older records remain readable, cannot become false validation, and prepared jobs cannot cross the `claude-code@1`/`@2` boundary in either direction.

## 5. Skills, MCP Guidance, and Documentation

- [ ] 5.1 Update all seven files under `plugins/cc-for-pein/skills/`, `plugins/cc-for-pein/skills/spawn-agent/agents/openai.yaml`, and `runtime/mcp-server.mjs` together so model-visible guidance calls `claude_orchestrator` an experimental Native Agent Team lead valid only for exact Opus/Fable.
- [ ] 5.2 Update `README.md` with hard/residual-guard/behavioral boundaries, Agent Teams experimental/resumption limits, pinned definition models, inherited effort, local native-memory writes, same-team messaging, zero auto-reconnect, Driver-version transition, and unobservable teammate metrics.
- [ ] 5.3 Extend `runtime/release-smoke.mjs` with an explicit fake-testable native-team witness controller that directly invokes the production Driver/profile/adapter, creates a disposable Git workspace, consumes the adapter's optional bounded in-process callback, snapshots every disposable path plus source-checkout status, allows only exact witness memory prefixes, and stops on account limits; do not add public MCP fields, cross-process IPC, or durable teammate-event storage.
- [ ] 5.4 Keep package version, manifest cachebuster, installation, changelog release entry, and publication state unchanged during implementation; handle them only in a separately authorized lifecycle task.

## 6. Zero-Cost Verification

- [ ] 6.1 Run focused policy/profile, environment, adapter, failure mapping, Driver/recovery, compatibility, diagnostics, plugin-contract, integration, and fake-release-smoke tests while iterating and retain exact commands/results.
- [ ] 6.2 Run `openspec validate enable-bounded-native-claude-teams --strict`, `git diff --check`, and `npm run check`; inspect the final diff for public API, process recovery, permission, memory, and hot-refresh regressions.
- [ ] 6.3 Obtain independent fixed-diff reviews focused separately on Claude-native Agent Teams feasibility/tool semantics and OpenSpec/architecture/test coherence; resolve every P0/P1 before paid validation.

## 7. Explicit Paid Acceptance

- [ ] 7.1 After explicit paid-test authorization, snapshot source-checkout status, create/snapshot a disposable Git witness workspace, and run exactly one real `claude-opus-5`/`low`, `write:false` Native Agent Team witness there through the production Driver/profile/adapter seam with one Haiku scout, one Sonnet reviewer, explicit intended efforts, one current-team message, both native settle signals, and one parent synthesis.
- [ ] 7.2 Verify injected requested model definitions and production structured team events; record effective teammate model/effort/cost as unknown unless authoritative native facts exist, and leave acceptance unverified rather than trust assistant prose when required facts are absent.
- [ ] 7.3 Allow only `.claude/agent-memory-local/haiku-scout/**` and `.claude/agent-memory-local/sonnet/**` metadata changes without reading contents; fail acceptance on any other workspace/task/repository mutation.
- [ ] 7.4 If the witness reports a subscription, allowance, credit, or quota limit, stop all remaining paid Claude tests and leave live acceptance incomplete without classifying model quality.

## 8. Acceptance and Later Lifecycle

- [ ] 8.1 Run `openspec-verify-change`, reconcile implementation against every scenario, and leave any unverified or intentionally deferred item unchecked with an explicit disposition.
- [ ] 8.2 Do not install, merge, archive, version, release, or publish this change until the user separately authorizes that lifecycle step after reviewing verified evidence.

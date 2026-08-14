# HarnessDock For Codex — Fresh-Session Implementation Handoff

## Objective

Build the Codex-originated multi-Harness control plane in three sequentially gated changes: rename the current local Plugin identity without behavior drift, generalize its internal lifecycle, then add one read-only OpenCode/DeepSeek V4 Flash Explorer. The next implementation task SHOULD continue across all remaining candidate code and deterministic tests in this order without pausing for user intervention; it stops only at the consolidated installed-release boundary or on evidence that requires a product/spec decision.

## Authority

OpenSpec is the only product/scope/completion authority, in this order:

1. [`rename-to-codex-harnessdock`](../../openspec/changes/rename-to-codex-harnessdock/)
2. [`generalize-multi-harness-agent-control-plane`](../../openspec/changes/generalize-multi-harness-agent-control-plane/)
3. [`add-opencode-explorer-driver`](../../openspec/changes/add-opencode-explorer-driver/)

Execution companions:

- [Architecture/execution index](../superpowers/specs/2026-08-13-multi-harness-control-plane-design.md)
- [Phase 0 plan](../superpowers/plans/2026-08-14-rename-to-codex-harnessdock.md)
- [Phase A plan](../superpowers/plans/2026-08-13-multi-harness-control-plane.md)
- [Phase B plan](../superpowers/plans/2026-08-13-opencode-explorer-driver.md)

If a plan conflicts with OpenSpec, correct the plan before code work. Do not reconstruct decisions from the old conversation when the artifacts answer them.

## Current transfer checkpoint — 2026-08-14

- Development owner: `/data/CoordExp/codex-harnessdock-dev` on branch `codex/harnessdock-dev`.
- Phase 0 baseline commit: `a344b56eb615ce24c1f234bce3e3832d772c2470` (`rename plugin identity to HarnessDock`).
- Phase 0 acceptance-correction commit: `6e9d38d` (`fix: fail closed during identity cutover`).
- Production/executable source owner remains `/data/CoordExp/cc-plugin-codex`; do not load runtime code from the development worktree.
- `/data/CoordExp/cc-plugin-codex-dev` is superseded as a development owner and must remain clean; it is not a second authority or write target.
- The Phase A/B OpenSpec changes and their two execution plans were copied byte-identically into this worktree and are retained here as the sole successor planning copies. Do not sync them back to the old development worktree.
- Commit `6e9d38d` requires complete explicit Agent/MCP ownership witnesses for cutover and rollback, and lets a failed post-move metadata check recover from one uniquely matching pending receipt. Treat missing, partial, or ambiguous evidence as a blocked cutover rather than inferring settlement from arbitrary state JSON.
- Phase 0's exact candidate tree is accepted for dependent implementation after the `6e9d38d` correction and fresh full gates. Its installed cutover and loaded-Plugin acceptance tasks 8–9 remain intentionally incomplete; they are consolidated with the final Phase B installation rather than blocking Phase A/B candidate work.
- The commit author identity currently records a private email. Distributable manifests are clean, but configure an appropriate public/noreply Git identity before any future public commit or rewrite/push decision; do not rewrite history implicitly.

Start the next fresh Codex task with cwd `/data/CoordExp/codex-harnessdock-dev` and activate Serena for that exact root. Preserve unrelated dirty work and treat this handoff as transport rather than completion evidence.

## Worker routing during the transition

- Codex remains the main planner, dispatcher, synthesizer, reviewer, and acceptor.
- Before installed cutover, the currently loaded `@cc-for-pein` Plugin MAY remain the primary implementation-worker transport, with every spawn explicitly specifying full model, reasoning effort, `leaf`/approved topology, and `write` authority.
- Prefer Sonnet for routine bounded implementation; Haiku remains suitable for mechanical smoke. Opus may handle ordinary code audit and complex implementation. Reserve Fable for important or decision-owning architecture/release gates, or when the user explicitly requests it; OpenSpec review does not automatically require the strongest reviewer.
- Every worker must use `/data/CoordExp/codex-harnessdock-dev` as its task workspace and must not modify `/data/CoordExp/cc-plugin-codex-dev`, `/data/CoordExp/cc-plugin-codex`, Plugin registration, installed snapshots, or either old/new Plugin data root unless the owning cutover task is explicitly authorized.
- Continue using the currently loaded `@cc-for-pein` transport until the consolidated final cutover. After that cutover, start a fresh Codex task and use the loaded `codex-harnessdock` tools instead of retaining two live Plugin identities.

Before freezing any phase implementation, run `openspec list` again. The currently active `add-targeted-barrier-agent-join`, `expose-actionable-agent-blocking`, `improve-agent-card-and-usage-receipts`, `replace-wait-polling-with-event-wakeup`, and `harden-native-background-task-completion` changes overlap public wait/blocking/card/usage/settlement requirements. If any has been accepted or archived, rebase this phase's copied MODIFIED/RENAMED requirements and file plan onto the new main specs before editing code; strict validation alone does not detect stale cross-change authority.

## Immediate next action and stop rule

1. Bind Git/Serena to `/data/CoordExp/codex-harnessdock-dev`, inspect exact HEAD/status, and re-run `openspec list` before selecting work.
2. Implement the remaining Phase A candidate with TDD, fresh focused/full receipts, review, and an exact-tree checkpoint. When that checkpoint passes, continue directly into Phase B in the same task/worktree; do not merge the two OpenSpec task ledgers or skip either review gate.
3. Complete Phase B code, deterministic fake-Server coverage, compatibility probing that consumes no model request, release/evaluation tooling, documentation, and all checkout-level tests that the available local contract permits.
4. Stop before the first operation that mutates installed state or requires the freshly loaded final Plugin: production-checkout promotion, durable data cutover, Plugin refresh/install, enabled-record changes, Codex restart/new loaded task, installed-smoke execution, or live Claude/OpenCode examples through that loaded Plugin. Present these as one operator runbook instead of performing a partial seven-operation installation.
5. Also stop on an actual OpenCode contract mismatch requiring OpenSpec revision, unavailable required operator-owned Server evidence, secret/auth/account/quota failure, material paid-model authorization need, or a conclusion-changing review finding. Ordinary implementation details and failing tests are not pause conditions; diagnose and fix them.

## Product and technology decisions

- Public name: **HarnessDock for Codex**.
- Plugin/Skill slug: `codex-harnessdock`.
- MCP namespace: `codex_harnessdock`.
- Package/bin: `codex-harnessdock-runtime`.
- License: Apache-2.0; public author Pein2017/link; no private email; unofficial third-party disclaimer.
- Keep Node.js 20.19+ ESM `.mjs`, JSDoc/checkJs, Zod, MCP SDK, and `node:test`. Do not rewrite in Rust or TypeScript before evidence demands it.
- `runtime/index.mjs` remains the sole lifecycle facade.
- Physical production/development checkout rename is Phase R after Phase B and before a third Harness, not Phase 0.

## Core architecture invariants

- Codex Desktop/root task is the initiator and only planner/router/synthesizer/final editor/reviewer/acceptor. There is no initial Codex Driver.
- The Plugin is a thin control plane, not a meta-Harness/workflow engine. Harnesses own model loops, tools, auth, context/history, native teams, and persistence.
- New public spawn requires explicit immutable `harness`, full `model`, `topology`, and `write`; no default/alias/inference/fallback/hot-switch.
- One Plugin Agent owns one route/native session lineage. Same- or cross-Harness Plugin-Agent messaging is not added; cross-Harness work uses a new Agent with Codex-distilled input.
- Public operations after Phase B are exactly eight: list harnesses, spawn, send, follow-up, wait, interrupt, list, read messages.
- Durable hierarchy: `CodexRoot → PluginAgent → Turn/Job → Attempt → NativeSessionRef + NativeTurnRef → Message/Command/Receipt`.
- Launch claim/attempt/input digest and leases precede native submission. Possible remote acceptance without exact turn evidence becomes unknown, holds leases, and is never replayed/fallbacked.
- Session and turn references are separate; request acknowledgement, effect, and settlement are separate.
- Driver scope is least-authority. Driver prompt envelope adds only authority/topology/return contract; Codex owns decomposition/methodology/synthesis.
- First-generation routes are fixed-policy noninteractive. No generic approval broker/TUI automation.
- Generic result is bounded outer final text plus closed metadata/usage; no Plugin-owned nine-field research ontology or native tool/event history.
- One behavioral writer per canonical worktree. Unknown writer holds the lease. No model-facing force-clear.
- Operator CLI is doctor/status/inspect/reconcile only; formal dispatch is Codex/MCP.

## Phase 0 candidate and deferred activation boundary

Phase 0 preserves the current seven Claude operations and only changes identity/source-within-checkout/data namespaces. It must:

- move `plugins/cc-for-pein/` to `plugins/codex-harnessdock/`;
- move the default data namespace `cc` to `codex-harnessdock` through one backup + atomic move, never two writable stores;
- rename MCP/Skill/package namespaces;
- record the cutover timestamp so operator usage reports count new `codex_harnessdock` events, retain only valid pre-cutover `cc_for_pein` history, and flag post-cutover legacy traffic;
- retain `/data/CoordExp/cc-plugin-codex` as loaded runtime source;
- prove seven-operation identity/behavior parity in checkout-level and fake-Claude tests;
- leave installed state untouched while Phase A/B candidates are implemented;
- at the consolidated final activation, prove the then-current accepted public generation (eight operations after Phase B), a read-only Claude lifecycle witness, correct state lineage, and absence of the old MCP.

Do not run cutover automatically. It requires explicit authorization after all three candidate changes pass their tests/reviews. Never roll back across active/unknown new work.

## Phase A stop boundary

Phase A adds Driver v2, least-authority scope, static instance inspection, interaction capability, distinct session/turn refs, launch claims, honest settlement, route-qualified usage, instance/session/writer leases, durable controls, v3 validation gate, fake service Driver, and Claude legacy adapter. It keeps seven public operations and v2 public writes. It adds no OpenCode dependency or public route fields.

`DEFAULT_HARNESS_ID` may exist only in the legacy Claude adapter. `runtime/execution-profile.mjs` becomes Claude Driver-internal. No generic session/tool/event/approval/workflow/routing API is allowed.

Checkpoint after deterministic/full gates, optional separately authorized direct read-only Claude smoke, fresh review, and an exact accepted tree. Phase B may then begin immediately in the same task/worktree; this checkpoint is not installed/release acceptance.

## Phase B live facts to discover, not assume

- Installed `opencode` and Server versions.
- Exact DeepSeek V4 Flash identifier from both `opencode models` and Server/client discovery; requested candidate is `opencode-go/deepseek-v4-flash`.
- Compatible exact SDK/OpenAPI client version and prompt/message/error/usage types.
- Resolved `codex-explorer` profile and effective deny policy.
- Whether authoritative Server/session incarnation evidence permits exact same-Agent follow-up; otherwise route is fresh-only.
- Actual latency/input/output/reasoning/cache/cost fields, Server reuse, mutation, sampled correctness.

The initial OpenCode route has capacity one and no active input, public interrupt, restart observation/recovery, history, native orchestration, approval broker, or write. It uses an operator-owned loopback Server and never parses TUI/CLI output in production.

Three explicit live successes admit only Experimental dogfooding. Twenty-task reliability, cache benchmark, one/two/four concurrency, crash/idle behavior, workday economics, implementation worker, DeepSeek Harness, and Grok Build remain later work.

## Verification and authorization rules

For each change:

1. start from the exact candidate-accepted prior tree in the isolated development worktree; a fresh task is recommended but not required between Phase A and B;
2. implement test-first in the order of the owning OpenSpec/tasks and Superpowers plan;
3. run focused tests, `npm run check`, per-change/all strict OpenSpec validation, and `git diff --check`;
4. freeze exact tree and request fresh read-only review; disposition and rerun;
5. report actual evidence and cross into the next change only after its candidate gate passes.

Commit the accepted development changes as ordinary implementation bookkeeping. Paid/live model calls, installed cutover/refresh, publish/release, push, archive, physical production-checkout move, force-clear, and the loaded-Plugin witness remain separately authorized. Auth/account/quota, mutation, wrong route, ambiguous acceptance/settlement, or materially unverifiable findings stop the relevant live matrix without automatic fallback.

## Required completion receipt

Return exact commit/tree (or state clearly that planning/implementation is uncommitted), OpenSpec task/status evidence, focused/full command outputs, Serena and independent-review dispositions, public schema/generation catalog, source/data/runtime provenance, launch/session/turn and unknown-settlement tests, legacy Claude parity/live witness, fake-service/OpenCode results, mutation witness, and every still-unproven field.

For Phase B also include installed OpenCode/Server/client/model/profile versions, continuation mode, artifact roots, request count, latency, exact provider usage/cache/cost fields, Server-reuse facts, sampled Codex verification, and bounded GO/GO WITH CHANGES/NO-GO. Then hand off Phase R as a new change; do not perform it implicitly.

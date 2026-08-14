# HarnessDock For Codex — Fresh-Session Implementation Handoff

## Objective

Build the Codex-originated multi-Harness control plane in three independently accepted phases: rename the current local Plugin identity without behavior drift, generalize its internal lifecycle, then add one read-only OpenCode/DeepSeek V4 Flash Explorer. Do not implement all phases in one session.

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

## Planning checkout state

- Planning checkout: `/data/CoordExp/cc-plugin-codex-dev`
- Production/source owner remains: `/data/CoordExp/cc-plugin-codex`
- Baseline when planning began: `1a2ea06a598d84c90254ba61501555998620f283`
- These planning artifacts were initially untracked. Re-run `git status --short`, inspect worktrees/ownership, and record the exact accepted planning tree; do not trust this snapshot as current.
- This planning task performs no runtime implementation, install/refresh, data migration, live model call, commit, push, archive, public release, or physical source rename.

Create a fresh isolated implementation worktree/session for Phase 0 only. Use Serena in that exact worktree for code declarations/references/diagnostics and shell search for specs/docs/diffs. Preserve unrelated dirty work.

Before freezing any phase implementation, run `openspec list` again. The currently active `add-targeted-barrier-agent-join`, `expose-actionable-agent-blocking`, `improve-agent-card-and-usage-receipts`, `replace-wait-polling-with-event-wakeup`, and `harden-native-background-task-completion` changes overlap public wait/blocking/card/usage/settlement requirements. If any has been accepted or archived, rebase this phase's copied MODIFIED/RENAMED requirements and file plan onto the new main specs before editing code; strict validation alone does not detect stale cross-change authority.

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

## Phase 0 stop boundary

Phase 0 preserves the current seven Claude operations and only changes identity/source-within-checkout/data namespaces. It must:

- move `plugins/cc-for-pein/` to `plugins/codex-harnessdock/`;
- move the default data namespace `cc` to `codex-harnessdock` through one backup + atomic move, never two writable stores;
- rename MCP/Skill/package namespaces;
- record the cutover timestamp so operator usage reports count new `codex_harnessdock` events, retain only valid pre-cutover `cc_for_pein` history, and flag post-cutover legacy traffic;
- retain `/data/CoordExp/cc-plugin-codex` as loaded runtime source;
- prove zero-model installed smoke and a fresh Codex task with new discovery, read-only Claude spawn/wait, exact follow-up, list/read, and absence of old MCP;
- leave a recoverable backup and stop before Phase A.

Do not run cutover automatically. It requires explicit authorization after tests/review. Never roll back across active/unknown new work.

## Phase A stop boundary

Phase A adds Driver v2, least-authority scope, static instance inspection, interaction capability, distinct session/turn refs, launch claims, honest settlement, route-qualified usage, instance/session/writer leases, durable controls, v3 validation gate, fake service Driver, and Claude legacy adapter. It keeps seven public operations and v2 public writes. It adds no OpenCode dependency or public route fields.

`DEFAULT_HARNESS_ID` may exist only in the legacy Claude adapter. `runtime/execution-profile.mjs` becomes Claude Driver-internal. No generic session/tool/event/approval/workflow/routing API is allowed.

Stop after deterministic/full gates, optional separately authorized read-only Claude smoke, fresh review, exact accepted tree, and a new Phase B handoff.

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

For each phase:

1. start from the exact accepted prior tree in a fresh isolated task/worktree;
2. implement test-first in the order of the owning OpenSpec/tasks and Superpowers plan;
3. run focused tests, `npm run check`, per-change/all strict OpenSpec validation, and `git diff --check`;
4. freeze exact tree and request fresh read-only review; disposition and rerun;
5. report actual evidence and stop at the phase boundary.

Paid/live calls, installed cutover/refresh, publish/release, commit, push, archive, physical checkout move, force-clear, and next-phase start are separately authorized. Auth/account/quota, mutation, wrong route, ambiguous acceptance/settlement, or materially unverifiable findings stop the relevant live matrix without automatic fallback.

## Required completion receipt

Return exact commit/tree (or state clearly that planning/implementation is uncommitted), OpenSpec task/status evidence, focused/full command outputs, Serena and independent-review dispositions, public schema/generation catalog, source/data/runtime provenance, launch/session/turn and unknown-settlement tests, legacy Claude parity/live witness, fake-service/OpenCode results, mutation witness, and every still-unproven field.

For Phase B also include installed OpenCode/Server/client/model/profile versions, continuation mode, artifact roots, request count, latency, exact provider usage/cache/cost fields, Server-reuse facts, sampled Codex verification, and bounded GO/GO WITH CHANGES/NO-GO. Then hand off Phase R as a new change; do not perform it implicitly.

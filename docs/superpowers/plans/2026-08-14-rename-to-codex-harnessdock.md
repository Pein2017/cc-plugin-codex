# HarnessDock For Codex Identity Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the current Plugin, Skill/MCP/package/data namespaces to HarnessDock for Codex while preserving the seven Claude lifecycle behaviors and one durable state lineage.

**Architecture:** OpenSpec change [`rename-to-codex-harnessdock`](../../../openspec/changes/rename-to-codex-harnessdock/) is the sole scope and completion authority. This plan is execution-only: use test-first mechanical slices, keep `/data/CoordExp/cc-plugin-codex` as the executable source, and perform the installed cutover only after the candidate tree is reviewed.

**Tech Stack:** Node.js 20.19+ ESM, `node:test`, Zod, Codex Plugin manifests/Skills/MCP, owner-only JSON state, local refresh/release-smoke tooling.

## Global Constraints

- Read the owning proposal/design/specs/tasks completely before editing.
- Work in a fresh isolated worktree from the exact accepted planning tree; inspect dirty ownership before staging.
- Keep `runtime/index.mjs` the sole lifecycle facade and all seven operation schemas behaviorally unchanged.
- Do not enable old and new MCP identities concurrently. Do not copy state into two writable stores.
- Do not rename `/data/CoordExp/cc-plugin-codex`, this development worktree, Git remotes, or GitHub in Phase 0.
- Default tests are zero-model-cost. Installed cutover and real Claude witness require separate explicit authorization.
- Phase A MAY begin from the exact reviewed candidate tree after all checkout-level gates pass. Do not install, refresh, publish, archive, or push implicitly; defer the installed cutover until the Phase B candidate is complete.

---

### Task 1: Capture the old behavior and freeze the identity map

**Files:**
- Create: `tests/runtime/harnessdock-identity.test.mjs`
- Modify: `tests/runtime/mcp-server.test.mjs`
- Modify: `tests/runtime/plugin-contract.test.mjs`
- Modify: `tests/runtime/version-and-bootstrap.test.mjs`
- Modify: `tests/runtime/harness-claude-parity.test.mjs`

- [ ] Add failing assertions for display `HarnessDock for Codex`, slug `codex-harnessdock`, MCP `codex_harnessdock`, package/bin `codex-harnessdock-runtime`, data namespace `codex-harnessdock`, runtime override `CODEX_HARNESSDOCK_RUNTIME_HOME`, Pein2017 link, Apache-2.0, disclaimer, and no private email.
- [ ] Snapshot the seven current tool names/input schemas and the `runtime/index.mjs` method mapping; permit only namespace/metadata changes.
- [ ] Add explicit current-surface rejection for `cc-for-pein`, `cc_for_pein`, `cc-for-pein-runtime`, `CC_RUNTIME_HOME`, and public `CC_MCP_RESTART_REQUIRED`, with allowlists only for history/archive/migration fixtures and deliberately retained non-public compatibility constants.
- [ ] Run `node --test tests/runtime/harnessdock-identity.test.mjs tests/runtime/mcp-server.test.mjs tests/runtime/plugin-contract.test.mjs tests/runtime/version-and-bootstrap.test.mjs tests/runtime/harness-claude-parity.test.mjs` and confirm the new tests fail for the intended old names only.

### Task 2: Move the Plugin source tree and metadata mechanically

**Files:**
- Move: `plugins/cc-for-pein/` → `plugins/codex-harnessdock/`
- Move: `plugins/codex-harnessdock/bootstrap/cc-mcp.mjs` → `plugins/codex-harnessdock/bootstrap/harnessdock-mcp.mjs`
- Move: `plugins/codex-harnessdock/bootstrap/cc-runtime.mjs` → `plugins/codex-harnessdock/bootstrap/harnessdock-runtime.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.agents/plugins/marketplace.json`
- Modify: `README.md`
- Modify: `NOTICE`
- Modify: current image/asset references under `assets/`

- [ ] Move the Plugin directory once, including `.codex-plugin/plugin.json`, seven Skills, discovery YAML, renamed HarnessDock bootstraps, and assets; do not duplicate the tree.
- [ ] Rename package/bin/files metadata and derive manifest base version from `package.json` exactly as before.
- [ ] Update current public metadata/documentation for the new identity, author link, license, and unofficial disclaimer; remove private email.
- [ ] Update icons/logo filenames only where manifest/source tests require it; avoid unrelated visual redesign.
- [ ] Run `node --test tests/runtime/harnessdock-identity.test.mjs tests/runtime/plugin-contract.test.mjs tests/runtime/version-and-bootstrap.test.mjs`.

### Task 3: Rename the MCP and Skill discovery namespace

**Files:**
- Modify: `runtime/mcp-server.mjs`
- Modify: `runtime/mcp-api.mjs`
- Modify: `runtime/mcp-call-worker.mjs`
- Modify: `runtime/version.mjs`
- Modify: `plugins/codex-harnessdock/bootstrap/harnessdock-mcp.mjs`
- Modify: all seven `plugins/codex-harnessdock/skills/*/SKILL.md`
- Modify: all seven `plugins/codex-harnessdock/skills/*/agents/openai.yaml`
- Modify: `tests/runtime/mcp-server.test.mjs`
- Modify: `tests/runtime/plugin-contract.test.mjs`

- [ ] Make the stdio server register only `codex_harnessdock`; preserve the seven snake_case operation names, annotations, strict schemas, trusted metadata, and isolated call-worker semantics.
- [ ] Bump the identity generation, rename the public error to `HARNESSDOCK_MCP_RESTART_REQUIRED`, and prove a stale old MCP process returns it before lifecycle mutation.
- [ ] Replace every current Skill/tool prefix with `$codex-harnessdock:*` / `mcp__codex_harnessdock__*`; preserve Experimental, safety, wait, and no-shell-fallback guidance.
- [ ] Update the descriptor-only bootstrap contract so current/retained new-identity shells declare only `codex_harnessdock`; keep any pre-cutover descriptor in the rollback backup, never enabled/discoverable.
- [ ] Prove the installed/model-visible catalog contains exactly seven renamed Skills/tools and no old namespace.
- [ ] Run `node --test tests/runtime/mcp-server.test.mjs tests/runtime/plugin-contract.test.mjs tests/runtime/version-and-bootstrap.test.mjs`.

### Task 4: Rename the durable data namespace with a recoverable mover

**Files:**
- Modify: `runtime/paths.mjs`
- Modify: `runtime/operator-diagnostics.mjs`
- Create: `runtime/plugin-identity-cutover.mjs`
- Create: `tests/runtime/plugin-identity-cutover.test.mjs`
- Modify: `tests/runtime/operator-diagnostics.test.mjs`
- Modify: `runtime/operator-usage-ledger.mjs`
- Modify: `tests/runtime/operator-usage-ledger.test.mjs`
- Modify: relevant state/path tests under `tests/runtime/`

**Invariant:** old `${CODEX_HOME}/plugins/data/cc` and new `${CODEX_HOME}/plugins/data/codex-harnessdock` are never simultaneously writable.

- [ ] Add temporary-root tests for new default/override paths, old valid state, active/unknown refusal, nonempty destination, malformed records, backup failure, cross-device refusal, partial/interrupted move, owner/mode preservation, idempotent migrated inspection, and rollback.
- [ ] Implement preflight: no active turn/pending handoff/unknown settlement, readable old state, absent/empty new root, backup destination, no old/new MCP race.
- [ ] Implement backup plus same-filesystem atomic rename and bounded non-secret receipt; do not rewrite Agent/job/mailbox/completion/native-session files.
- [ ] Update doctor/status to report pending/migrated/conflict/rollback-required and the current namespace without exposing model-facing path selection.
- [ ] Persist the accepted cutover timestamp for operator reporting; count new `codex_harnessdock` events, retain valid pre-cutover `cc_for_pein` history under its original namespace, and reject post-cutover old-server traffic as drift.
- [ ] Run `node --test tests/runtime/plugin-identity-cutover.test.mjs tests/runtime/operator-diagnostics.test.mjs tests/runtime/agent-store.test.mjs tests/runtime/job-store.test.mjs tests/runtime/completion-inbox.test.mjs`.

### Task 5: Update refresh, install, doctor, and release smoke

**Files:**
- Modify: `runtime/plugin-installation.mjs`
- Modify: `runtime/plugin-compatibility-shells.mjs`
- Modify: `runtime/release-smoke.mjs`
- Modify: `scripts/local-plugin-install.mjs`
- Modify: `scripts/promote-local.mjs`
- Modify: `scripts/doctor.mjs`
- Modify: `scripts/release-smoke.mjs`
- Modify: `scripts/update-plugin-cachebuster.mjs`
- Modify: `tests/runtime/local-plugin-install.test.mjs`
- Modify: `tests/runtime/local-promotion.test.mjs`
- Modify: `tests/runtime/plugin-compatibility-shells.test.mjs`
- Modify: `tests/runtime/release-smoke.test.mjs`

- [ ] Update generated/current snapshot and enabled-record handling for only the new identity and canonical production checkout.
- [ ] Reject simultaneous old/new enabled MCP identities; retain compatibility shells only as non-executable discovery bridges where existing release rules require them.
- [ ] Keep `/data/CoordExp/cc-plugin-codex` hard provenance and refuse the development worktree/versioned Cache as runtime source.
- [ ] Add evidence-gated rollback tooling that refuses to restore old identity across active/unknown new work.
- [ ] Run `node --test tests/runtime/local-plugin-install.test.mjs tests/runtime/local-promotion.test.mjs tests/runtime/plugin-compatibility-shells.test.mjs tests/runtime/release-smoke.test.mjs tests/runtime/operator-diagnostics.test.mjs`.

### Task 6: Prove seven-operation lifecycle parity

**Files:**
- Modify only as tests require: `runtime/index.mjs`, `runtime/agent-runtime.mjs`, `runtime/internal-runtime.mjs`
- Modify: `tests/runtime/harness-claude-parity.test.mjs`
- Modify: `tests/runtime/harness-state-migration.test.mjs`
- Modify: `tests/runtime/agent-reconciliation.test.mjs`
- Create: `tests/runtime/harnessdock-vertical.test.mjs`

- [ ] Exercise renamed MCP → runtime facade → fake Claude → completion for spawn/wait and exact follow-up, plus send/list/read/interrupt fixtures.
- [ ] Prove root/session/mailbox/completion/authority/model/topology/recovery behavior is unchanged and valid old state is read without conversion.
- [ ] Prove zero-cost tests use injected temporary data roots and never touch production state or launch a real model.
- [ ] Run `node --test tests/runtime/harnessdock-vertical.test.mjs tests/runtime/harness-claude-parity.test.mjs tests/runtime/harness-state-migration.test.mjs tests/runtime/agent-reconciliation.test.mjs`.

### Task 7: Verify and review the uninstalled candidate

- [ ] Run all focused test groups above, then `npm run check`.
- [ ] Run `openspec validate rename-to-codex-harnessdock --strict`, `openspec validate --all --strict`, and `git diff --check`.
- [ ] Inspect `git status --short`, full diff, package/lock diff, current-prefix scan, private-email scan, installed/source path references, and generated/untracked files.
- [ ] Freeze exact tree/hashes and request one fresh read-only review for split authority, state loss, rollback race, stale-task mutation, discovery duplication, and accidental Phase A behavior.
- [ ] Disposition findings and rerun affected gates. Do not install or cut over in this task unless the user separately authorizes it.

### Task 8: Perform the consolidated explicit local cutover

- [ ] Record current doctor/status and prove no active/unknown Agent.
- [ ] Back up and atomically move the data namespace, promote the final accepted candidate to `/data/CoordExp/cc-plugin-codex`, refresh/install that identity, and disable/remove the old enabled record.
- [ ] Before starting Codex, prove exactly one enabled MCP identity and run zero-model-cost installed release smoke for the final accepted public generation (eight operations when Phase B is included).
- [ ] On failure, follow the evidence-gated rollback and re-run doctor/status; never roll back across unsettled new work.

### Task 9: Run the fresh Codex witness for the final generation

- [ ] In a new Codex task, prove the final accepted HarnessDock catalog is model-visible (eight Skills/tools when Phase B is included) and the old identity is absent.
- [ ] With explicit real-Claude authorization, spawn one read-only Agent, wait for terminal completion, issue one exact valid follow-up, list it, and read one bounded native assistant message.
- [ ] Record actual loaded source path, installed snapshot, data lineage, mutation witness, cutover/backup receipts, and rollback readiness.
- [ ] Update the cross-session handoff with the exact released tree and all Phase 0/A/B receipts; do not publish, push, archive, or physically rename source paths implicitly.

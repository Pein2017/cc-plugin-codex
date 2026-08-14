## 1. Freeze Identity And Compatibility Boundaries

- [x] 1.1 Add failing identity-map tests for display name, Plugin/Skill slug, MCP namespace, package/bin name, data namespace, runtime-home environment key, public author/link, disclaimer, license, and private-email absence.
- [x] 1.2 Add failing repository-wide contract tests that permit historical `cc-for-pein`/`cc_for_pein` text only in archives, changelog/history, migration fixtures, and this change, while rejecting it from current public/runtime surfaces.
- [x] 1.3 Capture the current seven tool schemas, seven Skill contracts, runtime facade, Claude Driver receipts, and representative valid legacy Agent/state fixtures so the rename cannot change behavior.
- [x] 1.4 Verify no active or unknown Agent turn exists before any installed-state migration or Plugin cutover is attempted.

## 2. Rename Checkout-Owned Plugin Surfaces

- [x] 2.1 Move `plugins/cc-for-pein/` to `plugins/codex-harnessdock/`, rename bootstraps to `harnessdock-mcp.mjs` and `harnessdock-runtime.mjs`, and mechanically rename its manifest, asset, seven Skill, and discovery-metadata references without altering operation semantics.
- [x] 2.2 Rename package/bin metadata to `codex-harnessdock-runtime`, update the lockfile mechanically, and retain `package.json` as the only manual base-version source.
- [x] 2.3 Update Plugin and marketplace manifests, icons/logos, README, NOTICE, examples, docs, and current tests to the HarnessDock identity, Pein2017 public link, Apache-2.0, and unofficial third-party disclaimer.
- [x] 2.4 Remove private email from distributable metadata and add a test that no secret/private-contact field is emitted by package, Plugin, marketplace, doctor, or receipt surfaces.

## 3. Rename The Typed MCP And Skill Namespace

- [x] 3.1 Add failing MCP catalog tests for one server `codex_harnessdock`, exactly seven unchanged operation names/schemas, and absence of `cc_for_pein`.
- [x] 3.2 Rename MCP server metadata, bootstrap registration, public stale-task code to `HARNESSDOCK_MCP_RESTART_REQUIRED`, generation wiring, call-worker wiring, and test fixtures while keeping `runtime/index.mjs` the sole lifecycle facade.
- [x] 3.3 Update all seven Skills and their discovery metadata to `$codex-harnessdock:*` and `mcp__codex_harnessdock__*`; retain Experimental status, tool semantics, and shell-fallback prohibition.
- [x] 3.4 Prove stale old-generation MCP processes fail before lifecycle mutation and instruct a versioned refresh plus fresh Codex task.
- [x] 3.5 Update the descriptor-only bootstrap contract so only `codex_harnessdock` is enabled/discoverable; keep any pre-cutover descriptor solely in the rollback backup and retain only new-identity discovery shells.
- [x] 3.6 Run focused MCP, Plugin contract, Skill budget/discovery, bootstrap, and generation tests.

## 4. Move The Durable Data Namespace Safely

- [x] 4.1 Add failing path tests for default `${CODEX_HOME}/plugins/data/codex-harnessdock`, test/operator override `CODEX_HARNESSDOCK_RUNTIME_HOME`, and rejection/absence of current `cc`/`CC_RUNTIME_HOME` ownership after cutover.
- [x] 4.2 Implement one exact state-cutover helper that preflights no active/unknown ownership, validates old/new paths, creates a recoverable backup, atomically renames on the same filesystem, preserves owner/mode, and emits only a bounded non-secret receipt.
- [x] 4.3 Add tests for happy-path move, nonempty destination, cross-device refusal, malformed state, active/unknown Agent, backup failure, interrupted move, permission mismatch, idempotent already-migrated inspection, and rollback.
- [x] 4.4 Update doctor/status/operator diagnostics to report the new data namespace and explicitly distinguish pending, migrated, conflicting, and rollback-required states without exposing model-facing path selectors.
- [x] 4.5 Prove representative legacy Agent/job/mailbox/completion/native-session records remain byte/meaning preserving across the directory move.

## 5. Update Local Refresh, Install, And Release Tooling

- [x] 5.1 Add failing tooling tests for new Plugin identity discovery, canonical runtime bootstrap, source manifest derivation, Cache snapshot names, enabled-record replacement, and old/new duplicate rejection.
- [x] 5.2 Update local refresh/install/doctor/release-smoke scripts to prepare and activate only `codex-harnessdock`, without loading code from a versioned Cache path or development worktree.
- [x] 5.3 Retain `/data/CoordExp/cc-plugin-codex` as the canonical executable checkout and explicitly test that the new public identity does not imply the later physical source rename.
- [x] 5.4 Preserve bounded discovery-only compatibility shells only where required for already recorded snapshots; do not retain a live `cc_for_pein` lifecycle server alias.
- [x] 5.5 Add rollback tooling that disables the new identity, restores the state backup and old enabled record only when no new turn is active/unknown, then re-runs old doctor/status.

## 6. Prove Behavior-Preserving Seven-Operation Parity

- [x] 6.1 Run captured contract tests proving spawn, send, follow-up, wait, interrupt, list, and read-message inputs/receipts are behaviorally unchanged apart from namespaces/identity metadata.
- [x] 6.2 Run legacy state/session/recovery tests proving no Agent conversion, root crossover, mailbox reorder, completion loss, model/topology drift, or Claude execution-profile change.
- [x] 6.3 Run an isolated fake-Claude vertical path through renamed MCP bootstrap to `runtime/index.mjs`, detached worker, completion, exact follow-up, list, and read-message behavior.
- [x] 6.4 Prove tests and default smoke do not start Codex/Claude/OpenCode/provider model work and do not alter production Agent data.
- [x] 6.5 Update usage-ledger fixtures/reporting to count `codex_harnessdock`, admit `cc_for_pein` only before the recorded cutover timestamp, reject post-cutover legacy traffic, and preserve replay-safe totals across the transition.

## 7. Verify The Candidate Tree Before Cutover

- [x] 7.1 Run all focused identity, package, path, state migration, MCP, Skill, Plugin, installer, doctor, release-smoke, legacy, and fake-Claude tests.
- [x] 7.2 Run `npm run check`, `git diff --check`, `openspec validate rename-to-codex-harnessdock --strict`, and `openspec validate --all --strict` from the exact candidate tree.
- [x] 7.3 Inspect the complete status/diff and search current runtime/public surfaces for stale old identity, private email, dual server registration, versioned Cache runtime dependency, and accidental physical checkout rename.
- [x] 7.4 Freeze the exact tree and obtain one fresh read-only architecture/migration review covering split lifecycle authority, state loss, rollback safety, stale-task behavior, public metadata, and Phase A/B ordering.
- [x] 7.5 Disposition every review finding and rerun all affected focused/full gates without installing or cutting over implicitly.

## 8. Execute The Consolidated Explicit Local Cutover

- [ ] 8.1 After separate user authorization, record old doctor/status, confirm zero active/unknown Agents, create the backup, and atomically move the data namespace.
- [ ] 8.2 After Phase A/B candidate acceptance, promote the exact final tree to the canonical production checkout, refresh/install only that new identity, disable/remove the old enabled entry, and prove only one MCP identity is registered before starting a Codex task.
- [ ] 8.3 Run zero-model-cost installed release smoke proving the matching final snapshot, the final accepted catalog (eight Skills/tools when Phase B is included), isolated inspection, correct source provenance, and absence of concurrent old identity.
- [ ] 8.4 On any failure, stop new lifecycle work and follow the evidence-gated rollback; never restore an old runtime across active or unknown new ownership.

## 9. Run Fresh Codex Live Acceptance For The Final Generation

- [ ] 9.1 Start a fresh Codex task and prove model-visible discovery of the exact final `$codex-harnessdock:*` / `mcp__codex_harnessdock__*` catalog (eight operations when Phase B is included).
- [ ] 9.2 With explicit live authorization, prove legacy Claude spawn/terminal/follow-up/list/message behavior and the Phase B OpenCode examples through the loaded Plugin; record bounded lifecycle, route, usage, and mutation evidence only.
- [ ] 9.3 Prove the old Skill/MCP identity is absent, the loaded runtime resolves to `/data/CoordExp/cc-plugin-codex`, and the same migrated state lineage remains authoritative.
- [ ] 9.4 Record the exact accepted commit/tree, cutover and backup receipts, installed snapshot, live witnesses, rollback readiness, and all still-unproven maturity facts in a fresh Phase R handoff.
- [ ] 9.5 Leave publish, push, archive, physical production-checkout/GitHub rename, maturity runs, and later Harnesses unstarted unless separately authorized.

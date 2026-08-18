## Context

See `proposal.md` for motivation and `specs/` for behavior. The current product identity appears in four independent namespaces: the distributable Plugin/Skill slug `cc-for-pein`, MCP server `cc_for_pein`, npm/bin `cc-for-pein-runtime`, and durable data namespace `cc`. The current physical runtime checkout is `/data/CoordExp/cc-plugin-codex`, while the active planning worktree is `/data/CoordExp/cc-plugin-codex-dev`.

Serena inspection confirms that the runtime already has one public lifecycle owner in `runtime/index.mjs`, one fixed data-root resolver in `runtime/paths.mjs`, and one typed MCP catalog. This permits a behavior-preserving identity cutover without changing Claude lifecycle semantics, but only if discovery, durable state, and bootstrap paths switch as one controlled unit.

## Goals / Non-Goals

**Goals:**

- Establish one Codex-first, Harness-neutral public name before the multi-Harness API generation.
- Keep all seven existing Claude operations behaviorally identical during the rename.
- Move internal Plugin source/data namespaces to the new identity without duplicating lifecycle state.
- Prove the actually loaded identity and lifecycle from a fresh Codex task.
- Keep rollback recoverable and physical Git-source relocation independently reviewable.

**Non-Goals:**

- No Driver abstraction, public route change, eighth operation, OpenCode work, native-session reinterpretation, or model/provider benchmark.
- No source checkout/worktree/GitHub rename, historical record rewrite, public publishing, or long-term alias.

## Decisions

### 1. Freeze one identity map

| Surface | Canonical value after cutover |
| --- | --- |
| Display name | `HarnessDock for Codex` |
| Plugin and Skill slug | `codex-harnessdock` |
| MCP server namespace | `codex_harnessdock` |
| Runtime package/bin | `codex-harnessdock-runtime` |
| Durable data namespace | `codex-harnessdock` |
| Operator runtime override | `CODEX_HARNESSDOCK_RUNTIME_HOME` |
| Bootstrap basenames | `harnessdock-mcp.mjs`, `harnessdock-runtime.mjs` |
| Stale-task error code | `HARNESSDOCK_MCP_RESTART_REQUIRED` |
| License | `Apache-2.0` |
| Public author identity | `Pein2017` plus public profile URL |

The public description says that this is an unofficial third-party Codex Plugin and does not imply OpenAI sponsorship. Private email is removed from package and Plugin manifests. Existing `claude-code` Harness identity remains unchanged because it names the native Harness, not the product. Internal JavaScript export identifiers, test-only fixture variables, and legacy closed environment/error constants that do not form a public/discovery/path identity MAY retain `CC` temporarily when renaming them would add behavior risk; the bootstrap basenames, model-visible language, public stale-task code, Plugin paths, and data paths do not use that exception.

The operator usage ledger records one accepted cutover timestamp. New events must use `codex_harnessdock`; pre-cutover `cc_for_pein` events remain readable under their historical namespace only when their event time/provenance is valid. A post-cutover old-server event is identity drift, not usage. This preserves the rolling report without keeping a live legacy MCP alias.

Alternative considered: keep `cc` internally and rename only display text. Rejected because every later Harness would inherit misleading Claude/user-specific namespaces and future migrations would become harder.

### 2. Preserve behavior and change the API identity in one generation

The seven operation names remain `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, and `read_agent_messages`. Their schemas, receipts, worker semantics, Claude model/topology rules, and settlement behavior remain unchanged. Only Skill and MCP prefixes change.

The MCP API generation is bumped for the namespace transition so a long-lived old MCP process fails closed with the restart-required receipt. This is distinct from the later multi-Harness generation, which adds `list_harnesses` and required route fields.

Alternative considered: expose both MCP namespaces as aliases. Rejected because the user accepts a local breaking cutover and two discoverable servers would split lifecycle authority and confuse Codex.

### 3. Rename internal Plugin source paths now, physical Git paths later

Within the checkout, `plugins/cc-for-pein/` moves mechanically to `plugins/codex-harnessdock/`; bootstrap, asset, manifest, Skill, package-file, installer, doctor, and release-smoke references move with it. Generic runtime modules are not bulk-renamed. Claude-specific modules retain Claude names, and `runtime/index.mjs` remains the only public lifecycle facade.

The production checkout `/data/CoordExp/cc-plugin-codex`, Git common directory, remote, and GitHub repository remain fixed during Phase 0. Development continues in the successor worktree `/data/CoordExp/codex-harnessdock-dev`; the superseded `/data/CoordExp/cc-plugin-codex-dev` is clean and no longer an authority. After Phase A and Phase B acceptance, a separate Phase R change will rename the canonical production checkout to `/data/CoordExp/codex-harnessdock`, update registered worktrees/loaders/installers/AGENTS pointers/remotes as needed, and prove the loaded path again before a third Harness.

Alternative considered: rename all filesystem/Git surfaces in one step. Rejected because it combines discovery, state migration, worktree registration, and source provenance into one hard-to-rollback event before the new control plane is proven.

### 4. Move durable data atomically instead of copying it

The default data root moves from `${CODEX_HOME}/plugins/data/cc` to `${CODEX_HOME}/plugins/data/codex-harnessdock`. `CC_RUNTIME_HOME` is replaced by `CODEX_HARNESSDOCK_RUNTIME_HOME` for tests/operator diagnostics; no model-facing selector is added.

Cutover preflight requires:

1. no active Agent turn, pending handoff, or unknown settlement;
2. old state readable and internally valid;
3. new data path absent or provably empty;
4. enough local space for a timestamped backup;
5. no live old/new MCP process that could race the move.

The migration takes a recoverable backup, renames the data directory on the same filesystem, validates owner/mode and representative state, and writes a non-secret cutover receipt outside model-facing state. It never copies into two simultaneously writable stores. Tests use injected temporary roots; production code accepts no arbitrary model-facing state path.

Alternative considered: keep the old data path indefinitely. Rejected because the user explicitly wants internal paths renamed and only one local installation needs compatibility.

### 5. Use a two-stage installed cutover with one rollback boundary

Implementation may prepare the new checkout identity, then the dependent Phase A/B candidate generations and zero-cost tests, while the old Plugin remains installed. Activation is atomic from the Codex user's perspective and uses only the final accepted generation:

1. stop/drain old Agent work and record doctor/status;
2. back up and move the durable data root;
3. promote/refresh/install only the final accepted new Plugin identity from the canonical checkout;
4. remove/disable the old enabled record before starting the acceptance task;
5. start a fresh Codex task and run the exact live witness;
6. retain backup until the witness and zero-cost release smoke pass.

If any step before the fresh-task witness fails, disable the new identity, restore the data directory and old enabled record, and verify old doctor/status. If the witness fails after new lifecycle mutation, stop new work and inspect settlement before rollback; never roll back across active or unknown ownership.

The cutover script/doctor owns only Plugin identity and data movement. It does not alter Claude login/configuration, start a model turn automatically, or manage Codex itself.

### 6. Prove runtime provenance, not just manifest text

Acceptance has three layers. The first layer is sufficient to admit dependent candidate implementation; the latter two are consolidated after Phase B and are required for installed release acceptance:

- deterministic contract tests for every renamed source/metadata/reference and rejection of stale old prefixes;
- zero-model-cost installed smoke for new Plugin discovery, the final accepted operation catalog (eight Skills/tools after Phase B), isolated state, and absence of the old MCP identity;
- one separately authorized fresh Codex task using the actual loaded final Plugin to prove legacy Claude behavior and the Phase B OpenCode acceptance matrix.

The legacy-Claude portion of the final live witness reuses current behavioral requirements and records only bounded lifecycle evidence; Phase B's separate OpenCode receipts own the multi-Harness claim. A checkout test, local CLI success, marketplace record, or process exit alone cannot satisfy the loaded-Plugin witness.

### 7. Keep later plans dependent on the new identity

Phase A (`generalize-multi-harness-agent-control-plane`) must refer to HarnessDock names but still retain seven operations and no v3 public writes. It may begin from the reviewed/tested uninstalled Phase 0 candidate. Phase B (`add-opencode-explorer-driver`) alone adds the eighth operation and the explicit multi-Harness spawn generation, and may likewise begin from the accepted uninstalled Phase A candidate. Phase R performs physical production-source/deployment rename. DeepSeek Harness, Grok Build, and implementation workers remain later independent changes.

## Risks / Trade-offs

- [A stale long-lived Codex task calls the old MCP namespace] → Bump the identity generation, fail closed, and require a fresh task.
- [State is duplicated or moved while a native turn remains active] → Preflight active/unknown ownership, move rather than copy, and forbid rollback across unsettled work.
- [Mechanical path rename misses a generated/install surface] → Search tracked and installed snapshots, validate source/bootstrap provenance, and make any current old prefix fail acceptance.
- [Removing compatibility immediately makes rollback harder] → Retain an out-of-band backup and old checkout metadata until the fresh-task witness passes, but never enable both identities simultaneously.
- [OpenAI affiliation is implied by the name] → Include the unofficial third-party disclaimer in public metadata and documentation.
- [Physical paths remain semantically old] → Make the temporary path boundary explicit and schedule Phase R after Phase B, before the third Harness.

## Migration Plan

1. Add failing identity/source/data-root/manifest/bootstrap/Skill/MCP/release-smoke tests.
2. Rename checkout-owned Plugin source/assets/bootstrap/Skill paths and update package/manifests/docs without changing runtime behavior.
3. Rename MCP/Skill/package/data namespaces and add exact old-prefix rejection plus state-move/rollback tooling.
4. Run focused tests, `npm run check`, strict OpenSpec validation, and full diff/path scans.
5. Obtain independent read-only review and record exact candidate acceptance; Phase A and then Phase B may proceed sequentially without installing this intermediate generation.
6. After the Phase B candidate is accepted, stop for explicit cutover authorization. Drain Agents, back up/move state, promote the final tree to the canonical production checkout, refresh the new identity, remove the old enabled entry, and run zero-cost installed smoke for the final generation.
7. Start a fresh Codex task for the loaded final-generation Claude/OpenCode witnesses. Retain or restore the single authoritative identity based on their result.
8. Record the final accepted tree, cutover receipt, backup location, live witnesses, rollback state, and Phase R handoff. Do not publish, push, archive, or physically rename the production checkout implicitly.

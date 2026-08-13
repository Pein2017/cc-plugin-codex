# Preserve Versioned Skill Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the two newest historical Plugin Skill/bootstrap paths even when Codex deletes the old Cache before local refresh starts.

**Architecture:** OpenSpec change `preserve-versioned-skill-shells` is the sole design and completion authority. Add one shared compatibility-shell owner outside volatile Cache; installation uses its mutation API, while doctor and release smoke use its read-only projection.

**Tech Stack:** Node.js 20.19+ ESM, `node:test`, Codex local Plugin CLI, repository-local OpenSpec.

## Global Constraints

- Follow every requirement and scenario under `openspec/changes/preserve-versioned-skill-shells/`.
- Store no historical executable runtime source and route every bootstrap to `/data/CoordExp/cc-plugin-codex`.
- Retain at most current plus two predecessor archives; restore at most two non-current Cache shells.
- Do not change the seven MCP tools, public lifecycle schemas, or MCP API generation.
- Do not install, release, push, or mutate production Plugin data during implementation acceptance.

---

### Task 1: Shared archive owner

**Files:**
- Create: `runtime/plugin-compatibility-shells.mjs`
- Create: `tests/runtime/plugin-compatibility-shells.test.mjs`

**Interfaces:**
- Produces: closed discovery whitelist; archive/cache inspection; install staging, restore, and success-commit operations.
- Consumes: `CODEX_HOME`, installed snapshot/version, canonical checkout constant.

- [x] Write tests that require a private `plugins/data/cc/compatibility-shells/v1` archive, exact allowlisted files, atomic three-version coverage, and fail-closed malformed/symlink/extra-file handling.
- [x] Run `node --test tests/runtime/plugin-compatibility-shells.test.mjs` and confirm the missing module/API is the failure.
- [x] Implement only the bounded owner required by those tests.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Installer recovery before host cleanup

**Files:**
- Modify: `scripts/local-plugin-install.mjs`
- Modify: `tests/runtime/local-plugin-install.test.mjs`

**Interfaces:**
- Consumes: Task 1 staging/restore/commit API.
- Produces: install receipt fields for coverage state, expected predecessor, and retained versions.

- [x] Add a fake-Codex regression where the known predecessor is absent from Cache before the installer starts but remains in durable archive; assert it is restored.
- [x] Add missing-known-predecessor, first-migration, same-version refresh, and failed-install no-coverage-advance cases.
- [x] Run the installer test and confirm the pre-pruned predecessor case fails for the current Cache-only implementation.
- [x] Replace the script-local backup owner with the shared archive workflow and re-run the suite.

### Task 3: Read-only acceptance projection

**Files:**
- Modify: `runtime/plugin-installation.mjs`
- Modify: `runtime/operator-diagnostics.mjs`
- Modify: `runtime/release-smoke.mjs`
- Modify: `tests/runtime/operator-diagnostics.test.mjs`
- Modify: `tests/runtime/release-smoke.test.mjs`

**Interfaces:**
- Consumes: Task 1 read-only inspection result.
- Produces: `coverageState`, `expectedPredecessor`, `managedVersions`, `retainedVersions`, `archiveValid`, and `coverageComplete` in operator evidence.

- [x] Add failing tests proving zero shells is advisory only for first migration and failure for a known missing predecessor.
- [x] Reuse the shared projection in doctor and release smoke without repair side effects.
- [x] Run the three focused suites and confirm all new cases pass.

### Task 4: Agent-visible contract and acceptance

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `plugins/cc-for-pein/skills/*/SKILL.md`
- Modify: `tests/runtime/plugin-contract.test.mjs`
- Modify: `openspec/changes/preserve-versioned-skill-shells/tasks.md`

**Interfaces:**
- Produces: one concise release-drift rule shared by all seven lifecycle Skills.

- [x] Add contract assertions for retained exact Skill use, emergency fallback warning, and MCP-generation restart requirement; confirm they fail.
- [x] Update all seven Skills plus operator docs and changelog, then rerun the contract test.
- [x] Run `openspec validate preserve-versioned-skill-shells --strict`, `npm run check`, and `git diff --check`.
- [x] Mark OpenSpec tasks complete only after the corresponding fresh command evidence succeeds.

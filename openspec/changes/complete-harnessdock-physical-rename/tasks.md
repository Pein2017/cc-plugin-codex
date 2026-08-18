## 1. Environment-Prefix Flag Day

- [x] 1.1 Rename every `CC_*` environment variable in runtime/, scripts/, and plugins/ bootstraps to `CODEX_HARNESSDOCK_*`, updating the environment allowlists and every reader/writer in the same pass with no aliases or fallbacks.
- [x] 1.2 Update every test and fixture to the new names and add a repo-wide guard test proving no tracked source, script, plugin, or test file references a `CC_` variable outside an explicit historical allowlist.
- [x] 1.3 Run the focused environment/bootstrap suites and the complete `npm run check`.

## 2. Neutral Internal Names And Wording

- [x] 2.1 Remove the `createClaudeRuntime` export and update every checkout-owned caller and bootstrap to `createAgentRuntime`.
- [x] 2.2 Rename `createInternalClaudeRuntime` to `createInternalAgentRuntime` and class `ClaudeRuntime` to `InternalAgentRuntime` as mechanical, test-proven renames; genuinely Claude-specific modules and symbols keep their Claude names.
- [x] 2.3 Replace "CC Agent" and "CC MCP" wording in operator- and model-facing runtime text with "HarnessDock Agent"/"HarnessDock MCP" where the sentence means the neutral surface and "Claude Agent" where it is Claude-specific.
- [x] 2.4 Extend the token-absence guard to `CC Agent`, `CC MCP`, and `cc-for-pein` outside the historical allowlist.

## 3. Durable Vocabulary And Ledger

- [x] 3.1 Change the job-identifier generator prefix from `cc-agent-` to `hd-agent-` with tests; add no old-prefix reader compatibility (no pre-reset record survives).
- [x] 3.2 Remove the `cc_for_pein` legacy usage-ledger admission and its cutover-timestamp branching so the report reads exactly `codex_harnessdock` events, with tests updated.
- [x] 3.3 Run the focused ledger/job suites, `npm run check`, and both OpenSpec strict validations.

## 4. Paths In Source And Documents

- [x] 4.1 Update the promotion constants to `/data/CoordExp/codex-harnessdock` (live, `main`) and `/data/CoordExp/codex-harnessdock-dev` (development, `developer`), and update every install/smoke/doctor path expectation, README, and current docs reference in the same commit.
- [x] 4.2 Add a guard proving no tracked file references `/data/CoordExp/cc-plugin-codex` outside the historical allowlist (CHANGELOG, archived changes, dated handoffs, provenance).

## 5. Relocation Runbook (Operator-Executed)

- [ ] 5.1 Freeze the candidate, then relocate: move the live checkout to `/data/CoordExp/codex-harnessdock`, run `git worktree repair`, fast-forward `developer` and check it out in `/data/CoordExp/codex-harnessdock-dev`, remove the `/data/CoordExp/cc-plugin-codex-dev` worktree, and delete the reference-only `/data/CoordExp/external/cc-plugin-codex` clone.
- [ ] 5.2 Rename the GitHub repository in place to `Pein2017/codex-harnessdock` and update `origin` in both worktrees; verify a fetch through the new name.
- [ ] 5.3 Rebind the `pein-local` marketplace to the new source root, perform the initial install of the new path, and cut release 0.20.0 (version, changelog, derived cachebuster, lockfile sync in one commit) followed by `release:local` and an app-server restart.
- [ ] 5.4 Reset durable state exactly once: fresh backup tarball, hard zero-active/unknown-Agent verification, then remove and recreate the data namespace; record the reset timestamp beside the backup.
- [ ] 5.5 Run the installed release smoke at 0.20.0 and one fresh Codex-task discovery witness; record both receipts.

## 6. Acceptance

- [ ] 6.1 Run the complete gates at the new paths and prove the gated promotion end-to-end from the new development worktree.
- [ ] 6.2 Commission one fresh read-only review focused on retired-token absence, promotion integrity at the new paths, and reset safety; disposition any finding and rerun affected gates.
- [ ] 6.3 Record the final receipts (tree, versions, witness, reset evidence) and archive this change.

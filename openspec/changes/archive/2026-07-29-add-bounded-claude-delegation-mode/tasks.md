## 1. Contract Tests

- [x] 1.1 Add typed-schema tests for the four required spawn fields, removed public selectors, optional delegation mode, and unchanged seven-tool catalog.
- [x] 1.2 Add runtime tests for pre-state model/mode/tool rejection, immutable follow-up inheritance, and legacy leaf normalization.
- [x] 1.3 Add adapter/profile/compatibility tests for appended instructions, hard leaf Agent denial, Fable exemption, resume/recovery reconstruction, and required CLI flags.
- [x] 1.4 Add public projection and Plugin contract tests for the five lifecycle statuses and simplified skill guidance.

## 2. Durable Delegation Policy

- [x] 2.1 Persist immutable Agent delegation mode, default legacy records to leaf, and carry resolved mode in prepared job evidence.
- [x] 2.2 Validate Fable-only orchestration and conflicting leaf Agent allowlists before readiness or durable mutation.
- [x] 2.3 Inherit delegation mode across active delivery, exact-session follow-up, safe-fresh retry, reconnect, and detached recovery.

## 3. Claude Execution Boundary

- [x] 3.1 Make the execution profile own the common, leaf, and Fable-orchestrator appended instruction envelopes.
- [x] 3.2 Serialize `--append-system-prompt` and `--disallowedTools Agent` without replacing native Claude configuration.
- [x] 3.3 Extend zero-model Claude compatibility admission and doctor diagnostics to require both emitted flags.

## 4. Public Surface Slimming

- [x] 4.1 Require public spawn write intent, remove public fork/profile selectors, and expose optional delegation mode through MCP and operator lifecycle CLI.
- [x] 4.2 Map internal lifecycle facts to `starting`, `working`, `completed`, `failed`, and `interrupted` in model-facing receipts without migrating stored states.
- [x] 4.3 Update all seven skill instructions, discovery metadata, README, changelog, manifest/package version, and CLI help with the bounded delegation contract.

## 5. Acceptance And Release

- [x] 5.1 Run focused runtime, MCP, CLI, compatibility, Plugin-contract, and migration tests plus strict OpenSpec validation.
- [x] 5.2 Run `npm run check` and independently review the combined dirty checkout; disposition every finding.
- [x] 5.3 Refresh the checkout-owned local Plugin and validate the installed snapshot from the canonical source.
- [x] 5.4 Run one explicit Haiku 4.5/low write-leaf denial witness in a new Plugin task, proving `Agent` remains unavailable with dangerous permission bypass; stop real CC tests on any subscription or usage-limit error.
- [x] 5.5 Sync delta specs, archive the completed OpenSpec change, and verify the final checkout has no active change.

## Acceptance Evidence

- `npm run check`: 206 unit tests and 14 integration tests passed with lint and typecheck.
- Real Haiku 4.5/low write-leaf witness: `dangerouslySkipPermissions=true`, `disallowedTools=["Agent"]`, appended system prompt present, no tool use, final `CC_LEAF_AGENT_DENIED`.
- Independent Sol/high review: all reported findings dispositioned; bounded re-review returned PASS.
- Installed snapshot: `cc-for-pein@pein-local` `0.5.0+codex.20260729075555`; doctor and zero-model release smoke passed.

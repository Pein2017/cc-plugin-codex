# Phase R handoff — physical rename prerequisites and scope (2026-08-18)

Written at activation close-out (rename-change task 9.4). Phase R is a separate
authorized change with its own OpenSpec; nothing here starts it.

## What Phase R is

One mechanical pass that renames the remaining `cc-`/`CC` identifiers and the
physical source locations to HarnessDock names. It runs after Phase B (done)
and before a third Harness is admitted, so exactly one generation carries both
the rename and a two-Harness surface. The durable data namespace is already
`codex-harnessdock` (cutover executed 2026-08-18T01:11:49Z), so Phase R is
source-only: no data migration, no history rewrite.

## Measured rename surface (inventoried at commit `1937f77`)

1. **Physical checkouts and Git identity.** `/data/CoordExp/cc-plugin-codex`
   (production, loaded source), `/data/CoordExp/cc-plugin-codex-dev`
   (promotion vehicle on `developer`), and the GitHub repository name. The
   promotion script's hardcoded `LIVE_CHECKOUT`/`DEVELOPMENT_CHECKOUT`
   constants and the marketplace binding in `~/.codex/config.toml`
   (`[marketplaces.pein-local] source`) move with them. Seven files reference
   the production path.
2. **Environment-variable prefix.** ~30 `CC_*` names (`CC_CLAUDE_BIN`,
   `CC_HARNESS_*`, `CC_RUNTIME_*`, `CC_TRUSTED_OWNER_ROOT_ID`,
   `CC_OPENCODE_BIN`, …) across runtime and scripts. Operator-facing ones need
   a bounded compatibility window or a documented flag-day; test-only ones do
   not.
3. **Claude-named public seams.** The bounded `createClaudeRuntime` alias,
   `createInternalClaudeRuntime`, class `ClaudeRuntime`, and "CC Agent"
   strings in operator/model-facing messages (~22 sites). Phase A deliberately
   deferred these ("add narrow new modules and aliases first; defer bulk
   symbol moves until another stable Driver exists" — that Driver now exists).
4. **Durable-vocabulary identifiers that must NOT change.** `cc-agent-` job-id
   prefixes are embedded in existing durable records, and
   `runtime/operator-usage-ledger.mjs` intentionally reads pre-cutover
   `cc_for_pein` history under the recorded cutover timestamp. Phase R renames
   generators only where old records remain readable; it never rewrites
   durable state.

## Prerequisites — all hold as of this handoff

- Phase B complete (53/53), evaluation verdict GO, activation runbook executed
  end to end; installed smoke passes at the final tree.
- No active or unknown Agent work blocking a source move (verified at cutover;
  re-verify at Phase R start with `list-agents --all`).
- Data cutover landed and its dual-namespace backup
  (`~/harnessdock-data-backup-20260818T011058Z.tgz`) is retained.
- Still open before archive, not blocking Phase R planning: the fresh-Codex
  loaded-Plugin discovery witness (rename task 9.1) and the separately
  authorized live legacy-Claude witness (task 9.2) await the user's first new
  Codex task and explicit live authorization respectively.

## Ordering constraints

Rename the physical checkouts and Git identity first (one move, verified by
re-running the promotion and smoke paths), then the env prefix with its
compatibility window, then the internal symbol/message pass. Keep the
generation stable: Phase R adds no operation and changes no schema, so it must
not bump the MCP API generation.

# Complete the HarnessDock physical rename (Phase R)

## Why

Phase 0 renamed the public identity and the activation cut the data namespace
over, but the physical sources, the environment-variable prefix, a set of
Claude-era internal names, and the durable vocabulary still carry the old
`cc`/`CC` identity. The roadmap requires exactly one generation to carry both
the finished rename and the two-Harness surface, before a third Harness is
admitted. The user has additionally authorized discarding all existing durable
Agent state, which removes every backward-compatibility obligation the earlier
Phase R sketch had to carry.

## What Changes

- **Physical sources and Git identity.** The live checkout moves from
  `/data/CoordExp/cc-plugin-codex` to `/data/CoordExp/codex-harnessdock`
  (branch `main`) by one filesystem move plus `git worktree repair` — never a
  fresh clone, so the shared Git common directory and history survive. The
  existing `/data/CoordExp/codex-harnessdock-dev` worktree becomes the sole
  development worktree on branch `developer`. The GitHub repository
  `Pein2017/cc-plugin-codex` is renamed in place to `Pein2017/codex-harnessdock`
  (rename, not re-creation: history, issues, and redirects survive) and both
  remotes are updated. The superseded `/data/CoordExp/cc-plugin-codex-dev`
  worktree and the reference-only `/data/CoordExp/external/cc-plugin-codex`
  clone are removed.
- **Environment prefix.** Every `CC_*` runtime/script/test variable becomes
  `CODEX_HARNESSDOCK_*` (the prefix the runtime home variable already uses) in
  one flag-day pass with no compatibility shims.
- **Internal Claude-era names.** The `createClaudeRuntime` alias is removed;
  `createInternalClaudeRuntime`/`ClaudeRuntime` become neutral internal names;
  "CC Agent"/"CC MCP" strings in operator- and model-facing text become
  HarnessDock (or precise Claude) wording. Genuinely Claude-specific modules
  (`claude-code-driver`, `claude-legacy-adapter`, …) keep their names.
- **Durable vocabulary and fresh state.** New job identifiers use the
  `hd-agent-` prefix; the `cc_for_pein` legacy usage-ledger admission is
  removed; and — under the explicit discard authorization — the durable data
  namespace is reset to a fresh start after one final backup, with zero active
  or unknown Agents as a hard precondition.
- **BREAKING (operator-facing, authorized):** old `CC_*` environment names stop
  working, existing durable Agent history is discarded (backups retained), and
  the checkout paths every document names move once.

## Impact

Affected specs: `local-development-promotion`, `local-runtime-boundary`,
`typed-mcp-orchestration`, `canonical-agent-orchestration`,
`claude-session-execution`, `native-claude-team-orchestration`,
`runtime-operations-diagnostics`, `operator-usage-ledger`,
`plugin-identity-transition`.
Affected code: runtime/, scripts/, tests/, plugins/ metadata, README/docs, the
promotion constants, `~/.codex/config.toml` marketplace binding and
`writable_roots` (operator steps), and the installed Plugin (re-bind, initial
install, release 0.20.0, Codex restart, smoke, witness).
The MCP API generation does not change: no operation is added and no schema
changes.

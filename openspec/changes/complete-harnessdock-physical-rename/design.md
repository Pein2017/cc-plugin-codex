# Design — complete the HarnessDock physical rename

## Context

Everything user-visible is already HarnessDock (Phase 0 + activation); what
remains is the physical and internal residue: paths, the `CC_` prefix,
Claude-era neutral names, and the durable vocabulary. The discard
authorization for existing durable state makes every rename below a flag-day
change with no shims.

## Decisions

### 1. Move, repair, and rebind — never re-clone

`/data/CoordExp/cc-plugin-codex` is the main worktree holding the shared Git
common directory; `git worktree list` binds two linked worktrees to it. The
relocation is `mv` + `git worktree repair` from the moved root, which
preserves the common directory, all branches, and the promotion invariant
("live and development share one Git common directory"). A fresh clone would
fork history and break the gated promotion. The GitHub repository is renamed
in place (`gh repo rename codex-harnessdock`) so old URLs redirect; both
worktrees then update `origin` with `git remote set-url`.

### 2. One development worktree, the existing one

`/data/CoordExp/codex-harnessdock-dev` already exists, holds the entire Phase
A/B lineage, and is correctly named. It becomes the spec's development
worktree by checking out `developer` (fast-forwarded to the current head,
which equals `main`). The old `/data/CoordExp/cc-plugin-codex-dev` worktree is
removed with `git worktree remove` once `developer` is rehomed; the
reference-only `/data/CoordExp/external/cc-plugin-codex` clone is deleted
outright. The promotion script's two checkout constants and its branch
expectations are updated in the same commit that the runbook executes before
the move.

### 3. Flag-day identifier renames, scoped by meaning

- `CC_*` → `CODEX_HARNESSDOCK_*` everywhere (runtime, scripts, tests, docs);
  the precedent is `CODEX_HARNESSDOCK_RUNTIME_HOME`. No aliasing.
- Neutral internals lose Claude-era names: the `createClaudeRuntime` export is
  removed (its callers are checkout-owned), `createInternalClaudeRuntime` →
  `createInternalAgentRuntime`, class `ClaudeRuntime` → `InternalAgentRuntime`.
- "CC Agent"/"CC MCP" wording becomes "HarnessDock Agent"/"HarnessDock MCP"
  where it means the neutral plugin surface, and "Claude Agent" where the
  sentence is genuinely Claude-specific (the Auto Memory and native-team
  requirements). Claude-specific module files keep their names — renaming the
  Claude Driver away from "claude" would be false neutrality.
- New job identifiers use `hd-agent-`; the generator is the only owner. No
  reader keeps `cc-agent-` compatibility because no pre-reset record survives.

### 4. Fresh durable state, once, gated

The data namespace reset is the single irreversible step: one final tar backup
of `/data/CoordExp/.codex/plugins/data/codex-harnessdock`, a hard
zero-active/unknown-Agent check, then removal and fresh start. The
`cc_for_pein` legacy usage-ledger admission and its cutover-timestamp logic
are deleted rather than renamed — the report reads `codex_harnessdock` events
only. Release is 0.20.0 with the cachebuster/lockfile lesson applied (bump,
changelog, derive, lockfile sync in one commit).

### 5. Verification shape

The rename is proven by absence and by behavior: repo-wide guards that no
tracked source/test/doc file matches the retired tokens (with an explicit
allowlist for historical documents: CHANGELOG, archived changes, ledger
history, provenance sections); the full check suite; the gated promotion
running end-to-end at the new paths; installed smoke at 0.20.0; and one fresh
Codex-task discovery witness after restart.

## Risks / Trade-offs

- [Moving the live checkout breaks the installed bootstrap until reinstall] →
  The runbook orders code-first, then move, then marketplace re-add +
  `install:local --initial` + `release:local`, then restart; the old snapshot
  fails closed in the interim, which is the designed behavior.
- [A missed `CC_*` reference fails at runtime, not compile time] → the
  token-absence guard tests plus the full suite make a miss loud; the discard
  removes the silent-compatibility class entirely.
- [Renaming the GitHub repo breaks CI/clones elsewhere] → GitHub redirects
  old URLs; the only known consumers are the two local worktrees, updated in
  the same runbook step.

## Migration Plan

Implement and gate the source rename in the development worktree; execute the
relocation runbook (move, repair, rebind, reinstall, reset, restart, smoke,
witness) as explicit operator steps; then archive. Rollback before the
namespace reset is a reverse move plus reinstall of 0.19.0; after the reset,
restore is from the final backup only.

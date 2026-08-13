## Context

See `proposal.md` for motivation and the three delta specs for behavior. Codex
owns `plugins/cache/**` and its Plugin Store deliberately removes older version
directories during installation. The current installer temporarily copies old
shells from that same volatile directory, so it cannot recover a version that
the host removed before the installer begins. Runtime source must remain solely
checkout-owned.

## Goals / Non-Goals

**Goals:**

- Give discovery-shell persistence one owner shared by install, smoke, and doctor.
- Preserve exact historical Skill/bootstrap descriptors without retaining old
  runtime modules.
- Make predecessor coverage explicit and fail before destructive Plugin install
  when a previously managed predecessor cannot be reconstructed.
- Keep archive size, file inventory, identifiers, and permissions bounded.

**Non-Goals:**

- No daemon, filesystem watcher, symlink trick, full Plugin snapshot, or automatic
  mutation from doctor/release smoke.
- No promise for tasks older than two predecessor versions.
- No attempt to hot-reload a task's already-discovered MCP schema or annotations.
- No generic Git-history reconstruction in production installation code.

## Decisions

### One compatibility-shell owner outside Codex Cache

Add `runtime/plugin-compatibility-shells.mjs` as the sole owner of the whitelist,
archive layout, coverage record, validation, staging, restoration, and bounded
inspection. The installer consumes its mutating operations; doctor and release
smoke consume only read-only inspection. This avoids three subtly different
definitions of a valid shell.

The archive root is
`$CODEX_HOME/plugins/data/cc/compatibility-shells/v1/`, with owner-only
directories, an atomic `coverage.json`, and `versions/<version>/` shells. It is
outside host-owned Cache but inside Plugin-owned local data. Alternatives were
keeping more Cache directories or a background repair watcher; both remain
vulnerable to host replacement or add unnecessary resident lifecycle.

### Coverage is ordered successful-version history

`coverage.json` stores only schema version, an ordered newest-first list of at
most three successfully installed version identifiers, and an update timestamp.
The first entry is the managed current version; the next two are the bounded
predecessors. No paths, prompts, sessions, environment values, or runtime data
are stored.

Before `codex plugin add`, the owner imports whitelisted shells still available
in Cache, stages the two most-recent non-current candidates, and verifies the
first known predecessor can be reconstructed from Cache or archive. Missing
known coverage fails before Codex is called. With no coverage record, any
available non-current Cache version becomes migration evidence; otherwise the
operation is explicitly first-install/migration and cannot claim predecessor
protection.

After verified installation, the owner archives the exact installed discovery
snapshot, advances coverage, restores the two staged predecessors to Cache, and
prunes archive versions outside the three-entry history. A same-version refresh
preserves predecessor order. Installation failure restores staged shells but
does not advance coverage.

### Exact allowlist and canonical route remain the safety boundary

Only the existing manifest, `.mcp.json`, seven Skill descriptors/metadata, and
three checkout-routing bootstrap files may enter an archive or restored shell.
Every archive is reconstructed into a fresh temporary directory; unrelated
files and historical runtime modules are never copied. Inspection rejects
symlinks, extra files, missing required descriptors, invalid version segments,
and bootstraps/MCP descriptors that do not delegate exclusively to
`/data/CoordExp/cc-plugin-codex`.

### Zero shells is not automatically healthy

The compatibility inspection result includes `coverageState`,
`managedVersions`, `expectedPredecessor`, `retainedVersions`, `archiveValid`, and
`coverageComplete`. Doctor and release smoke use that same projection. A fresh
migration with no predecessor is explicit advisory coverage; a known missing
predecessor is failure. This replaces the current `count <= 2` interpretation
that incorrectly calls an empty set healthy after an upgrade.

### Agent guidance preserves generation boundaries

README and all lifecycle Skill guidance state that active tasks normally keep
using their exact retained Skill path. If the path is unavailable, switching to
the latest Skill is emergency recovery only; a public MCP generation mismatch
requires a new Codex task. The guidance does not tell Agents to edit Cache or
run operator installation commands.

## Risks / Trade-offs

- **First deployment cannot prove an already-pruned 0.17 shell** → report the
  migration gap honestly; archive 0.18 for future releases and optionally use a
  separately reviewed one-time operator reconstruction, not hidden Git fallback.
- **Crash between Codex install and coverage update** → installed snapshot is
  already authoritative; the next installer run imports it and atomically
  repairs coverage without inventing a predecessor.
- **Archive tampering or partial writes** → atomic replacement, owner-only modes,
  closed file inventory, and fail-closed validation prevent it from being used.
- **Host can delete restored Cache directories again** → the durable archive
  survives and the next explicit refresh can repair them; no always-on guardian
  is added.
- **Bounded retention strands very old tasks** → two predecessors remain the
  explicit product bound; older tasks must start anew.

## Migration Plan

1. Deploy code without changing the seven MCP tools or API generation.
2. On the first local refresh, import any surviving Cache shells, archive the
   installed current descriptor, and write bounded coverage.
3. Report the existing 0.17-to-0.18 gap as unavailable if 0.17 is already gone;
   do not claim it was reconstructed.
4. Subsequent releases require the known predecessor archive before invoking
   Codex and restore it after installation.
5. Rollback removes the new archive reader/writer only after retaining the
   current installed snapshot; archived discovery files are inert and contain
   no executable runtime source.

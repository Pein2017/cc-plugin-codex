## Why

Long-lived Codex tasks retain absolute Skill paths inside the Plugin's versioned
Cache. A local release can therefore strand an active task when Codex removes
the previous Cache version before the checkout installer can preserve it; the
0.17 to 0.18 release reproduced this as a failed Skill read and unnecessary
version-recovery reasoning.

## What Changes

- Persist the exact discovery-only shell for each successfully installed local
  version in bounded owner-local Plugin data outside Codex's volatile Cache.
- Restore the two most-recent non-current shells from that archive after every
  refresh, even when the prior Cache directory disappeared before refresh began.
- Record enough bounded install coverage metadata to distinguish a first install
  from an upgrade whose known previous shell is missing.
- Make local install, doctor, and zero-cost release smoke report or fail on a
  missing expected previous shell instead of accepting zero shells silently.
- Document the active-task behavior and the restart boundary for incompatible
  MCP generations in Agent-visible Skill guidance and operator documentation.

Non-goals are retaining executable historical runtime source, promising more
than two old task versions, adding a background repair daemon, or making Skill,
schema, or MCP discovery hot-reload inside an existing Codex task.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-runtime-boundary`: Make compatibility-shell retention independent of
  the volatile Codex Cache while keeping all executable work checkout-routed.
- `plugin-release-readiness`: Require release acceptance to verify expected
  previous-version coverage, not only validate shells that happen to exist.
- `runtime-operations-diagnostics`: Distinguish first-install zero retention
  from a missing known predecessor and give an actionable repair result.

## Impact

The local installer, installed-plugin inspection, doctor, release smoke, focused
tests, README, changelog, and lifecycle Skill guidance change. The seven MCP
tools, public Agent lifecycle schemas, Claude process behavior, and runtime
source boundary do not change. The archive is Linux owner-local state under
`/data/CoordExp/.codex/plugins/data/cc/` and contains only the existing explicit
discovery whitelist.

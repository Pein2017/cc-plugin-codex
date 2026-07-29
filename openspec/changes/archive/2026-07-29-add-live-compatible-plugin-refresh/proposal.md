## Why

Codex tasks currently retain versioned Plugin Cache paths while the MCP server retains one static Node module graph. A local refresh can therefore delete paths still referenced by older tasks, and compatible checkout runtime fixes do not reach an already-running task until its MCP process restarts.

## What Changes

- Make the installed MCP descriptor launch the canonical checkout bootstrap directly instead of resolving through a versioned Cache working directory.
- Reload the checkout-owned lifecycle runtime in a fresh isolated module graph for every accepted MCP call while preserving the existing durable runtime as the only Agent/session owner.
- Add an explicit MCP API generation check so incompatible checkout changes fail with an actionable `restart required` boundary instead of running against a stale schema.
- Separate compatible development refresh from versioned release refresh: routine runtime edits need no install, same-generation discovery edits refresh in place, and schema/Skill generation changes require a versioned refresh plus a new Codex task.
- Preserve a bounded discovery-only compatibility shell for recently installed versions so an older task does not fail merely because Codex removed its Cache path.
- Update release diagnostics, documentation, and tests for the new lifecycle.

Non-goals:

- Hot-reloading Codex's already-cached Skill instructions, tool schemas, MCP annotations, or task-local tool catalog.
- Making the Plugin Cache a runtime/source owner or persisting a second Agent registry in MCP.
- Retrofitting arbitrary historical versions that were already deleted before this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-runtime-boundary`: Define compatible checkout hot reload, in-place discovery refresh, versioned release refresh, and bounded discovery-shell retention.
- `typed-mcp-orchestration`: Require per-call isolated runtime loading and an explicit incompatible-generation restart error while retaining one lifecycle owner.
- `plugin-release-readiness`: Verify stable checkout launch, current discovery identity, compatibility behavior, and the split refresh lifecycle.

## Impact

Affected areas include `runtime/mcp-server.mjs`, a new isolated MCP call worker and API-generation owner, Plugin `.mcp.json`, local install/refresh scripts, doctor/release smoke diagnostics, OpenSpec contracts, README/CHANGELOG guidance, and focused runtime/Plugin tests. No new production dependency or public Agent operation is introduced.

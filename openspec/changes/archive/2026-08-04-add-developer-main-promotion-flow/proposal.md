## Why

The checkout already hot-loads compatible runtime implementation changes, but development and live execution currently share the same `main` working tree. A persistent `developer` track is needed so incomplete edits cannot affect active Codex tasks, while tested compatible changes can still reach the live `main` runtime without unnecessary Plugin refreshes or task restarts.

## What Changes

- Establish `/data/CoordExp/cc-plugin-codex-dev` on branch `developer` as the development checkout and retain `/data/CoordExp/cc-plugin-codex` on `main` as the sole live runtime checkout.
- Add a local promotion command that validates both checkouts, requires clean and linearly promotable Git state, runs the configured acceptance checks, and fast-forwards `main` from `developer`.
- Classify the promoted diff as compatible runtime-only or restart-required, with conservative restart-required handling for ambiguous and static/discovery changes.
- Serialize promotion against new isolated MCP runtime calls so no call starts while the live checkout is being updated.
- Report the exact post-promotion action: immediate next-call activation or Plugin refresh/release plus a new Codex task.
- Keep development worktree source non-executable and preserve the canonical checkout as the only runtime dependency.

Non-goals: generic CI/CD, remote deployment automation, automatic merging of divergent history, hot-reloading Skills or MCP schemas, and supporting multiple live channels.

## Capabilities

### New Capabilities
- `local-development-promotion`: Defines the two-track checkout topology, safe linear promotion, change classification, switching exclusion, and operator receipts.

### Modified Capabilities

None.

## Impact

Adds a local operator promotion script, a small runtime promotion-lock reader, tests, package scripts, and documentation. The seven model-facing MCP tools and their current API generation remain unchanged.

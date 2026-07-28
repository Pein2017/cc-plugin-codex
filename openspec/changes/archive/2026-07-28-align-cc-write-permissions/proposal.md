## Why

The public `write` intent currently does not control terminal-parity permissions: even a read request launches Claude with `--dangerously-skip-permissions`. This makes the typed API misleading and gives read-only investigations more authority than requested; the same audit also found that `list_agents` advertises a read-only MCP annotation despite performing bounded reconciliation writes.

## What Changes

- **BREAKING**: Make omitted or false `write` intent launch terminal-parity Claude without `--dangerously-skip-permissions`; add the bypass only when `write: true` is explicitly selected.
- Require model-facing spawn guidance to choose and pass `write` explicitly, and require follow-up guidance to choose it whenever the caller intends to change the inherited permission intent.
- Reject an explicit dangerous-bypass request unless terminal-parity write access is also selected.
- Mark `list_agents` as non-read-only in MCP annotations because its lifecycle reconciliation can persist bounded state repairs.
- Keep the opt-in `safe` profile, native Claude configuration inheritance, seven-tool surface, Agent persistence, and owner scoping unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-session-execution`: Bind terminal-parity dangerous permission bypass to explicit write intent.
- `canonical-agent-orchestration`: Make the model-facing skills select the correct read/write intent instead of relying on an ambiguous default.
- `typed-mcp-orchestration`: Describe the `write` contract and advertise reconciliation-capable `list_agents` accurately.

## Impact

This changes `runtime/execution-profile.mjs`, the typed MCP schemas/annotations, the spawn and follow-up skills, repository guidance and user documentation, focused tests, and the installed local Plugin snapshot. Existing callers that omit `write` will no longer receive dangerous permission bypass and must pass `write: true` for authorized mutation work.

## Why

CC lifecycle operations are currently model-invoked through long shell commands whose argument quoting, checkout bootstrap path, and terminal-session behavior add cognitive load without adding orchestration semantics. Codex Plugin MCP support can expose the same seven durable operations as typed calls while the proven checkout-owned runtime remains the only owner of Agents, jobs, mailboxes, Claude sessions, and background workers.

## What Changes

- Add a local stdio MCP server named `cc_for_pein` to the existing Plugin.
- Expose exactly the existing seven canonical operations as typed MCP tools: `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, and `read_agent_messages`.
- Make `spawn_agent` and activating follow-up return after the existing durable background handoff; make `wait_agent` remain an explicit bounded join that returns early on eligible progress or completion.
- Derive root ownership from Codex `threadId` metadata and workspace scope from Codex sandbox-state metadata rather than accepting caller-supplied cwd, environment, root, or native Claude-session selectors.
- Keep the installed MCP bootstrap descriptor-only and delegate executable behavior to `/data/CoordExp/cc-plugin-codex`.
- Update the seven Experimental skills to guide typed MCP calls while retaining the checkout CLI only as an operator/debug fallback.
- Configure the MCP tool timeout with enough margin for the public one-hour maximum wait without changing Agent execution lifetime.
- Do not add a generic MCP background-terminal/session abstraction, a second supervisor, automatic parent wake-up after a Codex turn ends, or a destructive cancellation operation.

## Capabilities

### New Capabilities
- `typed-mcp-orchestration`: Defines Plugin MCP discovery, typed schemas, Codex context binding, synchronous call boundaries, structured receipts, cancellation, and checkout delegation.

### Modified Capabilities
- `canonical-agent-orchestration`: Makes typed MCP tools the normal model-facing invocation path for the existing seven operations while preserving their established semantics.
- `local-runtime-boundary`: Extends the fixed checkout, environment, owner-root, and inherited-workspace boundary to MCP startup and per-call context.

## Impact

- Adds a pinned MCP SDK runtime dependency and a checkout-owned stdio MCP entrypoint.
- Adds `plugins/cc-for-pein/.mcp.json`, an installed bootstrap, manifest MCP metadata, and typed tool schemas.
- Updates Plugin skills, README/CHANGELOG, contract tests, fake/integration MCP coverage, and local installation validation.
- Requires a Plugin refresh and a new Codex task before the new MCP server and tool catalog become visible.

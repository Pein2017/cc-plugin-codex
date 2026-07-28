## 1. MCP Transport And Context

- [x] 1.1 Add exact MCP SDK and schema dependencies to the checkout lockfile.
- [x] 1.2 Make bounded runtime observation abortable without changing Agent execution or public lifecycle inputs.
- [x] 1.3 Implement the checkout-owned stdio MCP server with exactly seven typed tools, trusted Codex metadata binding, structured receipts, and sanitized errors.
- [x] 1.4 Add the descriptor-only installed MCP bootstrap, `.mcp.json`, manifest declaration, fixed 3660-second timeout, and checkout delegation.

## 2. Model-Facing Guidance

- [x] 2.1 Update all seven Experimental skills and discovery prompts to use the matching typed MCP tools without silent shell fallback.
- [x] 2.2 Document typed calls, asynchronous spawn versus explicit wait, operator CLI fallback, timeout semantics, and Plugin refresh expectations in README and CHANGELOG.

## 3. Verification

- [x] 3.1 Add focused context-binding, schema, cancellation, structured-receipt, and stdio protocol tests without starting real Claude.
- [x] 3.2 Extend Plugin and runtime integration contracts for MCP discovery, checkout ownership, exact seven-tool parity, and one-hour timeout margin.
- [x] 3.3 Run one Haiku 4.5 low-effort real MCP spawn/wait smoke unless Claude reports an account limit, in which case stop real CC testing and retain local verification.
- [x] 3.4 Run skill validation, Plugin validation, `npm run check`, `git diff --check`, and strict OpenSpec validation.

## 4. Lifecycle

- [x] 4.1 Sync the typed MCP and modified orchestration/runtime-boundary specs into the stable spec set.
- [x] 4.2 Refresh the installed local Plugin through the fixed 9090 proxy after the stable specs are synchronized.
- [x] 4.3 Verify the installed snapshot matches the checkout and report that a new Codex task is required for live MCP discovery acceptance.

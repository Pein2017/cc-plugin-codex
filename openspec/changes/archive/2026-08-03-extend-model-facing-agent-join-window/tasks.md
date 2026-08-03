## 1. Typed MCP Join Boundary

- [x] 1.1 Inject the fixed 3600000 ms timeout only behind the strict model-facing `wait_agent` schema while preserving operator/runtime timeout selection.
- [x] 1.2 Prove the typed MCP forwards the hidden one-hour bound, still rejects caller `timeout_ms`, and still preserves progress and acknowledgement fields.

## 2. Anti-Polling Guidance

- [x] 2.1 Update MCP tool descriptions and server instructions so quiet required-work timeouts rejoin directly and `list_agents` remains a non-delivery state view.
- [x] 2.2 Update wait/list Skills, metadata, README, and contract tests from the 10-minute workflow to the one-hour completion-first workflow without adding continuous progress browsing.

## 3. Acceptance

- [x] 3.1 Run focused MCP/plugin contract tests and prove completion/progress can still return before the injected upper bound without a real Claude launch.
- [x] 3.2 Run strict OpenSpec validation, Serena diagnostics, `git diff --check`, and `npm run check`.
- [x] 3.3 Confirm no public schema/API generation, completion acknowledgement, child-to-parent messaging, release, installation, commit, push, or Cache change was introduced.

## 1. Runtime hot-load seam

- [x] 1.1 Add one MCP API generation owner and expose it through the public runtime seam.
- [x] 1.2 Route production MCP operations through a fresh isolated worker module graph with cooperative wait cancellation.
- [x] 1.3 Add focused tests for compatible per-call reload, generation mismatch, trusted context, and cancellation behavior.

## 2. Stable discovery and refresh lifecycle

- [x] 2.1 Point the Plugin MCP descriptor at the absolute canonical checkout bootstrap and update contract tests.
- [x] 2.2 Split runtime/same-generation refresh from versioned release refresh without changing the seven public operations.
- [x] 2.3 Preserve and restore at most two recent discovery-only Plugin snapshots across local installation cleanup, including failure recovery tests.

## 3. Diagnostics and guidance

- [x] 3.1 Update doctor/release smoke to verify the canonical descriptor, isolated production call path, and bounded compatibility shells.
- [x] 3.2 Update README, CHANGELOG, and package metadata with the compatible-hot-update versus new-task boundary.

## 4. Acceptance and rollout

- [x] 4.1 Run focused unit/stdio tests and `npm run check`.
- [x] 4.2 Perform a versioned local install, zero-model-cost release smoke, and best-effort repair of the one known recently deleted discovery shell.
- [x] 4.3 Verify OpenSpec implementation coherence and record the remaining Codex restart boundary.

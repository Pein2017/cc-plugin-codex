## 1. Build The Ephemeral Wake Primitive

- [x] 1.1 Add a bounded internal helper that resolves existing watch directories or nearest existing ancestors inside the Plugin state root without creating durable paths.
- [x] 1.2 Implement directory `fs.watch` hints, 10-second recovery wake, 5-second no-watcher fallback, caller-deadline clamping, AbortSignal cancellation, and unconditional watcher/timer cleanup.
- [x] 1.3 Add deterministic helper tests for event, race, coalescing, setup failure, watcher error, recovery, deadline, abort, ancestor rebuild, and active-handle cleanup.

## 2. Replace The 500 ms Wait Loop

- [x] 2.1 Refactor internal `wait()` to use observe-register-observe and the new wake helper while retaining durable completion/progress readers as the sole facts.
- [x] 2.2 Preserve completion priority, one opt-in progress revision, acknowledgement-before-wait, root isolation, final zero-time observation, and direct runtime timeout diagnostics.
- [x] 2.3 Prove quiet waits perform no persistence mutation and no 500 ms repeated scans, including when inbox/job directories are initially absent.

## 3. Verify Real Filesystem And Worker Behavior

- [x] 3.1 Add a supported-Linux integration test that atomically renames a durable update into a watched directory, records a filesystem-event wake, and returns before an injected long recovery interval.
- [x] 3.2 Add internal diagnostic assertions for durable read count, wake reason, watcher failure/recovery count, and cleanup without adding fields to model-facing receipts.
- [x] 3.3 Verify the helper cleanup paths plus a real isolated MCP quiet-wait Worker lifecycle, retaining the existing isolated-call termination and abort coverage.

## 4. Routed Review And Acceptance

- [x] 4.1 Assign one Codex builder over the wait/helper seam, preferring live Luna/high behind the deterministic verifier and escalating Luna effort before changing models for a bounded depth failure.
- [ ] 4.2 Bind a fresh Claude Opus/high read-only review to the exact tested tree for missed-event races, inode/rename mistakes, false fact ownership, resource leaks, and root isolation. **Blocked 2026-08-04:** the exact-tree Agent failed before review with `401 OAuth access token has expired` and `operator_required`; no retry or provider substitution was made.
- [x] 4.3 Let the Codex lead disposition findings, rerun focused runtime/MCP tests plus `npm run check`, and record route evidence only if it changes future routing.
- [x] 4.4 Classify the accepted implementation as hot-compatible, leave release/promotion to a later explicit decision, and begin `add-targeted-barrier-agent-join` on the same accepted wake primitive; the blocked provider audit remains explicit rather than fabricated.

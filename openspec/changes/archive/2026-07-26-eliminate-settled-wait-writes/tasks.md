## 1. Regression Evidence

- [x] 1.1 Add a whole-call regression test that proves a quiet wait over a fully settled terminal Agent performs no persistence writes, locks, or fsyncs.
- [x] 1.2 Add focused completion-inbox coverage proving immutable reconciliation is observation-only while unfrozen repair remains locked and durable.
- [x] 1.3 Add a crash-window regression proving one missing-marker repair, later zero-write waits, restored retention, and no acknowledged-completion resurrection.
- [x] 1.4 Add synchronized multi-process coverage proving concurrent missing-marker recovery performs one durable rewrite.

## 2. Runtime Correction

- [x] 2.1 Inspect `already_finalized` job facts, repair a missing `agentProjectionReconciledAt` marker once, and skip only an already-present marker.
- [x] 2.2 Add the identity-checked immutable completion snapshot fast path without weakening unfrozen correction serialization.
- [x] 2.3 Move projection-marker repair behind a job-lock compare-and-set helper so stale concurrent snapshots cannot rewrite twice.

## 3. Verification And Lifecycle

- [x] 3.1 Run focused runtime tests, the deterministic I/O probe, `npm run check`, strict OpenSpec validation, and `git diff --check`.
- [x] 3.2 Record that no real Claude smoke is required because the change does not cross the Claude CLI, model-selection, hook, or environment boundary.
- [x] 3.3 Sync and archive the completed OpenSpec change after independent read-only review.

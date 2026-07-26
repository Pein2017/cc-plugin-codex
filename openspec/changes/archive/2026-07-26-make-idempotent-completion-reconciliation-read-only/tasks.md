## 1. Regression Evidence

- [x] 1.1 Add a focused completion-inbox I/O test proving exact reconciliation of an existing unread and unfrozen fact performs no persistence mutation.
- [x] 1.2 Add whole-call `listAgents()` I/O tests for settled unread Agent-linked completion and quarantined legacy completion facts.
- [x] 1.3 Prove missing events and genuinely different mutable facts still take the durable append/correction path.

## 2. Runtime Implementation

- [x] 2.1 Extend the validated snapshot fast path to return an existing byte-equivalent normalized completion fact without acquiring the inbox lock.
- [x] 2.2 Preserve identity-collision checks, immutable-difference reasons, locked correction semantics, and first-delivery freezing.

## 3. Verification and Lifecycle

- [x] 3.1 Run the focused persistence, completion, reconciliation, and Agent projection tests.
- [x] 3.2 Run lint, typecheck, all unit and integration tests, and strict OpenSpec validation; skip real Claude smoke because no CLI/model/hook/environment boundary changes.
- [x] 3.3 Obtain an independent high-reasoning read-only audit and resolve any material findings.
- [x] 3.4 Sync the delta into the stable spec and archive the completed OpenSpec change.
- [x] 3.5 Commit cleanly and push `main` to the HTTPS remote through the required 9090 proxy; do not refresh Plugin metadata because the runtime-only checkout change is hot-loaded.

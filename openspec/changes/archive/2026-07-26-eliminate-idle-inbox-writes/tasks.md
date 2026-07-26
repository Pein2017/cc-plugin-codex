## 1. Behavioral Proof

- [x] 1.1 Add deterministic fsync instrumentation proving quiet reads and frozen redelivery perform zero persistence writes
- [x] 1.2 Preserve first-delivery freezing, acknowledgement, correction immutability, and concurrent append/read behavior in focused tests

## 2. Runtime Implementation

- [x] 2.1 Add the validated quiet-inbox and frozen-redelivery snapshot fast paths
- [x] 2.2 Keep the lock-and-reread path only for an unfrozen selected completion without changing the 500 ms observation cadence

## 3. Verification

- [x] 3.1 Re-run the 200-read IO probe and focused completion/concurrency tests
- [x] 3.2 Pass `npm run check` and strict OpenSpec validation
- [x] 3.3 Run one real Claude Code Agent completion/wait smoke through the checkout-owned runtime

## 4. Review and Release

- [x] 4.1 Obtain an independent high-effort Codex release audit without further Claude quota use and disposition any blocking findings
- [x] 4.2 Sync the delta spec to the stable contract and pass the final local release gate

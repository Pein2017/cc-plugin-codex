## 1. Model Contract

- [x] 1.1 Accept only `haiku` and canonical `claude-haiku-4-5` as the third public model, with test calls passing effort `low` explicitly
- [x] 1.2 Normalize verified dated Haiku 4.5 session evidence to the canonical family without accepting dated public inputs

## 2. Limit Safety

- [x] 2.1 Classify explicit subscription, usage, quota, credit, or period-limit exhaustion as a terminal non-resumable failure
- [x] 2.2 Prevent supervisor reconnect or model fallback for account-limit exhaustion while preserving bounded recovery for generic transient HTTP 429 and ordinary caller budget failures

## 3. Test-Only Guidance

- [x] 3.1 Document Haiku as test-only in the spawn skill, discovery metadata, README, and release notes while retaining Sonnet/Opus for general work
- [x] 3.2 Add focused unit, integration, migration, supervisor, and plugin-contract coverage for the model and limit policies

## 4. Verification and Release

- [x] 4.1 Pass focused tests, `npm run check`, and strict OpenSpec validation
- [x] 4.2 Run at most one real checkout-owned Haiku/low smoke, stopping all further real CC tests if it reports explicit account-limit exhaustion
- [x] 4.3 Obtain an independent high-effort Codex release audit and disposition every blocking finding
- [x] 4.4 Sync the delta specs to the stable contracts and pass the final local release gate

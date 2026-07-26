## 1. Runtime Launch Contract

- [x] 1.1 Require an explicit Sonnet or Opus model before Agent reservation, preserve it across continuation, and migrate pre-v0.3 model state from exact evidence without substitution.
- [x] 1.2 Make terminal-parity the default Claude profile with effective native config resolution, `IS_SANDBOX=1`, and `--dangerously-skip-permissions`; retain safe as explicit opt-in.
- [x] 1.3 Update repository guidance and focused environment, profile, adapter, and launch-boundary tests.

## 2. Codex V2 Completion Projection

- [x] 2.1 Add a bounded Agent-linked completion summary projection that omits final output and skips legacy unowned events without rewriting durable evidence.
- [x] 2.2 Reduce `wait_agent` to Codex-like activity/timeout output plus at most one acknowledgement-bearing summary update.
- [x] 2.3 Reduce `list_agents` to canonical Agent name/status records and cover redelivery, acknowledgement, pruning, legacy-prefix, and no-final-output scenarios.

## 3. Plugin Discovery and Local Refresh

- [x] 3.1 Make all six lifecycle skills model-visible and update spawn/list/wait instructions for explicit model and concise receipts.
- [x] 3.2 Replace destructive reinstall behavior with independent-clone initial binding, atomic refresh-only plugin add, and a checkout-owned cachebuster helper.
- [x] 3.3 Isolate production runtime variables from tests and verify plugin/marketplace source-root drift fails closed.

## 4. Release and Acceptance

- [x] 4.1 Sync the delta specs, README, CHANGELOG, marketplace metadata, and synchronized `0.3.0` package/plugin versions.
- [x] 4.2 Run focused tests, strict OpenSpec validation, full `npm run check`, independent review, and a real Claude Code full-access smoke.
- [x] 4.3 Verify the independent clone/remote/source boundary and prepare the completed change for OpenSpec archive and the subsequent Git/install release handoff.

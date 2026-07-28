## 1. Runtime permission contract

- [x] 1.1 Derive terminal-parity dangerous permission bypass from explicit write intent and reject contradictory direct bypass requests.
- [x] 1.2 Mark reconciliation-capable `list_agents` as non-read-only while preserving its non-destructive idempotent hints.

## 2. Model-facing guidance and documentation

- [x] 2.1 Update spawn and follow-up skills to select or inherit write intent accurately and validate the edited skills.
- [x] 2.2 Update repository guidance, README, and changelog for the breaking permission correction.

## 3. Verification and release handoff

- [x] 3.1 Add focused execution-profile, adapter, MCP-contract, and CLI tests for read, write, inherited, and contradictory permission paths.
- [x] 3.2 Run focused tests, the full repository check, and strict OpenSpec validation.
- [x] 3.3 Run one real Haiku/low read-intent Claude smoke, stopping real CC tests if a subscription or usage limit is reported.
- [x] 3.4 Refresh the local Plugin installation through the fixed checkout and 9090 proxy, then verify the installed snapshot matches the checkout.

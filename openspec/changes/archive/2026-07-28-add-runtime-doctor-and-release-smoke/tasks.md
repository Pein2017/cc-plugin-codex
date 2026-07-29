## 1. Version And Bootstrap Foundations

- [x] 1.1 Add a package-owned runtime version module and derive MCP/cachebuster/install version checks from it
- [x] 1.2 Add shared installed-bootstrap dependency preflight with concise checkout-specific recovery text
- [x] 1.3 Cover version derivation and missing-dependency bootstrap behavior with focused tests

## 2. Operator Doctor

- [x] 2.1 Implement structured redacted checkout, installation, dependency, environment, Claude auth, and static compatibility checks
- [x] 2.2 Implement read-only aggregate storage and Claude-history inventory with conservative dry-run candidates
- [x] 2.3 Add `npm run doctor`, human/JSON rendering, deterministic exit status, and focused diagnostic tests

## 3. Release Smoke

- [x] 3.1 Implement zero-cost installed snapshot, seven-Skill, stdio MCP, seven-tool, and isolated `list_agents` smoke
- [x] 3.2 Add explicit single-turn Haiku 4.5 low read-only smoke with quota/subscription stop behavior
- [x] 3.3 Add `npm run smoke:release` and fixture-backed release-smoke tests

## 4. Documentation And Acceptance

- [x] 4.1 Document doctor, release smoke, version ownership, dependency recovery, and operator-only storage boundaries
- [x] 4.2 Run focused tests, OpenSpec strict validation, Plugin/Skill validation, and full `npm run check`
- [x] 4.3 Run live doctor and zero-cost installed release smoke, then one explicit Haiku/low real smoke unless subscription limits stop paid testing
- [x] 4.4 Refresh the local Plugin, verify checkout/snapshot parity, and re-run live zero-cost acceptance

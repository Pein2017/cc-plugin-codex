## 1. Runtime contracts

- [x] 1.1 Add focused tests for bounded/redeliverable completion handoff and progress privacy, coalescing, delivery, root isolation, and completion priority
- [x] 1.2 Add the sanitized rate-limited public-progress projection and persisted advisory delivery revision to Agent jobs
- [x] 1.3 Extend root-wide wait to wake on progress and return typed progress or bounded completion updates
- [x] 1.4 Add adaptive 5/10/20/30-second progress delivery, a 10-minute default wait, and a one-hour maximum while preserving immediate completion

## 2. Experimental orchestration guidance

- [x] 2.1 Mark all six skill prompts and discovery metadata as Experimental
- [x] 2.2 Add required, parallel-then-join, and explicitly detached parent policies plus bounded progress/completion handling guidance
- [x] 2.3 Document the host-wakeup limitation, result-recovery prohibition, and Codex V2 reference behavior in README and CHANGELOG

## 3. Verification and release

- [x] 3.1 Run focused unit/integration tests and a fake stream-json smoke covering progress then completion
- [x] 3.2 Run `npm run check` and OpenSpec validation
- [x] 3.3 Make verification hermetic across CI-shaped and CC-bootstrap root environments and cover dead-owner lock recovery
- [ ] 3.4 Bump the experimental plugin minor version, archive/sync the completed OpenSpec change, and refresh the checkout-owned local plugin installation

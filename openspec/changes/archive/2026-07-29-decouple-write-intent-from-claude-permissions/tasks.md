## 1. Runtime Contract

- [x] 1.1 Make terminal-parity always resolve and emit dangerous permission bypass while preserving safe-profile rejection and permission-mode conflict validation.
- [x] 1.2 Make the appended delegation envelope state the current activation's prompt-level read or task-scoped write boundary and reconstruct it correctly for reconnect/follow-up.

## 2. Public Guidance

- [x] 2.1 Update typed MCP descriptions and Agent skills so `write` is behavioral authority rather than a Claude permission switch.
- [x] 2.2 Update repository guidance, README, changelog, and the release version from the single package source.

## 3. Automated Verification

- [x] 3.1 Update focused execution-profile, delegation, MCP, and runtime CLI tests for full-access read and write intents plus safe-profile negative cases.
- [x] 3.2 Run focused tests, `npm run check`, strict OpenSpec validation, doctor, and zero-cost release smoke.

## 4. Live Acceptance

- [x] 4.1 Run one bounded Haiku 4.5 low read-intent real Claude smoke that exercises a harmless tool path; stop further real Claude tests on any account-limit response.
- [x] 4.2 Refresh the locally installed Plugin from the canonical checkout and verify checkout/install version parity for the next Codex task.

## 1. Durable discovery-shell owner

- [x] 1.1 Add failing focused tests for bounded archive layout, exact whitelist, owner-only modes, atomic coverage history, and invalid archive rejection
- [x] 1.2 Implement the shared compatibility-shell archive and read-only inspection owner

## 2. Installation recovery

- [x] 2.1 Add failing installer regressions for a predecessor removed before installer startup, a missing known predecessor, first-install migration, and failed installation coverage
- [x] 2.2 Route local installation through durable staging, restoration, and successful-version coverage updates

## 3. Release and operator visibility

- [x] 3.1 Add failing doctor and release-smoke tests for complete, missing, and first-install predecessor coverage
- [x] 3.2 Project the shared compatibility coverage through doctor and zero-cost release smoke without mutating Plugin state

## 4. Agent and operator documentation

- [x] 4.1 Document exact retained-Skill behavior, emergency latest-version fallback risk, generation restart boundary, archive ownership, and recovery commands in README, changelog, and lifecycle Skill guidance
- [x] 4.2 Update contract tests so all seven lifecycle Skills expose the same concise active-task release guidance

## 5. Acceptance

- [x] 5.1 Run focused installer, archive, diagnostics, release-smoke, and Plugin-contract suites through a clean red-green cycle
- [x] 5.2 Run strict OpenSpec validation, `npm run check`, and inspect the complete diff without installing, releasing, or pushing

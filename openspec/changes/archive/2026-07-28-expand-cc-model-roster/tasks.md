## 1. Runtime Contract

- [x] 1.1 Add exact `fable`/`claude-fable-5` normalization and update fail-fast model messages.
- [x] 1.2 Preserve a uniform five-effort matrix across all four models and cover Fable in safe-profile defaults and Agent reconciliation.

## 2. Model-Facing Guidance

- [x] 2.1 Update the spawn skill and UI metadata with the four model roles, approximate capability/spend ladder, full effort support, and Fable planning guidance.
- [x] 2.2 Update README and changelog model documentation without claiming exact prices or fallback.

## 3. Verification

- [x] 3.1 Add focused unit, contract, migration, and fake-Claude integration coverage for the exact four-model/five-effort matrix.
- [x] 3.2 Validate all seven skills, the Plugin manifest, strict OpenSpec state, and run `npm run check`.
- [x] 3.3 Run one real Haiku 4.5/low boundary smoke; stop further real CC tests if account-limit exhaustion is reported.

## 4. Delivery

- [x] 4.1 Sync the delta specs into stable specs and validate them strictly.
- [x] 4.2 Cache-bust and reinstall `cc-for-pein@pein-local`, then verify the installed snapshot resolves to the canonical checkout.

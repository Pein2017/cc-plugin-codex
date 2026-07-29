## 1. Runtime Semantics

- [x] 1.1 Add call-local `wake_on_progress` validation and propagation through the public Agent runtime.
- [x] 1.2 Make the internal wait skip progress selection and cursor claims unless progress wakeup is explicitly enabled.

## 2. Public Surfaces

- [x] 2.1 Add the optional field to the MCP schema and checkout CLI without changing the seven-operation catalog.
- [x] 2.2 Update the wait Skill and user documentation for sparse completion-first joins and one-shot progress observation.

## 3. Verification And Release

- [x] 3.1 Add focused tests for default completion waits, opt-in progress, cursor preservation, completion priority, MCP schema, CLI parsing, and Skill guidance.
- [x] 3.2 Bump the minor release metadata and changelog from the package version source.
- [x] 3.3 Run focused tests and `npm run check`; no paid Claude smoke is required because the change does not alter Claude CLI launch, stream parsing, or execution profiles.
- [x] 3.4 Refresh and reinstall the checkout-owned local Plugin, then verify the installed descriptor and version identity.

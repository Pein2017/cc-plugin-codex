## 1. Public Contract

- [x] 1.1 Remove `allowed_tools` from typed MCP, model-facing CLI, Agent runtime inputs, seven-skill guidance, README examples, and release-smoke fixtures; reject the retired field before readiness or durable mutation.
- [x] 1.2 Increment the MCP API generation and the pre-1.0 minor release metadata for the incompatible discovered schema.

## 2. Claude Execution Boundary

- [x] 2.1 Deny `Workflow` for every Agent activation, continue denying `Agent` for leaves, and leave `Agent` available only for explicit Fable orchestrators.
- [x] 2.2 Add the bounded lead-owned blocking-question escape hatch while preserving full-access terminal parity and prompt-only write intent.

## 3. Verification And Release

- [x] 3.1 Update focused unit and integration coverage for public field rejection, mode-specific deny arguments, prompt reconstruction, and existing-Agent follow-up behavior.
- [x] 3.2 Run strict OpenSpec validation and the focused runtime/integration tests while iterating.
- [x] 3.3 Run one real Haiku/low Claude smoke to confirm ordinary tools remain available and `Workflow` is unavailable; stop real CC testing if subscription or usage allowance exhaustion is reported.
- [x] 3.4 Update changelog/docs, run `npm run check` and zero-model release smoke, then refresh and verify the checkout-owned local Plugin.

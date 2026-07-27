## 1. Complete Current Completion Delivery

- [x] 1.1 Remove the 64 KiB completion-event normalization limit while preserving legacy truncation provenance.
- [x] 1.2 Remove the 4096-byte public handoff limit and keep immutable two-phase redelivery semantics.
- [x] 1.3 Replace the former-bound regression with byte-exact multilingual output above 64 KiB.

## 2. Native Agent Message History

- [x] 2.1 Add a narrow native Claude transcript adapter with canonical path containment, exact session validation, and top-level outer-assistant text filtering.
- [x] 2.2 Implement newest-first `before`/`limit` pagination without text truncation and explicit unavailable/invalid-cursor errors.
- [x] 2.3 Expose observation-only `read_agent_messages` through the Agent runtime, public runtime seam, and CLI while rejecting raw path/session/root overrides.

## 3. Plugin Surface and Documentation

- [x] 3.1 Create and validate the Experimental `read-agent-messages` Plugin skill and discovery metadata.
- [x] 3.2 Update wait guidance, manifest descriptions, README lifecycle/API/history documentation, and changelog.

## 4. Verification and Release Integration

- [x] 4.1 Add focused unit tests for complete delivery, native parser filtering, path/root isolation, missing history, pagination, and no lifecycle mutation.
- [x] 4.2 Update CLI integration and Plugin-contract tests for the seventh lifecycle operation and full current completion.
- [x] 4.3 Run focused tests, `npm run check`, strict OpenSpec validation, and a read-only smoke against a real locally persisted Claude transcript without launching Claude.
- [x] 4.4 Sync the delta specs, archive the completed change, refresh the local Plugin snapshot, and verify the installed bootstrap/skills resolve back to the canonical checkout.

## 1. Fixed Auto Memory Environment

- [x] 1.1 Add Claude's force-enable Auto Memory value to the canonical fixed environment and the environment owner's supported vocabulary.
- [x] 1.2 Preserve native repository-derived storage by adding no memory directory, prompt, settings-file, or public receipt override.

## 2. Regression Coverage And Guidance

- [x] 2.1 Prove the fixed fallback enables Auto Memory and overrides a conflicting inherited disable value without exposing it in receipts.
- [x] 2.2 Document that CC Agents use Claude native Auto Memory rather than `CLAUDE.md` or Plugin-owned shared memory.

## 3. Acceptance

- [x] 3.1 Run focused environment and terminal-parity tests plus strict OpenSpec validation.
- [x] 3.2 Run one Haiku/low CC Agent smoke that observes the effective child value, stopping without retry on account-limit exhaustion.
- [x] 3.3 Run `npm run check` and confirm no public MCP generation, model-facing input, installation, release, commit, or push is required for this checkout-only implementation.

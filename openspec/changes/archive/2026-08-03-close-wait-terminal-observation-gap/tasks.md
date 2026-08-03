## 1. Runtime Boundary

- [x] 1.1 After the bounded wait and exit reconciliation, perform one zero-time completion-only observation when the first result was not already a completion.
- [x] 1.2 Make a final-observation completion replace timeout or claimed advisory progress without changing acknowledgement, redelivery, lifecycle, or MCP receipt schemas.

## 2. Regression Coverage

- [x] 2.1 Add deterministic tests for completion publication repaired by exit reconciliation and completion appearing after the bounded loop's last poll.
- [x] 2.2 Prove final-observation completion supersedes claimed progress, the claimed revision is not redelivered, and a later turn keeps its own progress budget.
- [x] 2.3 Extend quiet-timeout persistence coverage so the additional final observation acquires no completion-inbox lock, calls no fsync, and writes no durable state.

## 3. Guidance And Acceptance

- [x] 3.1 Update wait guidance to define the final-observation timeout guarantee and forbid an immediate `list_agents` call used only to recheck completion; retain the existing progress and acknowledgement rules.
- [x] 3.2 Run focused zero-Claude tests, strict OpenSpec validation, and `npm run check`; record that no MCP generation bump, installation, release, or real Claude smoke is required because the change remains inside the checkout-owned wait boundary.

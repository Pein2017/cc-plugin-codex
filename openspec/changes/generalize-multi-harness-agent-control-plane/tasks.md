## 1. Freeze Driver Contract V2

- [ ] 1.1 Verify `rename-to-codex-harnessdock` is implemented and accepted, then add failing contract tests for static descriptions, side-effect-free instance inspection, least-authority DriverScope, explicit route validation, route-qualified capability maturity, `noninteractive_fixed_policy` admission, process-local LiveTurn shape, optional operation/capability coherence, and rejection of Driver v1.
- [ ] 1.2 Replace the process-shaped Harness contract and capability validators with the exact Driver v2 and normalized terminal schemas from `design.md`, retaining bounded failure, progress, metrics, and receipt validation.
- [ ] 1.3 Add a fake service Driver fixture that starts and completes a turn without a child PID or exit status, and prove the Supervisor contains no Harness-ID behavior branch.
- [ ] 1.4 Prove Driver prompt preparation can add only authority/topology/return-envelope facts and that the generic completion accepts one bounded final message without repository-specific result fields.

## 2. Add Native Reference And Settlement Evidence

- [ ] 2.1 Add failing tests for separate bounded native-session/native-turn envelopes, exact Driver locator schemas, version drift, forbidden secret/config fields, foreign route identity, session-as-turn misuse, and byte/depth/key limits.
- [ ] 2.2 Implement `runtime/native-reference.mjs` and Driver registration checks so continuation and exact turn acceptance cannot persist an open-ended locator, live transport, or substitute for one another.
- [ ] 2.3 Add failing tests for independent native-turn state, execution-world continuity/settlement, transcript continuation, persistent-idle-session completion, contradictory results, and unknown settlement.
- [ ] 2.4 Implement `runtime/turn-settlement.mjs` and update terminal/completion validation so only terminal native plus settled/not-applicable execution evidence can publish completion.

## 3. Introduce Version-Three Agent State And Legacy Projection

- [ ] 3.1 Add v3 Agent/job/store fixtures for immutable Harness, instance, model, topology, authority, Driver version, capability-schema version, and capability snapshot, including old-runtime queue rejection and active-owner preservation.
- [ ] 3.2 Implement v3 validators and a public-generation write gate that keeps the current HarnessDock seven-operation generation writing v2 while accepting only fully explicit v3 creation from the dependent future generation.
- [ ] 3.3 Add `runtime/claude-legacy-adapter.mjs` tests and implementation for v1/v2 Claude identity, model evidence, `claude_orchestrator` observation mapping, history/auth/session binding, mutable historical authority, and nonconversion to v3 or another Harness.
- [ ] 3.4 Remove Claude-only model/history/auth/session migration branches from the generic v3 Agent path without rewriting valid legacy records on read.

## 4. Add Instance And Workspace Admission Leases

- [ ] 4.1 Add failing tests for logical instance capacity, exact-session conflicts, one writer per canonical workspace, distinct prepared-worktree writers, read-only coexistence, and root/Agent/job/route lease binding.
- [ ] 4.2 Implement route-qualified instance leases and `runtime/workspace-writer-lease.mjs` using existing owner-only atomic state conventions.
- [ ] 4.3 Prove terminal settled turns release every matching lease once, while worker loss, failed observation, contradictory evidence, and unknown settlement retain leases and block competing admission.
- [ ] 4.4 Extend operator diagnostics read-only inventory for blocked instance/session/writer leases without adding force-clear, lifecycle mutation, model-facing identity leakage, or cleanup candidates.

## 5. Build Durable Turn Control And The Live Worker Loop

- [ ] 5.1 Add failing state-machine tests for durable command identity, `none|accepted|rejected|unsupported`, `pending|settled|unknown`, `active|terminal|unknown`, idempotent repeated interrupt, deadline-to-unknown, and no terminal synthesis.
- [ ] 5.2 Implement `runtime/turn-control.mjs` on the existing durable wake primitive so isolated control calls enqueue commands and only the detached worker invokes LiveTurn methods.
- [ ] 5.3 Add launch-claim/attempt tests and persistence binding root, Agent, job, route/capabilities, leases, mailbox/input identity, and input digest before any possible native submission.
- [ ] 5.4 Refactor the detached worker to persist the launch claim, classify not-submitted/proven/rejected/unknown acceptance, and persist exact native turn acceptance before mailbox acknowledgement; then race LiveTurn completion, assigned input, control commands, and abort/cleanup while preserving root ownership and at-least-once delivery.
- [ ] 5.5 Delete automatic public interrupt-to-cancel escalation and the five-second synthesized interruption path; keep exact process cleanup only as separately classified internal recovery.
- [ ] 5.6 Add worker-loss integration tests before/during/after submission with observable and unobservable fake service turns, proving ambiguous acceptance is never replayed, later Driver observation can settle once, and unsupported observation remains unknown with leases held.

## 6. Adapt Claude Code Without Losing Current Behavior

- [ ] 6.1 Wrap the existing Claude stream-json session in a Driver v2 LiveTurn whose durable locator uses verified process/native session identity and whose live input/interrupt methods retain current admitted capabilities.
- [ ] 6.2 Translate Claude terminal process/session/failure/progress/metrics evidence into the new native/execution/continuation axes, mapping newly contradictory owned-work evidence to unknown without taking over the active `harden-native-background-task-completion` experiment.
- [ ] 6.3 Preserve exact-session continuation, bounded reconnect, terminal-parity authority, leaf/native-team behavior, Auto Memory, credential recovery, history, final-message selection, and usage receipts through focused fake-Claude parity tests.
- [ ] 6.4 Prove legacy Claude interrupt remains honest under the new command path: request acknowledgement is nonterminal, valid terminal stream evidence settles, rejected requests remain active, and forced cleanup never reports graceful success.

## 7. Neutralize Public Runtime Ownership And Guidance

- [ ] 7.1 Export `createAgentRuntime()` as the neutral `runtime/index.mjs` factory and retain a bounded current-generation `createClaudeRuntime()` compatibility alias; update internal callers without changing the seven public operation names or schemas.
- [ ] 7.2 Remove `DEFAULT_HARNESS_ID` from every generic/v3 path and retain it only inside the Claude legacy adapter; require an explicit canonical route everywhere else.
- [ ] 7.3 Remove mandatory route ranking, delegation thresholds, fan-out/fallback, conflict policy, and required/parallel/detached classification from shared server/Skill guidance while preserving operation mechanics, blocking evidence, acknowledgement, and safety facts.
- [ ] 7.4 Add contract tests proving `runtime/index.mjs` remains the sole lifecycle seam, the Driver registry is static, model-facing selectors cannot choose modules/instances/config/endpoints/credentials, DriverScope cannot access stores/MCP/other Drivers/arbitrary env, and current `codex_harnessdock` MCP discovery stays generation-compatible.

## 8. Verify Migration, Recovery, And Vertical Behavior

- [ ] 8.1 Run focused Driver contract, native reference, settlement, Agent/store migration, lease, control, worker, completion, MCP, and fake-Claude tests after each owning slice.
- [ ] 8.2 Add restart and race fixtures for active legacy workers, v3 queue incompatibility, launch-claim submission ambiguity, control during worker handoff, completion versus interrupt, active input versus terminal result, session/turn locator-version drift, and idempotent reconciliation.
- [ ] 8.3 Run one explicitly authorized real Claude Code read-only leaf smoke through the production Driver/Supervisor seam in a disposable Git workspace; stop further real calls on auth/account/quota evidence and record only bounded lifecycle/mutation facts.
- [ ] 8.4 Run `npm run check`, `git diff --check`, `openspec validate generalize-multi-harness-agent-control-plane --strict`, and `openspec validate --all --strict` with no inherited test-only owner or environment selectors.

## 9. Independent Review And Phase Handoff

- [ ] 9.1 Freeze the exact tested tree and request one fresh read-only architecture/concurrency review for false terminal claims, secret persistence, lost-worker lease release, legacy mutation, root crossover, and accidental public-generation drift.
- [ ] 9.2 Let the Codex lead disposition every finding, rerun affected focused/full gates, and leave the accepted implementation uninstalled and unreleased.
- [ ] 9.3 Update the implementation handoff with exact commit/tree, closed and unknown settlement risks, the real-smoke receipt, and confirmation that `add-opencode-explorer-driver` remains the sole next change authorized to activate v3 public spawns.

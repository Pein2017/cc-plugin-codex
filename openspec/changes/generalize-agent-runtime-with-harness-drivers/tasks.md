## 1. Fix the prerequisite wait contract

- [ ] 1.1 Complete and verify `bound-model-facing-agent-wait`, synchronize its delta specifications into the owning specs, and archive that change before Harness implementation starts.
- [ ] 1.2 Freeze completion-first join, explicit one-progress observation, hook suppression, and progress-revision behavior in supervisor-level contract fixtures.

## 2. Freeze Claude parity before extraction

- [ ] 2.1 Add behavior-level fixtures covering every currently admitted Claude model/effort route, leaf and Fable topology, terminal-parity environment, prompt/tool envelope, active steering acknowledgement, exact-session recovery, history, interruption, usage limits, and public receipts.
- [ ] 2.2 Record the current module ownership and define a no-observable-change parity matrix for the Claude extraction; do not update expectations merely to accommodate the new abstraction.

## 3. Introduce the internal Harness Driver boundary

- [ ] 3.1 Add the closed Driver capability vocabulary, normalized turn result, validation, and static in-tree Driver registry with exactly `claude-code` admitted.
- [ ] 3.2 Compose the existing Claude executable, environment, execution profile, compatibility, stream-json, steering, recovery, and history owners behind the Claude Code Driver without duplicating their implementation.
- [ ] 3.3 Update the supervisor composition behind `runtime/index.mjs` to run a prepared turn through its immutable Driver route while keeping the seven public operations and MCP schemas unchanged.
- [ ] 3.4 Reject unknown Drivers, capability values, external implementation selectors, unsupported operations, and cross-Harness fallback before process launch or continuity mutation.

## 4. Add version-2 durable Harness state

- [ ] 4.1 Add v2 Agent and job schemas for immutable Harness route, Driver version, capability snapshot, neutral native-session reference, and bounded Driver receipts.
- [ ] 4.2 Generalize durable session bindings and active leases to canonical `(harnessId, instanceKey, nativeSessionId)` identity while preserving root/Agent ownership and verified process control.
- [ ] 4.3 Interpret valid v1 state as Claude Code, normalize only terminal unowned records on safe writes, and make v1-only runtimes fail closed on v2 state.
- [ ] 4.4 Add mixed-state and crash fixtures for active v1 isolation, ownership-uncertain v1 isolation, terminal v1 continuation, v2 creation, exact-session drift, lease collision prevention, retention, and idempotent completion reconciliation.
- [ ] 4.5 Enable v2 writes for new Agents only after the mixed-state fixtures pass; remove any temporary dual-write scaffolding.

## 5. Verify source-level acceptance

- [ ] 5.1 Run the focused runtime, MCP, prompt, environment, history, compatibility, wait/progress, recovery, migration, retention, and process-control suites on Linux.
- [ ] 5.2 Run `openspec validate generalize-agent-runtime-with-harness-drivers --strict` and `npm run check`, then reconcile every failure against the proposal and specifications.
- [ ] 5.3 Confirm the diff adds no public `harness` field, second Driver, raw provider dependency, upstream/Cache runtime dependency, release metadata, installer action, Plugin refresh, or `pein-agents` rename.
- [ ] 5.4 Obtain an independent read-only architecture and migration review before accepting the source change.

## 6. Preserve the next-change boundary

- [ ] 6.1 Draft a separate Codex Exec Driver proposal only after this Claude-only extraction and v2 migration are accepted; use real Codex CLI evidence to decide its continuation, history, active-input, interruption, authority, and public-generation contracts.
- [ ] 6.2 Keep Luna routing, mixed-Harness smoke, public Harness selection, other Harnesses, Plugin rename, release, installation, and Cache refresh out of this implementation change.

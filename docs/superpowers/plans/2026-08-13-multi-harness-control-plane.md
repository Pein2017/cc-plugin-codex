# Multi-Harness Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Claude/process-shaped internals with a Harness-neutral, replay-safe control plane while preserving the renamed HarnessDock seven-operation public behavior and legacy Claude Agents.

**Architecture:** OpenSpec change [`generalize-multi-harness-agent-control-plane`](../../../openspec/changes/generalize-multi-harness-agent-control-plane/) is the sole scope/completion authority. The Supervisor owns trusted identity, launch claims/attempts, ordering, leases, controls, normalized settlement, usage lineage, and delivery. Static Drivers own native route/config/protocol, least-authority prompt envelope, session/turn references, live transport, optional capabilities, and result translation.

**Tech Stack:** Node.js 20.19+ ESM, JSDoc/checkJs, Zod, `node:test`, owner-only JSON persistence, Worker threads, existing Claude stream-json adapter, repository-local OpenSpec.

## Global Constraints

- Begin only from the exact reviewed `rename-to-codex-harnessdock` candidate tree with fresh focused/full checkout-level gates. Its installed cutover/fresh-Codex witness may remain deferred until the Phase B candidate is complete.
- Read the owning proposal/design/specs/tasks in full; OpenSpec wins over this execution plan.
- Use an isolated worktree/session. Keep `runtime/index.mjs` the sole lifecycle interface and the registry static/in-tree.
- Phase A adds no OpenCode/DeepSeek/Grok/Pi/Codex Driver, no eighth operation, no public schema change, and no v3 public creation.
- `DEFAULT_HARNESS_ID` may survive only inside the legacy Claude adapter.
- No generic approval broker, session/tool/event API, workflow engine, auto-route/fan-out/fallback/retry, opinion merger, or Driver-owned scheduler policy.
- Use TDD per slice. Stage only explicit accepted paths; do not install/refresh/release/archive/push.

---

### Task 1: Freeze Driver v2, least-authority scope, and capabilities

**Files:**
- Modify: `runtime/harness-contract.mjs`
- Modify: `runtime/harness-capabilities.mjs`
- Modify: `runtime/harness-registry.mjs`
- Modify: `tests/runtime/harness-driver-contract.test.mjs`
- Create: `tests/runtime/fixtures/fake-service-driver.mjs`

**Core interface:**

```js
driver = {
  contractVersion: 2,
  describe, inspectInstances, validateRoute,
  prepareTurn, revalidatePreparedTurn,
  validateNativeSessionRef, validateNativeTurnRef,
  startTurn,
  observeTurn?, readAssistantHistory?
}
```

- [ ] Add failing cases for v1 rejection, static inspection, explicit route, per-route maturity, `interaction`, capability/method coherence, discriminated model/effort, and a service turn with no PID/exit code.
- [ ] Define `DriverScope` with only root/workspace/Agent/turn/attempt, immutable route/capabilities, bounded input, deadlines/signals, and per-Driver fixed environment view; reject stores/registry/MCP/other Drivers/arbitrary env/credentials.
- [ ] Make `noninteractive_fixed_policy` the only admitted interaction value; report `requires_broker` unavailable without TUI/auto-approval.
- [ ] Prove the generic Supervisor has no Harness-ID branch and no dynamic Driver/module/endpoint selector.
- [ ] Run `node --test tests/runtime/harness-driver-contract.test.mjs`.

### Task 2: Separate NativeSessionRef from NativeTurnRef

**Files:**
- Create: `runtime/native-reference.mjs`
- Modify: `runtime/harness-contract.mjs`
- Modify: `runtime/harness-registry.mjs`
- Create: `tests/runtime/native-reference.test.mjs`

- [ ] Add exact envelope/locator tests for session versus turn, unknown versions, foreign route/attempt, secret/config-like fields, arbitrary JSON, live transport, size/depth/key/scalar bounds, and session-as-turn misuse.
- [ ] Add positive Claude and fake-service fixtures with distinct session/turn identities.
- [ ] Validate every reference through the selected Driver before persistence; never treat a reusable session as proof of a specific turn.
- [ ] Run `node --test tests/runtime/native-reference.test.mjs tests/runtime/harness-driver-contract.test.mjs`.

### Task 3: Add launch claims and replay-safe acceptance

**Files:**
- Create: `runtime/launch-claim.mjs`
- Modify: `runtime/job-store.mjs`
- Modify: `runtime/agent-store.mjs`
- Modify: `runtime/internal-runtime.mjs`
- Create: `tests/runtime/launch-claim.test.mjs`
- Modify: `tests/runtime/detached-worker-handoff.test.mjs`

**Ordering:** lease → durable claim/attempt/input digest → native call → exact turn ref → mailbox acknowledgement.

- [ ] Test `not_submitted`, `acceptance_rejected`, `acceptance_proven`, and `acceptance_unknown`, including process death before/during/after submission.
- [ ] Bind claim to trusted root, Agent/job, immutable route/capabilities, authority/instance/session leases, mailbox/input identity, and bounded digest.
- [ ] On possible remote acceptance without a durable exact turn ref, record unknown, retain every lease, and forbid same/other Driver replay/fallback/replacement.
- [ ] Prove positive native acceptance precedes mailbox acknowledgement and idempotent recovery cannot double-submit.
- [ ] Run `node --test tests/runtime/launch-claim.test.mjs tests/runtime/detached-worker-handoff.test.mjs tests/runtime/job-store.test.mjs`.

### Task 4: Model terminal settlement, continuity, and route-keyed usage

**Files:**
- Create: `runtime/turn-settlement.mjs`
- Modify: `runtime/completion-inbox.mjs`
- Modify: `runtime/terminal-metrics.mjs`
- Modify: `runtime/operator-usage-ledger.mjs`
- Create: `tests/runtime/turn-settlement.test.mjs`
- Modify: `tests/runtime/completion-inbox.test.mjs`
- Modify: `tests/runtime/operator-usage-ledger.test.mjs`

- [ ] Test native terminal versus execution settlement versus transcript continuation independently, including an idle persistent service/session and contradictory/unknown work.
- [ ] Implement one `isPublishableTerminal()` predicate: native terminal plus turn-owned execution settled/not-applicable; no universal process field.
- [ ] Keep generic completion to bounded final outer message/absence, closed failure/progress/metrics, continuation and optional opaque Driver metadata; no repository research ontology/tool history.
- [ ] Key usage by root/Agent/turn/attempt/Harness/instance/full model/Driver/capability/topology/authority and preserve provider-reported/missing provenance.
- [ ] Run `node --test tests/runtime/turn-settlement.test.mjs tests/runtime/completion-inbox.test.mjs tests/runtime/terminal-metrics.test.mjs tests/runtime/operator-usage-ledger.test.mjs`.

### Task 5: Introduce v3 records behind a closed write gate

**Files:**
- Modify: `runtime/agent-store.mjs`
- Modify: `runtime/agent-card.mjs`
- Modify: `runtime/job-store.mjs`
- Create: `runtime/claude-legacy-adapter.mjs`
- Modify: `tests/runtime/harness-state-migration.test.mjs`
- Create: `tests/runtime/claude-legacy-adapter.test.mjs`

- [ ] Add v3 fixtures for immutable Harness/instance/model/topology/authority/Driver/capability-schema/snapshot and old-runtime queue refusal.
- [ ] Keep Phase A public calls writing v2; accept only complete internal v3 fixtures/preparation from the future generation.
- [ ] Project v1/v2 Claude identity/model/native-team/history/auth/session/write evidence without eager rewrite or conversion.
- [ ] Move Claude-only migration/auth/history/model/session compatibility out of generic v3 paths.
- [ ] Run `node --test tests/runtime/harness-state-migration.test.mjs tests/runtime/claude-legacy-adapter.test.mjs tests/runtime/agent-store.test.mjs tests/runtime/agent-card.test.mjs`.

### Task 6: Add instance/session/writer leases and operator evidence

**Files:**
- Create: `runtime/workspace-writer-lease.mjs`
- Modify: `runtime/agent-store.mjs`
- Modify: `runtime/job-store.mjs`
- Modify: `runtime/operator-diagnostics.mjs`
- Create: `tests/runtime/workspace-writer-lease.test.mjs`
- Modify: `tests/runtime/agent-session-conflict.test.mjs`
- Modify: `tests/runtime/operator-diagnostics.test.mjs`

- [ ] Test logical-instance capacity, exact-session conflict, one behavioral writer per canonical worktree, distinct prepared roots, read-only coexistence, symlink canonicalization, and exact owner binding.
- [ ] Release matching leases exactly once only after publishable settlement; retain on unknown acceptance, worker loss, failed observation, contradiction, or unresolved turn-owned work.
- [ ] Add operator-only read diagnostics naming bounded route/attempt/evidence needed for release; no model-facing or operator force-clear in Phase A.
- [ ] Document future warning-bearing force-clear requirements without implementing it.
- [ ] Run `node --test tests/runtime/workspace-writer-lease.test.mjs tests/runtime/agent-session-conflict.test.mjs tests/runtime/operator-diagnostics.test.mjs`.

### Task 7: Build durable control and the LiveTurn worker loop

**Files:**
- Create: `runtime/turn-control.mjs`
- Modify: `runtime/internal-runtime.mjs`
- Modify: `runtime/agent-runtime.mjs`
- Modify: `runtime/durable-activity-wakeup.mjs`
- Modify: `runtime/job-supervisor.mjs`
- Create: `tests/runtime/turn-control.test.mjs`
- Modify: `tests/runtime/agent-reconciliation.test.mjs`

- [ ] Test stable command identity, request none/accepted/rejected/unsupported, settlement pending/settled/unknown, native active/terminal/unknown, idempotency, and deadline-to-unknown.
- [ ] Make isolated control calls append+wake only; the owning detached worker alone invokes live connection methods.
- [ ] Race completion, assigned mailbox input, control, and cleanup; gate every method by the accepted snapshot.
- [ ] Delete automatic graceful-to-force escalation and five-second synthetic interrupted result.
- [ ] Test observable/unobservable fake service loss and prove request acknowledgement never equals effect or terminal settlement.
- [ ] Run `node --test tests/runtime/turn-control.test.mjs tests/runtime/detached-worker-handoff.test.mjs tests/runtime/agent-reconciliation.test.mjs`.

### Task 8: Adapt Claude behind Driver v2 without drift

**Files:**
- Modify: `runtime/claude-code-driver.mjs`
- Modify: `runtime/claude-headless-adapter.mjs`
- Modify: `runtime/execution-profile.mjs`
- Modify: `runtime/process-control.mjs`
- Modify: `runtime/internal-runtime.mjs`
- Modify: `tests/runtime/harness-claude-parity.test.mjs`
- Modify: `tests/runtime/process-control.test.mjs`
- Modify: `tests/runtime/claude-session-history.test.mjs`
- Modify: `tests/runtime/claude-native-team-policy.test.mjs`

- [ ] Capture initial/active input, exact resume, interrupt, bounded history, credential recovery, final message, metrics, leaf/native-team, Auto Memory, and terminal-parity behavior before switching.
- [ ] Wrap stream-json child/session as one LiveTurn with separate exact session/turn references and current proven process evidence.
- [ ] Make `runtime/execution-profile.mjs` Claude Driver-internal; preserve universal Workflow denial and leaf Agent denial with no new implicit model/effort/settings/tool/MCP overrides.
- [ ] Map contradictory/background-owned work to unknown without absorbing the separate background-task evidence change.
- [ ] Run `node --test tests/runtime/harness-claude-parity.test.mjs tests/runtime/process-control.test.mjs tests/runtime/claude-session-history.test.mjs tests/runtime/claude-native-team-policy.test.mjs tests/runtime/execution-profile.test.mjs`.

### Task 9: Neutralize the factory and preserve seven-operation public parity

**Files:**
- Modify: `runtime/index.mjs`
- Modify: `runtime/harness-registry.mjs`
- Modify: `runtime/agent-runtime.mjs`
- Modify: `runtime/internal-runtime.mjs`
- Modify: `runtime/cli.mjs`
- Modify: `runtime/operator-cli.mjs`
- Modify: `tests/runtime/mcp-server.test.mjs`
- Modify: `tests/runtime/plugin-contract.test.mjs`

- [ ] Export neutral `createAgentRuntime()` and retain a bounded `createClaudeRuntime()` compatibility alias for this generation.
- [ ] Remove `DEFAULT_HARNESS_ID` from generic code and prove only the legacy adapter may infer historical Claude meaning.
- [ ] Preserve exactly seven `codex_harnessdock` tools/Skills, schemas, generation, receipts, and loaded identity; do not add public route fields or `list_harnesses` yet.
- [ ] Remove shared policy for thresholds/ranking/fan-out/fallback/conflict/join classification while retaining operation mechanics and safety facts.
- [ ] Run `node --test tests/runtime/mcp-server.test.mjs tests/runtime/plugin-contract.test.mjs tests/runtime/harness-state-migration.test.mjs`.

### Task 10: Vertical acceptance, review, and Phase B handoff

- [ ] Run one fake service Agent through public runtime → detached worker → Driver → completion without process fields and with launch/session/turn evidence.
- [ ] Run legacy Claude fixtures through exact follow-up, history, honest interrupt, unknown loss, and unchanged public schema.
- [ ] Exercise launch/control/completion/input races, locator-version drift, persistent-idle service, unknown lease retention, and idempotent restart reconciliation.
- [ ] If separately authorized, run one real read-only Claude leaf smoke in a disposable Git workspace and stop on auth/account/quota evidence.
- [ ] Run `npm run check`, `openspec validate generalize-multi-harness-agent-control-plane --strict`, `openspec validate --all --strict`, and `git diff --check`.
- [ ] Freeze the exact tree and obtain fresh read-only review for false acceptance/terminal, replay, secret scope, lost-worker release, legacy mutation, root crossover, Driver policy, and public-generation drift.
- [ ] Disposition findings, rerun gates, and update the handoff. Once the exact candidate tree is accepted, Phase B may begin immediately in the same task/worktree; preserve a separate commit/checkpoint and OpenSpec ledger.

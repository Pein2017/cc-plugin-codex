# HarnessDock For Codex — Execution Design Index

> This is a non-authoritative Superpowers execution index. Product scope,
> compatibility, and completion are owned solely by the linked OpenSpec changes.

## Product boundary

HarnessDock for Codex is a thin, local, Harness-neutral control plane. The Codex Desktop/root task is the initiating conversation and sole planner/router/synthesizer/final editor/reviewer/acceptor. Each Driver attaches one explicitly selected worker Agent to a native Harness that continues to own its model loop, tools, context/history, authentication, provider adaptation, native teams, and persistent session storage.

The Plugin is not a new Agent Harness or generic workflow engine. It owns only durable Codex-root identity, explicit immutable route, launch/attempt acceptance truth, mailbox/control ordering, capability/lease admission, bounded result/usage receipts, and conservative completion/recovery.

## Authority and execution order

1. **Phase 0 — identity cutover:** [`rename-to-codex-harnessdock`](../../../openspec/changes/rename-to-codex-harnessdock/), executed with [the identity plan](../plans/2026-08-14-rename-to-codex-harnessdock.md).
2. **Phase A — neutral control plane:** [`generalize-multi-harness-agent-control-plane`](../../../openspec/changes/generalize-multi-harness-agent-control-plane/), executed with [the control-plane plan](../plans/2026-08-13-multi-harness-control-plane.md).
3. **Phase B — OpenCode Explorer:** [`add-opencode-explorer-driver`](../../../openspec/changes/add-opencode-explorer-driver/), executed with [the OpenCode plan](../plans/2026-08-13-opencode-explorer-driver.md).
4. **Phase R — physical source/deployment rename:** new change only after Phase B acceptance; rename production/development checkouts, registered worktrees, loaders/installers/AGENTS pointers, remotes/GitHub, then prove loaded provenance.
5. **Phase C/D — next Harness probes:** DeepSeek Harness first; if no stable headless/API boundary, record HOLD and proceed to Grok Build. Pi remains reference-only. Each Driver is an independent change with a public-generation decision.
6. **Phase E — implementation workers:** only after Explorer evidence, using operator-prepared isolated Git worktrees, diff/test receipts, and Codex acceptance. Never concurrent writers in one worktree.

If an execution plan conflicts with OpenSpec, stop and correct the plan before code work. Each phase is independently rejectable and should start in a fresh task from the exact accepted prior tree.

## Stable cross-Harness invariants

- Spawn always requires explicit `harness`, full `model`, `topology`, and `write`; no defaults, aliases, inference, fallback, retry, or hot-switch.
- One Agent has one immutable route and native session lineage. Cross-Harness workflow creates a new Agent from Codex-distilled input.
- `request acknowledgement != native acceptance != effect != terminal settlement`.
- `NativeSessionRef` and `NativeTurnRef` are distinct. A session never proves a turn.
- Launch claim/attempt/input digest and leases are durable before possible submission. Ambiguous acceptance/settlement becomes unknown, holds leases, and is never replayed automatically.
- Driver scope excludes stores/registry/MCP/other Drivers/arbitrary env. Driver prompt envelopes add only authority/topology/return facts, not scheduling or synthesis policy.
- First generations admit only `noninteractive_fixed_policy`; interactive approval brokerage is deferred.
- Harness-native transcripts/tool histories remain native. Generic completion carries bounded outer final result, failures/progress/usage, not a research ontology.
- Usage remains route/attempt qualified; Server persistence and provider prompt cache are separate facts.
- Operator CLI is diagnostic/reconciliation-only (`doctor/status/inspect/reconcile`), not a second model-facing dispatch surface.

## Public surface

Phase 0 and Phase A expose seven renamed operations. Phase B atomically exposes exactly eight:

1. `list_harnesses`
2. `spawn_agent`
3. `send_message`
4. `followup_task`
5. `wait_agent`
6. `interrupt_agent`
7. `list_agents`
8. `read_agent_messages`

Skill namespace is `$codex-harnessdock:*`; MCP namespace is `mcp__codex_harnessdock__*`. Unsupported capabilities return explicit unavailable/unsupported receipts instead of false parity.

## Review boundaries

- Phase 0: one identity/runtime/state lineage, safe rollback, no dual MCP, fresh-task loaded witness, no physical source rename.
- Phase A: service-shaped fake Driver, launch/session/turn truth, unknown lease retention, narrow Driver scope/prompt, legacy Claude parity, no public schema drift.
- Phase B: live compatibility probe, secret-safe loopback client, exact route/profile, no restart observer, conditional continuation, three bounded Explorer examples, exact metrics/mutation evidence, one atomic eight-operation generation.
- Phase R/later Drivers: source provenance and each new headless/API contract are independently reviewed; reference code never becomes runtime dependency.

No phase implicitly authorizes install/refresh, paid/live calls, commit/push, archive, publish, physical move, or the next phase.

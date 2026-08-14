## Why

After the HarnessDock identity and neutral control plane are accepted, OpenCode is the first service-backed Harness that can prove the architecture outside Claude Code. A read-only DeepSeek V4 Flash Explorer can absorb token-heavy repository research while Codex remains the initiating conversation, planner, verifier, final editor/reviewer, and acceptor.

Current evidence is intentionally incomplete. The requested candidate route is `opencode-go/deepseek-v4-flash`, but this checkout has not yet confirmed the installed CLI/Server model catalog, compatible SDK version, agent profile, server-incarnation/session semantics, provider telemetry, or lifecycle behavior. The implementation must discover and freeze those live facts before admission; this proposal does not turn documentation or remembered identifiers into local proof.

## What Changes

- Add one static experimental `opencode` Driver that attaches to an operator-managed loopback `opencode serve`; the Plugin does not install, login, start, stop, restart, dispose, or automate a TUI.
- Begin with a bounded compatibility probe: record installed `opencode`/Server versions, confirm the exact DeepSeek V4 Flash identifier with `opencode models` and Server/SDK discovery, inspect the actual API/SDK schema, then pin one compatible client contract. Production prefers the pinned SDK/HTTP path; `opencode run --attach` is diagnostic validation only.
- Admit only an exact discovered route with `harness=opencode`, full model identifier, `topology=leaf`, and `write=false`, one active turn at a time. No route field defaults or model substitution.
- Require a reviewed `codex-explorer` profile that denies mutation, shell, subagents/tasks, external directories, web/skills, deployment/publication, unknown custom/MCP tools, and interactive approval. Read-only remains a behavioral/Harness-policy boundary plus mutation evidence, not an OS sandbox.
- Use one fresh OpenCode session for each new Plugin Agent. Same-Agent terminal follow-up is enabled only if the pinned Server/SDK can prove the exact session binding and server/session incarnation across calls; otherwise the route declares `fresh_only` and Codex creates a new Agent.
- Persist a launch claim before prompt submission, a secret-free `NativeSessionRef` only after session binding, and a separate `NativeTurnRef` only after exact user-message/turn acceptance is proven. Ambiguous submission becomes unknown and is never replayed.
- Use the blocking prompt lineage as the process-local live turn and the matching outer-assistant response as the primary terminal witness. Initial OpenCode has no restart observation, automatic recovery, active input, public interrupt, native history, native orchestration, write authority, or approval broker.
- Keep a stable read-only prompt prefix and a bounded nonempty final assistant message, but do not force a Plugin-wide repository-research JSON ontology. Native tools/events/history stay in OpenCode; Codex receives the distilled final result plus bounded route/failure/usage receipts.
- Preserve exact provider-reported input/output/reasoning/cache-read/cache-write/cost fields when the pinned schema exposes them. Persistent Server reuse and provider prompt caching are measured separately and missing telemetry remains unknown.
- **BREAKING (public multi-Harness generation):** extend HarnessDock from seven to exactly eight operations by adding `list_harnesses`; make `spawn_agent` require explicit `harness`, full `model`, `topology`, and `write`; remove follow-up authority mutation; expose immutable route/capability maturity; and activate v3 Agent writes. The generic tools do not add universal `scope`, `questions`, endpoint, session, provider, or policy inputs.
- Require deterministic fake-Server coverage, zero-model-cost installed discovery, and three varied explicitly authorized real read-only successes through the loaded production Plugin. These prove experimental usability only; longer reliability/cache/economics/concurrency work remains field maturity.

Explicit non-goals:

- No CLI stdout/event-stream production parser, TUI/tmux/PID orchestration, Plugin-owned Server lifecycle, remote bind, dynamic endpoint/tool/profile/model override, direct provider API, or credential persistence.
- No OpenCode write/implementation Agent, auto-commit/merge/push, worktree management, same-Harness Plugin-Agent messaging, cross-Harness messaging, native Codex provider, automatic delegation/fallback/retry/fan-out, or forced result repair.
- No restart recovery/observation, interrupt, active steering, history import, native transcript scan, session adoption, or server-incarnation guess in the first release.
- No DeepSeek Harness, Grok Build, Pi, physical repository rename, public publication, or claim that three examples prove long-running stability, cache economics, general accuracy, or implementation-worker safety.

Lifecycle ordering: this change depends on accepted `rename-to-codex-harnessdock` and `generalize-multi-harness-agent-control-plane`. It is the sole change authorized to activate v3 public Agents and the eight-operation multi-Harness generation. Before implementation, re-run `openspec list` and rebase copied public-schema/receipt/card/usage/wait requirements against any accepted/archived `add-targeted-barrier-agent-join`, `expose-actionable-agent-blocking`, `improve-agent-card-and-usage-receipts`, `replace-wait-polling-with-event-wakeup`, and `harden-native-background-task-completion` result. Phase R physical source/deployment rename follows acceptance of this change and precedes a third Harness.

## Capabilities

### New Capabilities

- `opencode-explorer-runtime`: define the operator-owned Server boundary, live compatibility probe, exact discovered route/profile, launch/session/turn lineage, read-only result/metrics evidence, mutation witness, and staged acceptance.

### Modified Capabilities

- `harness-driver-runtime`: admit one experimental noninteractive OpenCode route beside Claude Code with initial-only input, capacity one, and no restart observation/recovery.
- `agent-thread-registry`: activate v3 writes for fully explicit Claude/OpenCode routes and make OpenCode continuation conditional on exact session/incarnation evidence.
- `typed-mcp-orchestration`: bump one public generation to the eight HarnessDock operations and require only explicit immutable route decisions at spawn.
- `canonical-agent-orchestration`: expose one policy-thin eight-Skill Harness-neutral family under `codex-harnessdock`.
- `local-runtime-boundary`: add the pinned client contract selected by the compatibility probe, loopback/operator-service configuration, inherited secret boundary, and no Server lifecycle ownership.
- `plugin-release-readiness`: update zero-cost discovery for eight tools/Skills and add a separate three-example real Explorer witness.

## Impact

Implementation affects the static Driver registry, Driver/session/turn reference schemas, environment/client/profile/prompt/result helpers, fake OpenCode Server fixtures, Agent/MCP generation, usage receipts, `runtime/index.mjs`, `plugins/codex-harnessdock/` Skills/manifests, release smoke, evaluation tooling, documentation, and tests. The operator retains the Server, account, login, credentials, Go subscription, and interactive configuration. Live calls, cutover/refresh, publish, release, commit, push, and archive remain separately authorized actions.

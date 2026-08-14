# OpenCode Explorer Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one exact read-only OpenCode/DeepSeek V4 Flash Explorer and atomically activate the explicit eight-operation HarnessDock multi-Harness generation.

**Architecture:** OpenSpec change [`add-opencode-explorer-driver`](../../../openspec/changes/add-opencode-explorer-driver/) is the sole scope/completion authority. Probe the configured local contract first, then pin a typed client. The Driver owns loopback/profile/protocol and exact launch/session/turn evidence; the core remains Harness-neutral and Codex remains the orchestrator/acceptor.

**Tech Stack:** Node.js 20.19+ ESM, JSDoc/checkJs, Zod, a compatibility-probe-selected exact `@opencode-ai/sdk` or separately approved generated OpenAPI client, `node:test`, in-process fake HTTP Server, repository-local OpenSpec.

## Global Constraints

- Do not begin until Phase 0 and Phase A are accepted at exact trees with no incompatible active/unknown jobs.
- Assume OpenCode is operator-installed/logged-in/configured, but independently prove versions/model/profile/protocol before admission.
- Operator owns `opencode serve`, auth, account, profile, and Go subscription. The Plugin never manages them or binds remote interfaces.
- Intended route is explicit `opencode` + exact discovered DeepSeek V4 Flash full ID + `leaf` + `write=false`, capacity one. No defaults/substitution.
- No active steering, interrupt, restart observation/recovery, native history, approval broker, orchestration, write, or automatic fallback/retry in the first release.
- Default tests/smoke use zero model tokens. Three real calls require explicit authorization and fixed guards.
- Do not install/refresh/release/archive/push or begin Phase R/later Harness work implicitly.

---

### Task 1: Probe and freeze the installed OpenCode contract

**Files:**
- Create: `scripts/probe-opencode-compatibility.mjs`
- Create: `tests/runtime/opencode-compatibility.test.mjs`
- Create: `tests/runtime/fixtures/opencode-compatibility.json`
- Modify only after evidence: `package.json`, package lockfile

- [ ] Write a zero-model probe/test harness for CLI version/models, Server health/version/catalog/profile, current OpenAPI/SDK types, blocking prompt shape, error/usage fields, and authoritative Server/session incarnation evidence.
- [ ] Run against the prepared operator Server and record sanitized fixtures; do not create a session/model request.
- [ ] Require exact confirmation of `opencode-go/deepseek-v4-flash`; if the actual identifier differs, stop and update OpenSpec before implementation.
- [ ] Select/pin the exact compatible client version. If no stable compatible SDK exists, stop for a reviewed generated OpenAPI-client decision; do not fall back to ad hoc HTTP or CLI parsing.
- [ ] Record continuation as exact-resume only with authoritative session/incarnation evidence; otherwise fresh-only.
- [ ] Run `node --test tests/runtime/opencode-compatibility.test.mjs` and inspect the dependency/lock diff.

### Task 2: Implement fixed-origin auth-safe client inspection

**Files:**
- Create: `runtime/opencode-client.mjs`
- Modify: `runtime/environment.mjs`
- Modify: `config/runtime.env`
- Create: `tests/runtime/opencode-client.test.mjs`
- Modify: `tests/runtime/environment.test.mjs`
- Create: `tests/runtime/fixtures/fake-opencode-server.mjs`

- [ ] Add failing inherited-only secret tests for official username/password keys and tracked-dotenv rejection/redaction.
- [ ] Add one fixed loopback URL and reject embedded credentials, remote hosts, query/fragment, redirect, proxy route, per-call endpoint, and unsupported scheme.
- [ ] Implement pinned client construction with optional Basic auth, composed connect/discovery/acceptance/turn deadlines, caller signal, fixed-origin redirect policy, and sanitized bounded errors.
- [ ] Implement side-effect-free discovery and fake cases for health/auth/catalog/profile/network/deadline/malformed responses with zero sessions/model calls.
- [ ] Run `node --test tests/runtime/opencode-client.test.mjs tests/runtime/environment.test.mjs tests/runtime/opencode-compatibility.test.mjs`.

### Task 3: Validate the route and resolved fixed-policy Explorer

**Files:**
- Create: `runtime/opencode-explorer-profile.mjs`
- Create: `config/opencode/codex-explorer.md`
- Create: `tests/runtime/opencode-explorer-profile.test.mjs`
- Extend: `tests/runtime/fixtures/fake-opencode-server.mjs`

- [ ] Add exact route/profile constants derived from the accepted compatibility fixture, not an implicit default.
- [ ] Validate `leaf`, read-only, `noninteractive_fixed_policy`, capacity one, exact model, and resolved default-deny profile.
- [ ] Deny edit/write/patch, shell, task/subagent, external, web, skill, deploy/publish, approval, and unknown custom/MCP tools; permit only reviewed read/list/glob/search/LSP inspection.
- [ ] Reject effort unless explicitly proven by the route, plus every dynamic profile/tool/instance/endpoint/session/permission override.
- [ ] Run `node --test tests/runtime/opencode-explorer-profile.test.mjs tests/runtime/opencode-client.test.mjs`.

### Task 4: Implement the narrow prompt/final-result boundary

**Files:**
- Create: `runtime/opencode-prompt.mjs`
- Create: `runtime/opencode-result.mjs`
- Create: `tests/runtime/opencode-prompt.test.mjs`
- Create: `tests/runtime/opencode-result.test.mjs`

- [ ] Add a stable prefix only for Explorer/read-only/leaf/tool/outer-final contract; pass bounded caller task text without Plugin task decomposition or methodology.
- [ ] Do not add generic public `scope/questions`; task-specific constraints and desired format stay inside `message`.
- [ ] Select exactly one matching nonempty bounded outer-assistant final text; reject empty/oversized/multiple/wrong-lineage/native-event/binary output.
- [ ] Do not parse terminal UI/tool history or require/repair a universal repository JSON schema.
- [ ] Run `node --test tests/runtime/opencode-prompt.test.mjs tests/runtime/opencode-result.test.mjs`.

### Task 5: Implement OpenCode launch/session/turn evidence

**Files:**
- Create: `runtime/opencode-driver.mjs`
- Modify: `runtime/harness-registry.mjs`
- Modify: `runtime/harness-capabilities.mjs`
- Modify: `runtime/agent-store.mjs`
- Create: `tests/runtime/opencode-driver.test.mjs`
- Modify: `tests/runtime/harness-driver-contract.test.mjs`
- Extend: `tests/runtime/fixtures/fake-opencode-server.mjs`

**Live handle:**

```js
{
  nativeSessionRef,
  nativeTurnRef,
  result,
  dispose
}
```

- [ ] Start only after durable launch claim/attempt/input digest and capacity lease.
- [ ] Create/bind one fresh session per new Agent and persist a validated session reference without treating it as turn acceptance.
- [ ] Start the pinned blocking prompt request and prove exact user-message/attempt/provider/model turn lineage before mailbox acknowledgement.
- [ ] Publish terminal only from the original settled request plus matching assistant lineage/finish/error and bounded final text.
- [ ] Map pre-transport rejection separately; map possible acceptance/lost worker/connection/deadline ambiguity to unknown, retain capacity, and forbid replay/replacement/fallback/observer.
- [ ] Expose no active input/interrupt/observe/history/recovery/team/write/broker method.
- [ ] Implement exact terminal follow-up only if compatibility evidence proves session/incarnation; otherwise fresh-only rejection.
- [ ] Run `node --test tests/runtime/opencode-driver.test.mjs tests/runtime/harness-driver-contract.test.mjs tests/runtime/launch-claim.test.mjs tests/runtime/native-reference.test.mjs`.

### Task 6: Normalize exact metrics and mutation evidence

**Files:**
- Modify: `runtime/terminal-metrics.mjs`
- Modify: `runtime/completion-inbox.mjs`
- Modify: `runtime/operator-usage-ledger.mjs`
- Modify: `tests/runtime/terminal-metrics.test.mjs`
- Modify: `tests/runtime/completion-inbox.test.mjs`
- Modify: `tests/runtime/operator-usage-ledger.test.mjs`

- [ ] Map only actual pinned finite provider/model/input/output/reasoning/cache-read/cache-write/cost facts with provider-reported provenance.
- [ ] Preserve root/Agent/turn/attempt/Harness/instance/full model/Driver/capability/topology/authority lineage; never merge equal model strings across Harnesses.
- [ ] Exclude URL/auth, prompts, transcript, tool history/events, raw errors, and arbitrary Server metadata.
- [ ] Add before/after mutation witnesses to live acceptance and fail on unapproved change without claiming containment.
- [ ] Keep Server reuse fields distinct from provider cache telemetry; never infer cache/cost from PID/latency.
- [ ] Run `node --test tests/runtime/terminal-metrics.test.mjs tests/runtime/completion-inbox.test.mjs tests/runtime/operator-usage-ledger.test.mjs`.

### Task 7: Activate exactly eight public HarnessDock operations

**Files:**
- Modify: `runtime/index.mjs`
- Modify: `runtime/agent-runtime.mjs`
- Modify: `runtime/mcp-api.mjs`
- Modify: `runtime/mcp-server.mjs`
- Modify: `runtime/mcp-call-worker.mjs`
- Modify: `runtime/cli.mjs`
- Modify: `runtime/operator-cli.mjs`
- Modify: `tests/runtime/mcp-server.test.mjs`
- Modify: `tests/runtime/harness-state-migration.test.mjs`
- Modify: `tests/runtime/agent-card.test.mjs`

- [ ] Add `list_harnesses` with no arguments/side effects/ranking and bounded readiness/route/capability/maturity/capacity.
- [ ] Require spawn `task_name/message/harness/full model/topology/write`; allow only optional description and Driver-discriminated effort.
- [ ] Remove delegation-mode/default route/write mutation and reject scope/questions plus Driver/profile/endpoint/session/tool/config selectors.
- [ ] Make follow-up inherit route/authority and obey exact-resume/fresh-only; keep send queue-only and interrupt/history explicitly unsupported for OpenCode.
- [ ] Activate v3 only after complete route validation, preserve v1/v2 Claude control, and expose bounded route/maturity receipts without native IDs.
- [ ] Bump one MCP generation and prove mixed Harness Agents under one root with no direct cross-Harness messaging.
- [ ] Run `node --test tests/runtime/mcp-server.test.mjs tests/runtime/harness-state-migration.test.mjs tests/runtime/agent-card.test.mjs`.

### Task 8: Update eight Skills, docs, and operator diagnostics

**Files:**
- Create: `plugins/codex-harnessdock/skills/list-harnesses/SKILL.md`
- Create: `plugins/codex-harnessdock/skills/list-harnesses/agents/openai.yaml`
- Modify: seven existing HarnessDock Skills/discovery YAML
- Modify: `README.md`
- Modify: Plugin/marketplace manifests and tests as required
- Modify: `tests/runtime/plugin-contract.test.mjs`
- Modify: `tests/runtime/operator-diagnostics.test.mjs`

- [ ] Add exactly the eighth Skill and update seven others for explicit route fields, immutable authority, capability truth, Experimental status, and research-not-ground-truth guidance.
- [ ] Keep Skills policy-thin: no threshold/ranking/auto-delegation/fan-out/fallback/retry/conflict/cost/implementation policy.
- [ ] Document operator-owned loopback Server/auth/profile, manual `serve/models/run --attach` diagnostics, unsupported capabilities, fresh-only possibility, and Codex-led fallback.
- [ ] Document Phase R then DeepSeek Harness/Grok probes, with Pi reference-only and no TUI automation.
- [ ] Run `node --test tests/runtime/plugin-contract.test.mjs tests/runtime/operator-diagnostics.test.mjs tests/runtime/version-and-bootstrap.test.mjs`.

### Task 9: Run deterministic and installed zero-cost acceptance

**Files:**
- Create: `tests/runtime/opencode-integration.test.mjs`
- Modify: `runtime/release-smoke.mjs`
- Modify: `scripts/release-smoke.mjs`
- Modify: `tests/runtime/release-smoke.test.mjs`

- [ ] Exercise fake MCP → runtime → launch/session/turn → assistant completion, including exact-resume or fresh-only fixture branch.
- [ ] Cover model/profile/auth/quota-like/provider/result/submission/worker-loss/unknown/redaction/mutation/capacity failures.
- [ ] Update installed smoke for eight renamed Skills/tools, route discovery, strict schema, legacy Claude, no old MCP identity, and no model/Server lifecycle side effect.
- [ ] Run `node --test tests/runtime/opencode-integration.test.mjs tests/runtime/release-smoke.test.mjs`, then `npm run check`, strict OpenSpec validation, and `git diff --check`.

### Task 10: Run three real examples and write the evidence report

**Files:**
- Create: `scripts/evaluate-opencode-explorer.mjs`
- Create: `docs/opencode-worker-evaluation.md`

- [ ] Require an explicit live flag, exact compatibility/route/profile preflight, known workspace baseline, capacity one, deadlines, and artifact root before model usage.
- [ ] Run fresh architecture exploration; then exact terminal follow-up only with incarnation proof or a second fresh Agent; then mixed Claude/OpenCode or documented fresh substitute.
- [ ] Capture versions/catalog/profile, launch/session/turn lineage, latency, exact metrics, Server reuse, mutation witness, final result, and sampled Codex verification.
- [ ] Stop on mutation, wrong route, ambiguous acceptance/settlement, empty result, materially false sample, or auth/account/quota evidence; do not fallback/retry another route.
- [ ] Fill the twelve requested questions and bounded GO/GO WITH CHANGES/NO-GO using only actual evidence; label reliability/cache/economics/concurrency unknown where unmeasured.

### Task 11: Final review and handoff

- [ ] Freeze the exact tree and request read-only review for secrets/origin escape, false acceptance/terminal, replay, incarnation crossover, unknown release, unsafe profile, public partial migration, and accidental routing policy.
- [ ] Disposition findings and rerun affected focused/full/live gates.
- [ ] Record exact tree, installed versions/route/profile, continuation mode, artifacts/metrics/mutation, unresolved maturity, rollback, Phase R, and later Harness prerequisites.
- [ ] Leave install/refresh/release/archive/push, twenty-task work, physical rename, implementation workers, DeepSeek Harness, and Grok Build for separate authorized tasks.

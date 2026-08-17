## 1. Revalidate Prerequisites And Probe The Installed Contract

- [x] 1.1 Verify `rename-to-codex-harnessdock` and `generalize-multi-harness-agent-control-plane` are candidate-accepted at exact trees with fresh checkout-level gates/reviews, v3 validation/launch claims/session-turn references/legacy Claude adapter/unknown leases work, and no incompatible active or unknown job exists; the renamed intermediate generation need not be installed.
- [x] 1.2 Add a zero-model compatibility probe that records sanitized `opencode --version`, Server health/version, exact `opencode models` match for DeepSeek V4 Flash, resolved `codex-explorer` profile, available OpenAPI/SDK version/types, and authoritative server/session incarnation evidence if any.
- [x] 1.3 Run the probe against the operator-owned configured Server without creating a model request; if the actual full model identifier differs from `opencode-go/deepseek-v4-flash` or required protocol facts are unavailable, stop for an OpenSpec update rather than aliasing.
- [x] 1.4 Capture sanitized compatibility fixtures and pin exactly one proven client dependency/version; add tests forbidding a Server-spawning helper, CLI stdout lifecycle parser, raw provider client, range/latest dependency, or silent HTTP fallback.
- [x] 1.5 Record whether OpenCode continuation is `exact_resume` with authoritative session/incarnation evidence or `fresh_only`; do not make this an implementation guess.

## 2. Build The Fixed-Origin Secret-Safe Client

- [x] 2.1 Add failing tests proving OpenCode username/password come only from the inherited operator environment allowlist, are rejected in tracked dotenv, and never enter merged env, logs, errors, prompts, references, receipts, or fixtures.
- [x] 2.2 Add the one tracked loopback Server URL setting and test normalization/rejection for credentials, remote/non-loopback hosts, query/fragment, redirect, proxy routing, and per-call endpoint override.
- [x] 2.3 Implement `runtime/opencode-client.mjs` with the pinned client, fixed-origin authenticated fetch, loopback proxy bypass, composed deadlines/cancellation, response bounds, and closed sanitized errors.
- [x] 2.4 Implement side-effect-free health/catalog/profile inspection and fake-Server cases for ready, auth failure, unavailable, redirect, network loss, deadline, malformed response, and proof of no session/model request.
- [x] 2.5 Run focused environment/client/compatibility tests and inspect dependency/lockfile changes for unrelated churn.

## 3. Validate The Exact Route And Explorer Profile

- [x] 3.1 Add a reviewed `config/opencode/codex-explorer.md` operator template with fixed-policy default deny and only repository read/list/glob/search/LSP inspection admitted.
- [x] 3.2 Implement exact route/profile validation for discovered Harness/model, `leaf`, `write=false`, `noninteractive_fixed_policy`, capacity one, and actual resolved profile denial of edit/shell/task/subagent/external/web/skill/deploy/publish/approval/unknown custom or MCP tools.
- [x] 3.3 Reject omitted/aliased model, model substitution, reasoning effort not proven by the route, topology change, write authority, dynamic tool/profile/instance/endpoint/session selectors, and any broker-required route before session creation.
- [x] 3.4 Add readiness tests for missing/wrong model, profile drift, unsafe permission, unknown tool, broker requirement, full capacity, and exact successful discovery with bounded maturity facts.

## 4. Implement The Narrow Prompt And Result Boundary

- [x] 4.1 Implement `runtime/opencode-prompt.mjs` with one versioned stable prefix limited to Explorer/read-only/leaf authority, admitted-tool boundary, caller task text, concise evidence/unknowns request, and outer-final-only return contract.
- [x] 4.2 Bound task input and total prompt without adding generic public `scope` or `questions` fields or Plugin-owned task decomposition/methodology.
- [x] 4.3 Implement `runtime/opencode-result.mjs` to select exactly one matching nonempty bounded outer-assistant final text and optional closed metadata; do not parse terminal UI, native tool history, or require a repository JSON ontology.
- [x] 4.4 Add tests for empty/oversized/multiple/wrong-lineage parts, provider errors, unexpected binary/structured content, control characters, and deterministic bounded text normalization.

## 5. Implement Launch, Session, And Turn Lineage

- [x] 5.1 Implement first-turn session creation only after the supervisor's launch claim/attempt and instance lease are durable; prove and persist a secret-free `NativeSessionRef` without treating it as turn acceptance.
- [x] 5.2 Start the pinned blocking/synchronous prompt call as the worker-local LiveTurn and prove a distinct `NativeTurnRef` from exact session/user-message/attempt/provider/model lineage before mailbox acknowledgement.
- [x] 5.3 Resolve terminal success only from the original settled request plus matching assistant session/parent/provider/model/finish/error evidence and a valid bounded final text.
- [x] 5.4 Classify pre-transport rejection separately from acceptance unknown; on connection/worker/deadline ambiguity retain capacity, publish no completion, and never replay, fallback, create a replacement session, or call an observer.
- [x] 5.5 Expose no active-input, interrupt, restart-observe, recovery, history, native-orchestration, approval-broker, or write methods in the initial Driver.
- [x] 5.6 If the compatibility fixture proves authoritative session/incarnation binding, implement terminal same-Agent exact follow-up; otherwise publish `fresh_only` and reject follow-up before mailbox/native mutation.
- [x] 5.7 Add fake-Server tests for immediate/delayed acceptance, response-before-observation, pre/post-submission failure, wrong/duplicate lineage, provider failure, session isolation, restart/reset uncertainty, conditional continuation, and capacity serialization.

## 6. Preserve Metrics, Persistence, And Mutation Evidence

- [x] 6.1 Map only exact finite provider-reported input/output/reasoning/cache-read/cache-write/cost fields exposed by the pinned assistant schema and keep absent/malformed fields unknown.
- [x] 6.2 Key usage by root, Agent, turn, attempt, Harness, instance, full model, Driver/capability version, topology, and authority; prove same-model different-Harness records never merge.
- [x] 6.3 Persist bounded route/session/turn/attempt provenance while excluding origin credentials, prompt bodies, full native transcript, tool events/history, raw HTTP/provider errors, and arbitrary Server metadata.
- [x] 6.4 Add repository/workspace before-after mutation witnesses to real acceptance; any unapproved mutation fails the example without upgrading prompt/Harness policy to an OS containment claim.
- [x] 6.5 Add tests and report fields that keep persistent Server reuse separate from provider cache telemetry and never infer cache hits, uncached input, pricing, savings, or subscription charge from PID/latency.

## 7. Activate The Eight-Operation Public Generation

- [ ] 7.1 Statically admit exactly `claude-code` and the discovered `opencode` route, with all protocol-specific construction behind Driver factories and `runtime/index.mjs`.
- [ ] 7.2 Add `list_harnesses` through runtime facade, isolated worker, MCP, operator CLI, tests, and `$codex-harnessdock:list-harnesses`; report readiness/route/capability/maturity/capacity without ranking or selection.
- [ ] 7.3 Change `spawn_agent` to require `task_name`, `message`, `harness`, full `model`, `topology`, and `write`, with only optional `description` and Driver-discriminated `reasoning_effort`; no route field or legacy delegation mode defaults.
- [ ] 7.4 Make `followup_task` inherit immutable route/authority and accept only target/message plus admitted effort; remove write mutation and do not add generic scope/questions, endpoint/profile/session/tool/policy selectors.
- [ ] 7.5 Expose bounded immutable route/maturity lineage in spawn/list/wait/completion and explicit unsupported receipts in interrupt/history; activate v3 writes only after complete route validation.
- [ ] 7.6 Bump the HarnessDock MCP generation once, preserve v1/v2 Claude control, reject stale old schemas before mutation, and prove one root can explicitly own different Harness Agents without direct cross-Harness messaging.

## 8. Update Skills, Operator Surfaces, And Architecture Roadmap

- [ ] 8.1 Add `plugins/codex-harnessdock/skills/list-harnesses/` and update the seven existing Skills for the exact eight-operation surface, explicit spawn route, Experimental capability truth, and concise context budget.
- [ ] 8.2 Keep guidance policy-thin: no routing threshold/ranking, auto-delegation/fan-out/fallback/retry, conflict resolution, cost optimizer, research ontology, implementation policy, or cross-Harness messaging.
- [ ] 8.3 Update manifests/package checks, README/operator docs, doctor/status/inspect/reconcile guidance, and examples for operator-owned loopback Server/auth/profile, CLI attach as diagnostic, unsupported first-release capabilities, and Codex-led fallback.
- [ ] 8.4 Document Phase R physical rename after Phase B, then independent DeepSeek Harness and Grok Build probes; record Pi as reference-only and forbid TUI automation.

## 9. Deterministic Acceptance And Installed-Smoke Preparation

- [ ] 9.1 Run the shared Driver contract suite and a full fake OpenCode path through MCP → runtime → launch claim → session/turn references → completion, including the conditional continuation branch.
- [ ] 9.2 Cover auth/quota-like/provider/profile/model failures, secret redaction, malformed result, submission uncertainty, worker loss, unknown lease retention, no restart observation, mutation witness, and idempotent reconciliation.
- [ ] 9.3 Update and unit/integration-test zero-model-cost installed-smoke logic for exactly eight renamed Skills/tools, side-effect-free Harness discovery, explicit schema rejection, legacy Claude control, and no model request or Server lifecycle mutation; defer execution against the installed snapshot until consolidated activation.
- [ ] 9.4 Run all focused tests, `npm run check`, `git diff --check`, `openspec validate add-opencode-explorer-driver --strict`, and `openspec validate --all --strict`; inspect the complete diff for stale namespace, accidental policy, and unrelated paths.

## 10. Run Three Explicitly Authorized Real Explorer Examples

- [ ] 10.1 Add `scripts/evaluate-opencode-explorer.mjs` with explicit live authorization, exact compatibility/route/profile preflight, clean/known workspace witness, capacity one, bounded deadlines, and fixed artifact root before any model request.
- [ ] 10.2 Through the loaded Plugin run a fresh architecture Explorer, then either an exact terminal follow-up with proven session/incarnation or a second fresh Agent proving `fresh_only`, then a mixed Claude/OpenCode root or documented fresh substitute.
- [ ] 10.3 For each success capture Server/client/catalog/profile versions, route/attempt/session/turn lineage, latency, exact provider metrics, Server-reuse facts, repository mutation witness, bounded result, and sampled Codex verification; stop on mutation, wrong route, ambiguity, empty result, material false finding, auth/account/quota.
- [ ] 10.4 Populate `docs/opencode-worker-evaluation.md` with measured facts, unavailable telemetry, the twelve requested architecture answers, and bounded `GO`, `GO WITH CHANGES`, or `NO-GO`; do not fill unknown cache/economics/reliability with inference.
- [ ] 10.5 Record twenty-task reliability, separate-session/cache benchmark, one/two/four concurrency, idle/crash behavior, real-workday economics, interrupt/history, implementation worker, DeepSeek Harness, and Grok Build as subsequent maturity/changes rather than release-complete claims.

## 11. Candidate Review And Consolidated-Activation Handoff

- [ ] 11.1 Freeze the exact candidate tree and request fresh read-only review for secret leakage, remote-origin escape, false acceptance/settlement, session/incarnation crossover, replay, unknown lease release, unsafe profile, partial public generation, and accidental routing policy.
- [ ] 11.2 Disposition every finding, rerun all affected focused/full/live gates, and mark tasks complete only from fresh evidence.
- [ ] 11.3 Before activation, record exact candidate commit/tree, probed OpenCode/Server/client/model/profile facts, continuation mode, unknown states, and one operator runbook for production promotion, identity/data cutover, install/refresh, Codex restart, installed smoke, live examples, rollback, and Phase R prerequisites. Append artifact/metrics/mutation receipts after that runbook is executed.
- [ ] 11.4 Leave production promotion, data cutover, install/refresh, Codex restart, live model calls, release/archive/push, maturity runs, physical production-source rename, later Harnesses, and implementation workers for separate authorization; these form the deliberate manual stop boundary after all candidate code/tests are complete.

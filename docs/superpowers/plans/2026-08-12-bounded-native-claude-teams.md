# Bounded Native Claude Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to execute this plan one task at a time.
>
> This is a non-authoritative execution companion. The sole behavior, scope,
> and completion authority is
> [`openspec/changes/enable-bounded-native-claude-teams/`](../../../openspec/changes/enable-bounded-native-claude-teams/).
> If a step below conflicts with OpenSpec, stop and correct this plan before
> changing code.

**Goal:** Implement an explicit, bounded Claude Native Agent Team behind the
unchanged seven-operation CC Agent interface, with exact Opus/Fable lead
admission, stable Haiku/Sonnet/Opus teammate definitions, honest behavioral
boundaries, and fail-closed compatibility evidence.

**Architecture:** `runtime/claude-native-team-policy.mjs` owns only pure role,
definition, prompt, deny, semantic-limit, alias, and classification policy.
`runtime/execution-profile.mjs` alone translates that policy into Claude CLI
arguments and environment. The adapter serializes one `--agents` value and
projects bounded structured evidence. Driver `claude-code@2` preserves the
durable parent lifecycle but never auto-reconnects a possibly started native
team; an explicit follow-up starts a fresh team.

**Tech stack:** Node.js 20.19+ ESM, `node:test`, Claude Code stream-json CLI,
MCP/Zod schemas, OpenSpec.

## Global constraints

- Work only in `/data/CoordExp/cc-plugin-codex-dev` on `developer`.
- Follow red-green-refactor. Each task starts from the named failing test and
  ends with its focused verification before moving on.
- `runtime/index.mjs` remains the sole public lifecycle interface.
- The public MCP topology remains exactly seven operations and the public
  `delegation_mode` remains `leaf | claude_orchestrator`.
- `runtime/execution-profile.mjs` remains the sole Claude override owner.
- Agent Teams are explicit and experimental. Never fall back silently to an
  ordinary unnamed subagent.
- Terminal parity retains `IS_SANDBOX=1` and
  `--dangerously-skip-permissions`; `write` and member write surfaces remain
  behavioral authority, not filesystem isolation.
- Native Auto Memory and teammate `memory: local` remain Claude-owned. Never
  read, merge, lock, redirect, clean, or expose memory contents.
- Do not add Plugin-owned teammate identities, mailboxes, task state,
  transcripts, progress, cost attribution, or recovery.
- Do not add a general Claude tool allowlist or a second environment loader.
- Do not change version, manifest cachebuster, install state, merge state,
  release state, or publication state while executing this plan.
- No real Claude call runs in `npm run check`. The paid witness is separately
  authorized and stops on subscription/quota limits.
- At each commit checkpoint, stage only the files named by that task, inspect
  `git diff --cached`, and omit unrelated user changes.

---

### Task 1: Add the pure native-team policy

**OpenSpec authority:**
`specs/canonical-agent-orchestration/spec.md` and
`specs/native-claude-team-orchestration/spec.md`

**Files:**
- Create: `runtime/claude-native-team-policy.mjs`
- Create: `tests/runtime/claude-native-team-policy.test.mjs`

**Required internal interface:**

```js
export const NATIVE_TEAM_POLICY_REVISION = "cc-native-team-v1";

export function deriveNativeCohortLabel(jobId) {}

export function resolveNativeTeamPolicy({
  model,
  delegationMode,
  write,
  jobId,
}) {
  return {
    role,
    cohortLabel,
    prompt,
    deniedToolNames,
    teammateDefinitions,
    necessaryCoordinationToolNames,
    limits: {
      maxSpawnDepth: 1,
      maxConcurrentTeammates: 3,
      maxCreations: 6,
    },
  };
}

export function canonicalizeInitToolName(name) {}
export function assessObservedNativeSurface(input) {}
```

The policy result must not contain `childEnv`, `CLAUDE_CODE_*`, CLI argument
names, retry settings, or persistence decisions.

- [ ] **1.1 Write failing role/definition tests.** Cover exact Opus/Fable
  orchestrators, Sonnet/Haiku orchestrator rejection, Haiku `write:true`
  rejection, stable job-derived labels, exactly three ordered definitions,
  exact model IDs, `memory: "local"`, no definition effort/background/
  isolation/permission/skills/MCP overrides, and frozen deterministic output.
- [ ] **1.2 Write failing tool/classification tests.** Cover init `Task` ->
  canonical `Agent`, the complete reviewed deny matrix, lead/member/leaf
  differences, necessary coordination names, `mcp__*` exclusion from native
  drift, unknown-native warning, and classification before any display cap.
- [ ] **1.3 Run the red test.**

  ```bash
  node --test tests/runtime/claude-native-team-policy.test.mjs
  ```

  Expected: `ERR_MODULE_NOT_FOUND` or the new assertions fail.
- [ ] **1.4 Implement the minimal pure module.** Stable teammate definitions are
  `haiku-scout`, `sonnet`, and `opus`. Definitions own the exact requested
  model; member prompts require the lead to omit call-level `model`,
  `isolation`, remote/worktree/fork inputs, and nested delegation. Numeric
  limits are semantic labels, not runtime enforcement claims.
- [ ] **1.5 Run focused tests and lint.**

  ```bash
  node --test tests/runtime/claude-native-team-policy.test.mjs
  npx eslint runtime/claude-native-team-policy.mjs tests/runtime/claude-native-team-policy.test.mjs
  ```

- [ ] **1.6 Commit the isolated policy unit.**

  ```bash
  git add runtime/claude-native-team-policy.mjs tests/runtime/claude-native-team-policy.test.mjs
  git diff --cached --check
  git commit -m "feat: define bounded native Claude team policy"
  ```

---

### Task 2: Translate policy in the execution profile and environment

**OpenSpec authority:** `specs/claude-session-execution/spec.md`

**Files:**
- Modify: `runtime/execution-profile.mjs`
- Modify: `runtime/environment.mjs`
- Modify: `tests/runtime/execution-profile.test.mjs`
- Modify: `tests/runtime/environment.test.mjs`
- Modify: `tests/runtime/agent-launch-boundary.test.mjs`

**Target composition:**

```js
const policy = resolveNativeTeamPolicy({
  model,
  delegationMode,
  write: Boolean(options.write),
  jobId: options.jobId,
});

// Only execution-profile.mjs may map these semantics to Claude controls.
env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH = String(policy.limits.maxSpawnDepth);
env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS = String(
  policy.limits.maxConcurrentTeammates,
);
delete env.CLAUDE_CODE_SUBAGENT_MODEL;
```

- [ ] **2.1 Add failing route-boundary tests.** Invalid combinations must fail
  before readiness, Agent registration, job preparation, or worker start.
  Valid Opus/Fable orchestrators must require a durable `jobId`; leaves retain
  current behavior.
- [ ] **2.2 Add failing profile tests.** Assert Agent Teams env is orchestrator-
  only; the one-layer boundary and residual ordinary-subagent concurrency guard
  are mapped by the profile; one
  deterministic `agents` object is produced; `CLAUDE_CODE_SUBAGENT_MODEL` is
  removed only for orchestrators; no call-level teammate model is introduced;
  the prompt labels three/six limits as behavioral or host-hint boundaries.
- [ ] **2.3 Add the selected-env Auto Memory regression.** Supply an explicit
  env file that omits `CLAUDE_CODE_DISABLE_AUTO_MEMORY` and assert the final
  model-facing environment still contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`.
  Also prove a selected file value of `1` cannot disable it.
- [ ] **2.4 Run the red tests.**

  ```bash
  node --test \
    tests/runtime/execution-profile.test.mjs \
    tests/runtime/environment.test.mjs \
    tests/runtime/agent-launch-boundary.test.mjs
  ```

- [ ] **2.5 Implement the minimal mapping.** Keep stable CLI names out of the
  pure policy. Force Auto Memory after one-file environment resolution. Preserve
  all terminal-parity behavior not explicitly changed by OpenSpec.
- [ ] **2.6 Run focused tests, lint, and typecheck.**

  ```bash
  node --test \
    tests/runtime/execution-profile.test.mjs \
    tests/runtime/environment.test.mjs \
    tests/runtime/agent-launch-boundary.test.mjs
  npx eslint runtime/execution-profile.mjs runtime/environment.mjs \
    tests/runtime/execution-profile.test.mjs tests/runtime/environment.test.mjs \
    tests/runtime/agent-launch-boundary.test.mjs
  npx tsc --noEmit
  ```

- [ ] **2.7 Commit the profile/environment unit.**

  ```bash
  git add runtime/execution-profile.mjs runtime/environment.mjs \
    tests/runtime/execution-profile.test.mjs tests/runtime/environment.test.mjs \
    tests/runtime/agent-launch-boundary.test.mjs
  git diff --cached --check
  git commit -m "feat: compose native Claude team execution profile"
  ```

---

### Task 3: Serialize definitions and admit the observed native surface

**OpenSpec authority:** `specs/claude-version-compatibility/spec.md` and
`specs/claude-session-execution/spec.md`

**Files:**
- Modify: `runtime/claude-headless-adapter.mjs`
- Modify: `runtime/claude-code-driver.mjs`
- Modify: `runtime/claude-version-compatibility.mjs`
- Modify: `runtime/harness-failure-classes.mjs`
- Modify: `runtime/agent-blocking.mjs`
- Modify: `tests/runtime/adapter.test.mjs`
- Modify: `tests/runtime/claude-version-compatibility.test.mjs`
- Modify: `tests/runtime/harness-driver-contract.test.mjs`
- Modify: `tests/runtime/agent-blocking.test.mjs`
- Modify: `tests/runtime/harness-claude-parity.test.mjs`

**Admission result shape:**

```js
{
  observed: true,
  delegationMode: "claude_orchestrator",
  definitionNames: ["haiku-scout", "opus", "sonnet"],
  canonicalToolNames: ["Agent", "SendMessage", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"],
  missingDefinitions: [],
  missingNecessaryCoordinationTools: [],
  forbiddenTools: [],
  unknownNativeTools: [],
  denySetLiveValidated: true,
  teamTransportLiveValidated: false,
}
```

- [ ] **3.1 Add failing adapter serialization tests.** Assert one `--agents`
  argument, canonical deterministic JSON, no duplicate definition source, and
  rejection of malformed/non-closed definitions. Init evidence must retain only
  bounded names/classification fields, never prompts, messages, session IDs,
  transcripts, tool inputs, or memory contents.
- [ ] **3.2 Add failing surface-admission tests.** An orchestrator requires the
  three definition names and necessary coordination names at init, but those
  names do not prove Agent Teams. The first named Agent tool result must be
  structured `status: teammate_spawned`; an ordinary-subagent result maps to
  `compatibility_surface_drift` and public `harness_incompatible` and cannot be
  accepted as native-team work. Missing definitions/necessary names and
  reviewed forbidden leakage use the same mapping. Unknown non-forbidden
  native tools warn; leaves may run without inventory and remain
  `denySetLiveValidated:false`.
- [ ] **3.3 Add the `Task` alias and ordering tests.** Classification must see
  the complete normalized inventory before storing/displaying a bounded list.
  Extension namespaces such as `mcp__*` must not become unknown native drift.
- [ ] **3.4 Run the red tests.**

  ```bash
  node --test \
    tests/runtime/adapter.test.mjs \
    tests/runtime/claude-version-compatibility.test.mjs \
    tests/runtime/harness-driver-contract.test.mjs \
    tests/runtime/agent-blocking.test.mjs \
    tests/runtime/harness-claude-parity.test.mjs
  ```

- [ ] **3.5 Implement minimal serialization/admission.** Add `--agents` to the
  zero-model required CLI surface. Do not make static help or init tool names
  claim the Agent Teams gate is active. Inspect the first named Agent result,
  set `teamTransportLiveValidated:true` only for `status: teammate_spawned`, and
  fail the turn otherwise. Keep production structured evidence bounded and
  content-free.
  Thread the optional witness callback through the existing internal Driver
  `startTurn` seam only; production public jobs omit it.
- [ ] **3.6 Run focused tests, lint, and typecheck.**

  ```bash
  node --test \
    tests/runtime/adapter.test.mjs \
    tests/runtime/claude-version-compatibility.test.mjs \
    tests/runtime/harness-driver-contract.test.mjs \
    tests/runtime/agent-blocking.test.mjs \
    tests/runtime/harness-claude-parity.test.mjs
  npx eslint runtime/claude-headless-adapter.mjs runtime/claude-code-driver.mjs \
    runtime/claude-version-compatibility.mjs runtime/harness-failure-classes.mjs \
    runtime/agent-blocking.mjs \
    tests/runtime/adapter.test.mjs tests/runtime/claude-version-compatibility.test.mjs \
    tests/runtime/harness-driver-contract.test.mjs tests/runtime/agent-blocking.test.mjs \
    tests/runtime/harness-claude-parity.test.mjs
  npx tsc --noEmit
  ```

- [ ] **3.7 Commit the adapter/admission unit.** Stage exactly the Task 3 files,
  inspect the cached diff, then commit with:

  ```bash
  git commit -m "feat: admit observed Claude team surface"
  ```

---

### Task 4: Bump Driver identity and prevent unsafe team reconnect

**OpenSpec authority:** `specs/claude-session-execution/spec.md`

**Files:**
- Modify: `runtime/claude-code-driver.mjs`
- Modify: `runtime/job-supervisor.mjs`
- Modify: `tests/runtime/harness-driver-contract.test.mjs`
- Modify: `tests/runtime/harness-state-migration.test.mjs`
- Modify: `tests/runtime/agent-session-conflict.test.mjs`
- Modify: `tests/runtime/supervisor.test.mjs`
- Modify: `tests/runtime-integration/runtime-cli.test.mjs`

- [ ] **4.1 Add failing Driver-version tests.** Require
  `CLAUDE_CODE_DRIVER_VERSION === "claude-code@2"`; reject an `@1` prepared job
  under `@2` and an `@2` job after rollback to `@1`; preserve active-process
  interrupt/control without reconstructing a route.
- [ ] **4.2 Add failing recovery tests.** Leaf transport recovery remains
  unchanged. An orchestrator receives `maxReconnectAttempts: 0`; after a
  transport-shaped close it returns the structured failure and parent
  continuation evidence. A later explicit follow-up starts a new job-derived
  cohort label/team while retaining the durable parent Agent/Claude session.
- [ ] **4.3 Run the red tests.**

  ```bash
  node --test \
    tests/runtime/harness-driver-contract.test.mjs \
    tests/runtime/harness-state-migration.test.mjs \
    tests/runtime/agent-session-conflict.test.mjs \
    tests/runtime/supervisor.test.mjs \
    tests/runtime-integration/runtime-cli.test.mjs
  ```

- [ ] **4.4 Implement the minimal Driver/retry changes.** Thread `jobId` into
  profile creation, bump the Driver constant, and derive mode-specific retry
  policy before `runClaudeTaskSession`. Do not persist native teammate state or
  attempt to address old teammate names on follow-up.
- [ ] **4.5 Run focused tests, lint, and typecheck.** Use the command from 4.3,
  then ESLint the touched runtime/tests and run `npx tsc --noEmit`.
- [ ] **4.6 Commit the Driver/recovery unit.** Stage only Task 4 files and commit:

  ```bash
  git commit -m "feat: version native team turns and recovery"
  ```

---

### Task 5: Persist bounded compatibility observations and doctor evidence

**OpenSpec authority:** `specs/claude-version-compatibility/spec.md` and
`specs/runtime-operations-diagnostics/spec.md`

**Files:**
- Modify: `runtime/claude-version-compatibility.mjs`
- Modify: `runtime/job-store.mjs`
- Modify: `runtime/operator-diagnostics.mjs`
- Modify: `tests/runtime/claude-version-compatibility.test.mjs`
- Modify: `tests/runtime/job-store.test.mjs`
- Modify: `tests/runtime/operator-diagnostics.test.mjs`

- [ ] **5.1 Add failing persistence tests.** Retain at most sixteen latest
  sanitized observations across executable fingerprint and delegation mode;
  deterministic oldest non-current eviction; owner-only atomic writes; legacy
  records stay readable but cannot become live validation.
- [ ] **5.2 Add failing privacy tests.** Seed prompt, tool input, output,
  transcript, session, roster, model message, and memory sentinels; assert none
  enters the observation file or doctor output.
- [ ] **5.3 Add failing doctor tests.** Report `denySetLiveValidated`,
  `teamTransportLiveValidated`, missing definitions/necessary names, forbidden
  leakage, unknown native drift, and no-observation state. The wording must say
  reviewed deny-set validation and first-spawn transport proof, never universal
  containment.
- [ ] **5.4 Run the red tests.**

  ```bash
  node --test \
    tests/runtime/claude-version-compatibility.test.mjs \
    tests/runtime/job-store.test.mjs \
    tests/runtime/operator-diagnostics.test.mjs
  ```

- [ ] **5.5 Implement bounded storage/projection.** Store only names, policy
  revision, executable fingerprint/mode, classification, and timestamp. The
  compatibility classifier consumes the full normalized set before truncating
  any displayed names.
- [ ] **5.6 Run focused tests, lint, and typecheck.** Use the command from 5.4,
  ESLint touched files, then `npx tsc --noEmit`.
- [ ] **5.7 Commit the evidence/doctor unit.** Stage only Task 5 files and commit:

  ```bash
  git commit -m "feat: diagnose bounded native team compatibility"
  ```

---

### Task 6: Update every model-visible contract and fake release witness

**OpenSpec authority:** all delta specs, especially
`specs/plugin-release-readiness/spec.md`

**Files:**
- Modify: all seven `plugins/cc-for-pein/skills/*/SKILL.md` files
- Modify: `plugins/cc-for-pein/skills/spawn-agent/agents/openai.yaml`
- Modify: `runtime/mcp-server.mjs`
- Modify: `README.md`
- Modify: `runtime/release-smoke.mjs`
- Modify: `tests/runtime/plugin-contract.test.mjs`
- Modify: `tests/runtime/mcp-server.test.mjs`
- Modify: `tests/runtime/release-smoke.test.mjs`

- [ ] **6.1 Add failing contract tests.** All model-visible surfaces must call
  `claude_orchestrator` an experimental Native Agent Team lead for exact
  Opus/Fable only; state definition-owned model selection, intended versus
  inherited effort, behavioral write/numeric controls, local memory exception,
  same-team messaging, fresh-team follow-up, first-spawn transport proof, and
  rejection of ordinary-subagent output rather than an impossible pre-call
  server-gate guarantee.
  The MCP tool count remains seven.
- [ ] **6.2 Add a fake production-shaped witness.** Directly invoke the
  production Driver/profile/adapter using the same optional in-process callback
  as the paid witness; do not add MCP fields, cross-process IPC, or durable
  teammate-event state. Test definition/type/name and first
  `teammate_spawned` observation, one
  current-team message, both settle signals, final parent synthesis, missing
  evidence remaining unverified, and account-limit stop with no later paid
  attempt.
- [ ] **6.3 Add disposable-workspace mutation tests.** The fake controller
  creates a dedicated temporary Git repository with fixed non-secret fixtures,
  never uses the source checkout as Claude cwd, snapshots every path including
  ignored files, permits only
  `.claude/agent-memory-local/haiku-scout/**` and
  `.claude/agent-memory-local/sonnet/**`, reads no memory contents, and verifies
  source-checkout status remains unchanged.
- [ ] **6.4 Run the red tests.**

  ```bash
  node --test \
    tests/runtime/plugin-contract.test.mjs \
    tests/runtime/mcp-server.test.mjs \
    tests/runtime/release-smoke.test.mjs
  ```

- [ ] **6.5 Implement the smallest coherent guidance and controller.** Do not
  add a new public tool, cross-process event sink, or persistent teammate
  events. Requested definition models
  are observable; effective teammate model, effort, and cost stay unknown
  unless an authoritative structured event exists. Assistant prose cannot fill
  missing evidence.
- [ ] **6.6 Run focused tests and lint.** Use the command from 6.4, ESLint
  runtime/tests, then `npx tsc --noEmit`.
- [ ] **6.7 Commit the model-visible/release-fake unit.** Stage only Task 6 files
  and commit:

  ```bash
  git commit -m "feat: document and smoke native Claude teams"
  ```

---

### Task 7: Repository-wide zero-cost verification and fixed-diff review

**Files:** all files changed by Tasks 1-6 and the OpenSpec/Superpowers planning
artifacts.

- [ ] **7.1 Run focused suites again in implementation order.** Preserve exact
  commands and results in the implementation task handoff; do not infer green
  from a subagent summary.
- [ ] **7.2 Run authoritative zero-cost checks.**

  ```bash
  openspec validate enable-bounded-native-claude-teams --strict
  git diff --check
  npm run check
  ```

- [ ] **7.3 Inspect the complete diff.** Verify: unchanged seven-tool API;
  `runtime/index.mjs` ownership; no teammate registry/mailbox/transcript state;
  exact definition models; no call-level teammate model; no unsafe orchestrator
  reconnect; no memory-content access; Driver `@2`; no version/install/release
  mutation.
- [ ] **7.4 Request two independent fixed-diff reviews.** One Opus xhigh review
  targets real Claude Code Agent Teams/tool/init/memory/recovery feasibility.
  One Sol max review targets OpenSpec ownership, architecture seams, privacy,
  migrations, tests, and release evidence. Resolve all P0/P1 findings and rerun
  7.2 before acceptance.
- [ ] **7.5 Commit only review corrections if needed.** Keep corrections scoped;
  do not squash evidence or alter lifecycle state.

---

### Task 8: Separately authorized paid acceptance witness

**OpenSpec authority:** `specs/plugin-release-readiness/spec.md`

Do not execute this task without explicit paid-test authorization after Task 7.

- [ ] **8.1 Snapshot source-checkout status and create a disposable Git witness
  repository.** Store only fixed non-secret fixtures there.
- [ ] **8.2 Run exactly one top-level `claude-opus-5`, `low`, `write:false`
  Native Agent Team witness through the production Driver/profile/adapter
  seam.** Require one Haiku scout and one Sonnet reviewer,
  explicit intended efforts, one current-team message, both native settle
  signals, and one parent synthesis.
- [ ] **8.3 Evaluate only structured observable evidence.** Prove requested
  definitions/models, member type/name, message recipient, and settle signals.
  Record effective teammate model/effort/cost as unknown unless Claude emits an
  authoritative structured fact. Missing evidence leaves acceptance unverified.
- [ ] **8.4 Enforce the disposable-workspace mutation gate.** Permit only the
  two exact local-memory prefixes, read no memory contents, fail on every other
  path mutation, and prove the source checkout remained unchanged.
- [ ] **8.5 Stop immediately on subscription, allowance, credit, or quota limit.**
  Make no later paid Claude call and do not classify model quality.

---

### Task 9: Acceptance handoff, not release

- [ ] **9.1 Run `openspec-verify-change` and reconcile every scenario and task.**
  Leave any unverified/deferred item unchecked with an explicit disposition.
- [ ] **9.2 Prepare an evidence-backed handoff.** Include exact commits, tests,
  review dispositions, paid-witness status, known behavioral boundaries, and
  rollback to Driver `claude-code@1`.
- [ ] **9.3 Stop.** Do not install, merge, archive, version, release, push, or
  publish until the user separately authorizes the relevant lifecycle action.

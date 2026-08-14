## Context

This change consumes the accepted HarnessDock identity and Driver v2 control plane. See `proposal.md` for motivation and `specs/` for behavior. `runtime/index.mjs` remains the sole public lifecycle facade; the static core sees only route/capability snapshots, launch claims, leases, separate native-session/native-turn references, live handles, and normalized terminal evidence.

OpenCode differs from Claude Code in the relevant ownership boundary: an operator-owned HTTP Server persists outside Plugin turns, while a client request/session/message lineage represents one native turn. Server persistence avoids OpenCode/MCP cold boot; it does not prove provider prompt-cache reuse. Native OpenCode transcript/history remains owned by OpenCode and is not imported into the Plugin.

The design freezes only facts that can be validated without local provider use. The requested candidate model is `opencode-go/deepseek-v4-flash`, but the exact installed model ID and client protocol are live prerequisites. The implementation task may assume OpenCode is already installed, logged in, and interactively usable; it still must inspect the actual configured versions/catalog before the first production-shaped request.

## Goals / Non-Goals

**Goals:**

- Prove one service-backed, read-only, fixed-policy Explorer through the common control plane.
- Keep Server/account/configuration ownership outside the Plugin and credentials outside durable/model-facing data.
- Correlate request preparation, native acceptance, effect, and terminal settlement without replaying ambiguous input.
- Activate one explicit eight-operation HarnessDock public generation for mixed Claude/OpenCode roots.
- Produce deterministic evidence first, then three bounded real examples that can be dogfooded and extended in practice.

**Non-Goals:**

- No generic HTTP Harness superclass, approval broker, interactive TUI, Server daemon manager, remote deployment, native transcript/history catalog, or tool-event normalization.
- No parity claim for unsupported operations and no research-report ontology in the shared runtime.
- No maturity claim for twenty-task reliability, cache economics, concurrency, crash recovery, or implementation safety.

## Decisions

### 1. Start with a compatibility probe, then pin the production client

Before changing package dependencies, capture:

- `opencode --version`, Server health/version, and configured loopback origin;
- exact output of `opencode models` for DeepSeek V4 Flash;
- provider/model/agent/profile discovery through the running Server;
- the generated/current SDK package and type surface compatible with that Server;
- synchronous prompt, session/message, error, usage, and cancellation shapes actually exposed;
- whether an authoritative Server incarnation or equivalent collision-resistant session binding can be proven across isolated Plugin calls.

The result is a checked-in sanitized compatibility fixture plus one exactly pinned client dependency/version. Production imports only the client constructor and never a Server-spawning helper. If no compatible stable SDK exists, a small typed fixed-origin HTTP client generated from the Server's OpenAPI may be proposed within this change only after recording why; raw ad hoc HTTP and CLI stdout parsing are not silent fallbacks.

`opencode run --attach` remains a one-time/operator diagnostic for persistent Server/manual Explorer behavior. It cannot become the long-term lifecycle interface because it obscures typed session/turn identity, cancellation, and usage error boundaries.

Alternative considered: assume the remembered SDK version and model ID. Rejected because both are drift-prone and the user explicitly requires actual local confirmation.

### 2. Keep one fixed loopback connection and inherited-only secrets

Tracked non-secret configuration owns one loopback Server URL (default candidate `http://127.0.0.1:4096`). URL validation rejects embedded credentials, non-loopback resolution, query/fragment components, unapproved redirects, and per-call override. The Driver never binds `0.0.0.0` or manages the Server process.

`OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD` are read only from the operator process environment through the Driver's exact secret allowlist. They are rejected from the tracked environment file and omitted from merged environment receipts, prompts, logs, exceptions, instance/session/turn references, usage, and completions. Username may use the official default only when the actual Server contract confirms it.

The fixed-origin fetch/client composes bounded connect/discovery/acceptance/turn deadlines, bypasses loopback proxies, rejects cross-origin redirect, and returns closed sanitized error codes.

Alternative considered: expose endpoint/auth/profile arguments to Codex. Rejected because these are operator configuration, not routing decisions, and would leak lifecycle authority into model-facing tools.

### 3. Admit only the discovered exact read-only route

The intended public tuple is:

```json
{
  "harness": "opencode",
  "model": "opencode-go/deepseek-v4-flash",
  "topology": "leaf",
  "write": false
}
```

The full model string is admitted only if both CLI and Server/client discovery report that exact configured identifier. If the actual identifier differs, implementation stops for an OpenSpec update instead of aliasing or silently substituting it.

Readiness also verifies a resolved `codex-explorer` profile. Its effective policy denies edits/writes/patch, shell, task/subagent launch, external-directory access, web, skill loading, deploy/publish, interactive approval, and unknown custom/MCP tools; it permits only reviewed repository read/list/glob/search/LSP-style inspection. Per-prompt denial repeats what the pinned protocol can express. `interaction=noninteractive_fixed_policy`, capacity is one, and enforcement is reported truthfully as Harness policy/prompt rather than OS containment.

Alternative considered: enable OpenCode Plan/Build defaults. Rejected because their effective tools and approval behavior are not the narrow Explorer contract.

### 4. Divide Driver code by trust boundary, not by generic abstraction

Expected modules are:

- `runtime/opencode-compatibility.mjs`: captured version/schema/model/profile facts and compatibility check;
- `runtime/opencode-client.mjs`: fixed origin, inherited auth, deadlines, client creation, sanitized discovery;
- `runtime/opencode-explorer-profile.mjs`: exact route/profile/default-deny validation;
- `runtime/opencode-prompt.mjs`: stable read-only authority/topology/return envelope around bounded task text;
- `runtime/opencode-result.mjs`: select one bounded outer-assistant final text and exact provider metrics without parsing native tool history;
- `runtime/opencode-driver.mjs`: Driver v2 route, launch/session/turn lineage, LiveTurn, completion normalization;
- `tests/runtime/fixtures/fake-opencode-server.mjs`: the pinned protocol seam only.

The generic runtime does not see OpenCode endpoints, HTTP payloads, session statuses, tool calls, events, or provider-specific error objects. No generic HTTP/ACP base class is created until a second implementation proves common semantics.

### 5. Persist launch, session, and turn identity as separate facts

Before any prompt call, the supervisor persists a launch claim/attempt with immutable route/capability snapshot, authority/instance leases, mailbox/input identity, and input digest.

The Driver creates a fresh OpenCode session for a new Plugin Agent, then proves one secret-free `NativeSessionRef`:

```js
{
  kind: "opencode-session",
  instanceKey,
  sessionId,
  sessionBindingVersion,
  bindingEvidence
}
```

For each turn it generates/correlates one user message and proves a distinct `NativeTurnRef`:

```js
{
  kind: "opencode-message-turn",
  sessionId,
  userMessageId,
  expectedParentId,
  providerId,
  modelId,
  attemptId
}
```

All fields use exact bounded Driver schemas. The origin URL, auth, prompts, output, arbitrary metadata, and tool events are excluded.

The Server origin alone—even hashed—is not an incarnation witness. Same-Agent follow-up is admitted only if the compatibility probe can validate the original session binding at the same authoritative Server/session incarnation, such as a Server-provided instance ID or an equivalent collision-resistant binding persisted and reread from the native session. Merely seeing the same origin/session string is insufficient after Server uncertainty. If this proof is unavailable, capabilities declare `continuation=fresh_only`; Codex creates a new Agent for follow-up and the live matrix substitutes a second fresh task.

Alternative considered: always resume any session ID returned by the same URL. Rejected because Server restart/reset/session-ID reuse could attach an Agent to the wrong lineage.

### 6. Use the blocking prompt lineage as the only first-release live owner

`startTurn()` begins the pinned synchronous/blocking prompt request without awaiting its terminal result, then proves the exact generated user-message/session lineage before returning `LiveHarnessTurn`:

```js
{
  nativeSessionRef,
  nativeTurnRef,
  result,
  dispose
}
```

No `deliverActiveInput`, `requestInterrupt`, `observeTurn`, or history method is exposed. `prompt_async`/HTTP 204, session status, Server PID, health, and latency are supporting observations only.

Terminal success requires the original blocking request to settle with a coherent assistant message bound to the exact session/parent/provider/model/attempt, a closed finish/error classification, and one nonempty bounded final text. Provider/native error becomes a failed terminal only when the same request lineage proves it. If the worker/connection disappears or acceptance/settlement cannot be distinguished, the attempt becomes unknown, holds capacity, and is never replayed or resumed automatically.

No restart observer exists in Phase B. Operator diagnostics may show the unknown native references and required evidence, but cannot infer settlement or clear leases.

Alternative considered: use abort/status after worker loss. Rejected because request acknowledgement or status transition does not prove exact effect/settlement.

### 7. Keep the return contract stable but Harness-neutral

The stable prompt prefix states:

- the worker is a repository Explorer;
- the immutable route is leaf/read-only/fixed-policy;
- task text follows unchanged within a bounded envelope;
- it must inspect with admitted read/search tools, avoid mutation/delegation, cite relevant paths/evidence, state unknowns, and return a concise parent-facing result;
- only the outer final response is returned to Codex.

The Plugin validates one bounded text result (for example 64 KiB), strips no terminal UI because it uses typed assistant parts, and rejects empty/oversized/wrong-lineage output. It may preserve Driver-validated optional result metadata, but does not require a universal `summary/relevant_files/findings/...` JSON object. Codex can ask for a task-specific format in `message`; the runtime neither interprets nor repairs it.

This keeps the system/prompt prefix cache-friendly without making the Plugin a research-methodology owner or forcing future Harnesses into OpenCode's output schema.

### 8. Preserve exact metrics and separate the two caches

From the matching assistant message, the Driver maps only non-negative finite fields actually present in the pinned schema: provider/model, input, output, reasoning, cache read/write, and reported cost. It records `provider_reported` provenance and leaves absent values null/unknown. The route-keyed usage ledger also carries root/Agent/turn/attempt/instance/Driver/capability lineage.

Two independent measurements are recorded:

- Server reuse: same operator Server identity/process/service across calls, startup/MCP initialization observations, RSS/latency where available;
- provider prompt cache: exact provider-reported cache token fields/cost only.

PID stability or faster latency never implies a provider cache hit. Subscription allowance is not reconstructed as dollar billing unless OpenCode reports an authoritative matching field.

### 9. Activate exactly eight HarnessDock operations

The public surface becomes:

1. `list_harnesses`
2. `spawn_agent`
3. `send_message`
4. `followup_task`
5. `wait_agent`
6. `interrupt_agent`
7. `list_agents`
8. `read_agent_messages`

`spawn_agent` requires `task_name`, `message`, `harness`, full `model`, `topology`, and `write`. Optional fields are only `description` and a Driver-discriminated `reasoning_effort`; OpenCode initially rejects effort unless the discovered route proves it. There are no generic `scope`, `questions`, endpoint, profile, instance, session, tool, approval, or fallback inputs.

`followup_task` accepts `target`, `message`, and optional admitted turn effort only; it inherits the immutable route/authority and is unavailable for OpenCode unless the exact session/incarnation capability is proven. `send_message` remains queue-only and never claims active OpenCode delivery. `interrupt_agent` and `read_agent_messages` return explicit unsupported for the initial route. `list_harnesses` reports static admission, instance readiness, exact route constraints, capability/maturity, and capacity without ranking or selecting.

All model-facing Skills and tools use `$codex-harnessdock:*` / `mcp__codex_harnessdock__*`. Legacy v1/v2 Claude Agents remain controllable through Phase A's adapter. New Claude and OpenCode Agents are v3 and never hot-switch route.

### 10. Test deterministically, then accept three real examples

The fake Server covers the exact pinned endpoints/types used by production: health/catalog/profile, session creation/read, prompt/message correlation, assistant completion, provider error, malformed response, auth/redirection/deadline, connection loss, duplicate/wrong lineage, optional session-incarnation proof, capacity, and secret redaction. A shared Driver suite proves no PID/exit-status assumption.

Zero-model-cost installed smoke proves the eight renamed Skills/tools, static Harness discovery, explicit route-field rejection, legacy Claude control, fake OpenCode lifecycle, and no Server/model lifecycle side effect.

Separately authorized live acceptance runs exactly three varied read-only successes through the loaded Plugin:

1. fresh architecture exploration;
2. exact same-Agent terminal follow-up only if session/incarnation proof is authoritative; otherwise a second fresh Agent that proves `fresh_only` behavior;
3. a mixed Claude/OpenCode root or another fresh OpenCode task if Claude is unavailable for non-capability reasons.

Each captures versions/catalog/profile, route/attempt/session/turn lineage, latency, exact metrics, repository before/after mutation witness, final result, and a bounded Codex verification sample. Any mutation, wrong route, ambiguous acceptance/settlement, empty result, or materially unverifiable sampled fact fails that example. Auth/account/quota stops further live calls without fallback.

Three successes admit an `experimental` capability for dogfooding; they do not prove long-running reliability. `docs/opencode-worker-evaluation.md` records measured/unknown answers and a bounded `GO`, `GO WITH CHANGES`, or `NO-GO` for continued use.

### 11. Reserve later Harnesses without pre-building them

After Phase B acceptance, Phase R physically renames the source/deployment checkout. Then independent changes may probe DeepSeek Harness and Grok Build using the same fit checklist: stable headless/API surface, exact session/turn identity, fixed-policy noninteractive mode, final-message and usage evidence, optional observation/control, and no TUI automation. Pi remains reference-only. If DeepSeek Harness lacks a stable headless/API boundary, record HOLD and proceed to Grok Build instead of weakening the core.

Implementation workers remain a later phase using operator-prepared isolated Git worktrees, diff/test receipts, and Codex review. Two Harness Agents never write the same working tree concurrently.

## Risks / Trade-offs

- [Installed OpenCode/SDK contract differs from remembered docs] → Probe first, capture fixtures, pin only the proven compatible client, and stop for spec update on semantic drift.
- [Profile name exists but effective tools are wider] → Validate resolved policy/default deny and fail readiness before model usage; retain mutation witness.
- [Local exception occurs after remote acceptance] → Persist launch claim first, require exact turn reference for proven acceptance, classify ambiguity unknown, retain capacity, and never replay.
- [Session ID survives or collides across Server changes] → Require authoritative incarnation/binding evidence for continuation; otherwise advertise fresh-only.
- [No restart observer leaves capacity held] → This is the honest first-release trade; expose operator evidence and add no force-clear without a separate design.
- [Stable prompt becomes product policy] → Limit it to authority/topology/return envelope; task methodology and synthesis remain with Codex.
- [Three examples are statistically weak] → Label experimental and continue field/maturity measurement without blocking all real use in a laboratory gate.
- [OpenCode is unavailable] → Preserve route-qualified failure; Codex may continue itself based on the conversation, but the Plugin performs no automatic fallback.

## Migration Plan

1. Start only from accepted Phase 0 and Phase A trees; revalidate no active/unknown incompatible jobs.
2. Run the zero-model compatibility probe, freeze model/profile/Server/client facts, and update the plan/spec only if the actual route or semantics differ.
3. Add the exact pinned client, fixed-origin secret boundary, fake Server, profile/prompt/result helpers, and OpenCode Driver behind non-public tests.
4. Prove launch/session/turn lineage, unknown acceptance, no observation/recovery, conditional continuation, metrics, and mutation witness through fake vertical slices.
5. Atomically activate the eight-operation HarnessDock generation, v3 public writes, route receipts, eighth Skill, docs, and zero-cost installed smoke.
6. With explicit authorization, run the three live examples and write the evidence report.
7. Refresh/release only under separate authorization after acceptance. Rollback removes new OpenCode admission and restores the previous public generation while retaining v3/unknown records read-only; it never deletes or replays ambiguous OpenCode work.

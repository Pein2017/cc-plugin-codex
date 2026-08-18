# OpenCode Explorer worker evaluation (Task 10.4, 2026-08-18)

Evidence base: the three authorized live read-only examples of runbook step 7,
run through the promoted production runtime (candidate lineage through
`bfd1a64`) against the operator-owned loopback Server `1.18.18` with the
reviewed `codex-explorer` profile, on a disposable clean clone of this
repository. Artifact: the operator's `evaluation.json` (status `completed`,
three examples, run-wide and per-example mutation witnesses all clean,
`automaticFallback: "none"`). Two earlier runs stopped short and are part of
the record: run 1 exposed the untargeted-wait defect (each later example read
the previous example's completion) and run 2 exposed the version-three
targeted-join gap; both were fixed test-first, promoted, and the final run is
clean end-to-end.

## Measured facts

| Example | Latency | in / out / cache-read tokens | Reported cost |
| --- | --- | --- | --- |
| fresh_architecture | 28.4 s | 888 / 312 / 27,136 | $0.000591 |
| continuation (fresh-only substitute) | 38.2 s | 1,298 / 289 / 10,240 | $0.000548 |
| mixed_root | 20.8 s | 2,483 / 190 / 12,032 | $0.000756 |

Total reported provider cost for the three turns: **$0.0019**. All three final
answers were sampled and verified correct, each citing the owning module with
header-line evidence (`runtime/harness-registry.mjs` + `runtime/agent-store.mjs`;
`runtime/v3-job-store.mjs`; `runtime/workspace-mutation-witness.mjs`). The
continuation example recorded `branch: fresh_only_substitute` with
`refusalReason: continuation_unsupported` and zero requests for the refused
follow-up.

## The twelve architecture answers

Numbered by the original research handoff's themes; every claim below is bound
to the evidence above, the Task 1 compatibility fixture, or the candidate's
test record — nothing is inferred.

1. **Official capability.** A persistent operator-owned Server controlled
   through the pinned `@opencode-ai/sdk@1.18.18` v2 client covers
   session-create and blocking prompt with typed assistant results. Proven by
   the live turns and the schema-derived client.
2. **Exact model identity.** `opencode-go/deepseek-v4-flash`, confirmed on
   both independent surfaces (CLI catalog and Server discovery) and pinned as
   the route's only model; aliases and case variants are refused.
3. **Core hypothesis.** A cheap DeepSeek Explorer produces correct, citable
   read-only repository answers under Codex-owned decomposition: 3 of 3
   sampled answers correct with line-level citations, at roughly $0.0006 per
   bounded question.
4. **Server validation.** Health/version (`1.18.18`) probed side-effect-free;
   the full zero-model compatibility probe records the discovery surface with
   a four-GET audit and no session or prompt.
5. **Server security posture.** Literal-IP loopback origin only (`localhost`
   rejected as a resolver-time name), optional Basic auth read exclusively
   from the operator process environment, credentials provably absent from
   every record, receipt, error, and fixture.
6. **Explorer profile.** The reviewed `codex-explorer` template (default-deny
   anchor; read/list/glob/grep/lsp only; dotenv and external-directory
   denied) resolves live with 91 merged rules and passes positive-proof
   validation; drift, widened permissions, or an `ask` path fail readiness.
7. **Prompt contract.** One versioned envelope (authority, topology, one
   delimited inert task block, outer-final-only return contract) with frozen
   bounds; control characters and delimiter forgery are refused.
8. **Worker output.** Exactly one lineage-matched bounded final text
   (774–1,255 characters in the live runs); no tool transcript, no native
   history, no structured-ontology requirement.
9. **Session strategy.** `fresh_only`, decided by evidence: no authoritative
   session/incarnation binding is exposed, so a same-Agent follow-up is
   refused by name before any mailbox or native mutation, and continuation
   work uses a new Agent with Codex-distilled input.
10. **Provider cache.** Preliminary signal only: the provider itself reported
    substantial `cache_read` tokens on all three separate-session turns
    (27,136 / 10,240 / 12,032 against 888–2,483 fresh input tokens),
    consistent with cross-session provider-side caching. This is three
    samples, not the requested benchmark — hit-rate, stability, and
    separate-session economics remain **unmeasured**.
11. **Server residency vs. prompt cache.** Kept structurally separate: Server
    reuse facts and provider cache telemetry live in disjoint report objects,
    and nothing infers a cache hit from PID or latency. The numbers in answer
    10 are the provider's own fields, not residency inferences.
12. **Codex integration.** Proven through the activated generation-6 public
    surface: explicit-route `spawn_agent` → detached version-three worker →
    targeted `wait_agent` join → bounded completion with closed metrics, on
    the same root that holds Claude Agents, with no cross-Harness message
    path.

## Unavailable telemetry and deferred maturity (not filled by inference)

Twenty-task reliability, separate-session cache benchmark, concurrency at
one/two/four, idle and crash behavior, real-workday economics, interrupt and
history capabilities (route-unsupported by design), an implementation worker,
DeepSeek Harness, and Grok Build all remain **unmeasured or out of scope**;
they are subsequent maturity work per Task 10.5, not release-complete claims.
`duration_ms`, `duration_api_ms`, and `turn_count` were not reported by the
provider and stay unknown. The loaded-Plugin witness additionally observed
that `plugin_observed.tool_call_count` reads 0 on an Explorer turn that
demonstrably read a file: the Plugin's tool-part counting does not recognize
OpenCode read-tool parts, so that observational counter under-reports for
this Harness (settlement and text projection unaffected; recorded as a
maturity item).

## Verdict

**GO** — for Experimental dogfooding of the read-only OpenCode Explorer route
exactly as released: capacity one, fresh-only, interrupt/history unsupported,
behavioral read-only under Harness policy. The two defects the live runs
surfaced (untargeted wait consumption; version-three targeted join) were fixed
test-first and re-proven live before this verdict. Anything beyond Experimental
dogfooding — wider capacity, implementation workers, or maturity claims —
requires the deferred measurements above.

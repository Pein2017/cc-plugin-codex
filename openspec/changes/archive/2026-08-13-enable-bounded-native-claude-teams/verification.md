## Live witness and protocol-correction disposition — 2026-08-13

Authorized command:

```text
npm run smoke:release -- --native-team-witness --json
```

Exactly one real `claude-opus-5` / `low` / `write:false` turn ran under this
authorization through the production Driver/profile/adapter seam. No account,
quota, or allowance limit was reported. The original generated report remains
immutable: it returned `status: unverified` and `liveVerified: false` because
the then-current Adapter expected an upstream `teammate_spawned` token that is
not part of Claude Code 2.1.227's documented Agent output vocabulary.

Closed structured facts from that same live turn, inspected without retaining
prompt, message, transcript, session, credential, or memory content, showed:

- one Haiku member returned `status: async_launched` with an opaque Agent ID;
- one Sonnet member returned `status: async_launched` with an opaque Agent ID;
- both returned the exact requested model IDs in native structured results;
- one correlated `SendMessage` to `reviewer-fixture` returned `success: true`
  and a matching member name;
- the parent emitted terminal `end_turn` evidence;
- the source checkout stayed unchanged and the disposable witness workspace
  had no unauthorized mutation;
- teammate settle remains explicitly unobservable for this CLI.

The root cause was an observer false negative, not missing Native Team behavior.
The correction keeps Claude's versioned words at the Adapter boundary:
`async_launched` creates only a bounded internal member-launch fact; transport
becomes live-validated only after a successful correlated `SendMessage` to that
launched member name. Synchronous/interactive Agent results, launch-only
evidence, invocation-only messages, failed/uncorrelated messages, ambiguous
multi-result evidence, and bounded-state overflow still fail closed.

The exact sanitized 2.1.227 fact shapes now pass through the production
`StreamParser` and release witness controller without another Claude call.
The original false report is not rewritten. Under the OpenSpec observer-
false-negative scenario, the combined live structured evidence and corrected
zero-cost production-path replay satisfy task 7.1 without assistant prose or an
automatic paid retry.

## OpenSpec verification — 2026-08-13

| Dimension | Status |
|---|---|
| Completeness | 32/33 tasks complete before lifecycle execution; only 8.2 remains open until version/install/merge/release/push finish |
| Correctness | Raw Claude vocabulary is Adapter-local; stable internal launch/transport/synthesis facts are covered by positive and fail-closed tests |
| Coherence | Policy/profile/Adapter/Driver/diagnostics retain the seven-tool API, flat durable parent, no teammate registry, no transcript fallback, and no invented settle event |

### Verified evidence

- `node --test tests/runtime/adapter.test.mjs`: 24/24 passed.
- `node --test tests/runtime/release-smoke.test.mjs`: 21/21 passed.
- Focused operator diagnostics, Plugin contract, compatibility, Driver, and
  runtime-integration tests passed.
- Full zero-Claude lint, typecheck, runtime, and integration sequence returned
  exit 0 using the same commands owned by `npm run check`.
- `openspec validate enable-bounded-native-claude-teams --strict`: valid.
- `git diff --check`: clean.

### Claim boundary

The witness proves the real Opus-low production Driver/profile/Adapter path,
injected requested definitions, native asynchronous member launches,
name-addressable current-team transport, parent terminal convergence, and
mutation boundary for this executable. It does not prove public MCP/detached-
worker paid execution, hard prompt enforcement, teammate settle events,
effective teammate effort/cost, future Claude protocol compatibility, or
resumption of in-process teammates.

### Historical attempt

The earlier 2026-08-12 paid attempt used a broader prompt and produced a
synchronous ordinary Agent result with no named message. It remains correctly
unverified historical evidence and did not authorize an automatic retry. The
2026-08-13 turn was separately authorized after the prompt was corrected.

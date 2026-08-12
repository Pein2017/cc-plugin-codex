## Paid witness disposition — 2026-08-12

Command:

```text
npm run smoke:release -- --native-team-witness --json
```

The single authorized real `claude-opus-5` / `low` / `write:false` turn ran
through the production Driver/profile/adapter seam. It returned
`status: unverified` and `liveVerified: false`; no account-limit condition was
reported.

Verified bounded facts:

- the injected requested definitions were `claude-haiku-4-5` and
  `claude-sonnet-5` for the two witness roles;
- the source checkout remained unchanged;
- the disposable workspace had no changed path, approved-memory change, or
  unauthorized mutation;
- the exact executable fingerprint and definition surface were observed;
- teammate settle remains explicitly unobservable for this CLI.

Missing release facts:

- the first Agent invocation returned an ordinary synchronous completion, not
  structured `status: teammate_spawned`;
- no current-team `SendMessage` event was observed;
- the Driver therefore failed closed instead of accepting ordinary-subagent
  output as Native Agent Team work, so no successful terminal Native Team turn
  was admitted.

The zero-cost witness prompt has since been tightened to require exact named
definitions with `run_in_background: true`, one current-team `SendMessage`, and
no synchronous ordinary subagents. Focused tests cover that prompt contract,
but it has not been live-validated. Tasks 7.1 and 7.2 remain incomplete and the
release gate remains closed. No second paid Claude turn is authorized by this
record.

## OpenSpec verification — 2026-08-12

| Dimension | Status |
|---|---|
| Completeness | 31/33 tasks complete after this verification; 7.1 and 8.2 remain open |
| Correctness | All 22 requirements and 83 scenarios were reviewed; 21 requirements have implementation/test evidence, while native-team release readiness is contradicted by the real witness |
| Coherence | Policy/profile/adapter/Driver/diagnostics follow the design and fail closed; no public eighth operation, fallback, child registry, or invented settle event was added |

### CRITICAL

- Native-team live acceptance is incomplete. The real turn did not produce
  `teammate_spawned`, a current-team message, or a successful admitted Native
  Team terminal. Complete task 7.1 with separately authorized live evidence;
  do not archive or release the capability before that gate passes or the user
  explicitly revises the release contract.
- Lifecycle task 8.2 remains closed because its prerequisite is verified live
  evidence, not merely prior publication intent.

### Verified evidence

- `npm run check`: 452/452 runtime tests and 20/20 integration tests passed.
- `openspec validate enable-bounded-native-claude-teams --strict`: valid.
- `git diff --check`: clean.
- The focused release-smoke suite passed 21/21 after the witness prompt fix.
- The real witness correctly rejected ordinary-subagent output and reported
  unknown effective teammate model/effort/cost rather than trusting prose.

### Conditional account-limit task

The real witness did not report an account/subscription limit, so no
limit-specific branch was activated. The one authorized paid turn was the last
paid test in this verification, and the zero-cost suite proves the
`account_limit_stopped` branch does not start another paid attempt. Task 7.4 is
therefore complete without asserting that an account limit occurred.

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

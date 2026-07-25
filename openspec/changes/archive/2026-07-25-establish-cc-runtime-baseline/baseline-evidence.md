# Baseline Evidence

## Anchor and traceability

The retroactive runtime baseline is commit `5303a35139cd83f34776ca3db245b6ef73ee6627`.

| Capability | Owning implementation | Focused evidence |
|---|---|---|
| Checkout-owned runtime and fail-closed source root | `plugins/cc-for-pein/bootstrap/cc-runtime.mjs`, `runtime/internal-runtime.mjs`, `runtime/paths.mjs` | `tests/runtime/plugin-contract.test.mjs`, checkout-delegation cases in `tests/runtime-integration/runtime-cli.test.mjs` |
| One dotenv input and redacted environment receipt | `runtime/environment.mjs`, `runtime/claude-headless-adapter.mjs` | `tests/runtime/environment.test.mjs`, terminal-parity integration case |
| Safe and terminal-parity policy | `runtime/execution-profile.mjs` | `tests/runtime/execution-profile.test.mjs`, terminal-parity and unrestricted integration cases |
| Headless stream-json transport and session capture | `runtime/claude-headless-adapter.mjs` | `tests/runtime/adapter.test.mjs` |
| Exact-session retry and follow-up | `runtime/job-supervisor.mjs`, `runtime/internal-runtime.mjs` | `tests/runtime/supervisor.test.mjs`, exact-session integration cases |
| Atomic jobs, steering mailbox, leases, stale reaping, and retention | `runtime/job-store.mjs`, `runtime/job-runner.mjs` | `tests/runtime/job-store.test.mjs`, `tests/runtime/job-runner.test.mjs` |
| Stable seven-operation lifecycle surface | `runtime/index.mjs`, `runtime/cli.mjs` | `tests/runtime/plugin-contract.test.mjs`, `tests/runtime-integration/runtime-cli.test.mjs` |
| Cross-platform process identity and signalling | `runtime/process-control.mjs`, `runtime/claude-headless-adapter.mjs` | `tests/runtime/process-control.test.mjs` |

The public index, CLI help, README, checkout bootstrap, and the installed six-skill snapshot were compared with the four baseline capability specs. The seven public runtime operations are the expected temporary baseline surface; CLI-only `wait` is intentionally not an eighth public export.

## Cleanup boundary

`runtime/paths.mjs` confines plugin control state to the configured plugin data root. `cleanupOldJobs` removes only retained job JSON, default job logs, and expired plugin reservations. No cleanup path constructs or deletes a target under `CLAUDE_CONFIG_DIR`. Claude Code remains the sole owner of its session artifacts.

## Named hardening gaps

1. Installed bootstrap environment selection stops after explicit, `CODEX_HOME`, ancestor, or user-home `.codex/.env`; it does not implement the direct runtime's checkout `config/runtime.env` fallback.
2. User-facing interrupt/cancel reject a missing recorded identity, but an observed identity mismatch can currently be returned as a successful control receipt and terminalize the job. Hardening must refuse the signal outcome and preserve an attention receipt.
3. PID-only internal paths exist in session-conflict cleanup, the start/cancel race cleanup, active lease-owner liveness, and stale-job reaping. Hardening must require deterministic identity everywhere.
4. A focused high-contention mailbox run observed one transient `599 != 600` result. The immediately following full check passed the same case. Hardening must retain stress coverage and remove any reproducible lost-update path rather than classifying the first failure as proof of correctness.
5. The baseline suite has no isolated retention test that proves per-owner pruning while a sentinel Claude artifact remains untouched, and no focused direct-job owner-scope test. Both belong in hardening acceptance coverage.

## Verification receipts

- Focused runtime command: `node --test tests/runtime/environment.test.mjs tests/runtime/execution-profile.test.mjs tests/runtime/adapter.test.mjs tests/runtime/job-store.test.mjs tests/runtime/supervisor.test.mjs tests/runtime-integration/runtime-cli.test.mjs`.
  - Result: 38 passed, 1 failed. The only failure was the transient high-contention mailbox count (`599` observed, `600` expected).
- Full command: `npm run check`.
  - Result: lint and typecheck passed; runtime tests `41/41` passed; runtime integration tests `10/10` passed.
- Real terminal-parity initial turn, 120-second limit, no requested tools: `Reply exactly CC_BASELINE_OK`.
  - Result: completed in one attempt with exact output `CC_BASELINE_OK`, no tool uses or touched files, Claude session `6be3f7ad-f048-43e5-825f-53a0863d1839` captured.
- Exact-session follow-up, 120-second limit: `Reply exactly CC_FOLLOWUP_OK`.
  - Result: completed in one attempt with exact output `CC_FOLLOWUP_OK`, no tool uses or touched files, and the same Claude session ID.
- Runtime receipts selected `/data/CoordExp/.codex/.env`, `/data/CoordExp/.claude`, redacted proxy endpoints at `127.0.0.1:9090`, checkout source root `/data/CoordExp/.worktrees/cc-plugin-codex`, Claude Code `2.1.220`, model `claude-sonnet-5`, and connected Serena MCP.
- Durable job receipts are under `/data/CoordExp/.codex/plugins/data/cc/state/`; Claude session artifacts remain under `/data/CoordExp/.claude` and were not modified by plugin cleanup.

Every discrepancy above is assigned to `harden-runtime-foundations`; this baseline makes no runtime behavior change.

# Changelog

## 0.1.0 - Unreleased

- Establish a checkout-owned `ClaudeRuntime` lifecycle API and headless CLI.
- Add safe and terminal-parity execution profiles.
- Add single-source env-file loading with project-local Claude, proxy, Conda,
  checkout root, exact Claude binary, and PATH propagation.
- Add durable steering, SIGINT interruption, destructive cancellation,
  exact-session follow-up, bounded transport recovery, partial output, and
  redacted runtime receipts.
- Replace review/setup/hook/installer/cache surfaces with six focused lifecycle
  skills and an installable 15-file `plugin/` control-plane subtree whose
  bootstrap fails closed unless it delegates to the declared checkout.
- Add atomic multi-process job locks, cross-workspace exact-session leases,
  worker/Claude PID separation, orphan reaping, session-drift rejection, and
  receipt aggregation across reconnect attempts.
- Add explicit non-interactive permission overrides while leaving
  terminal-parity permission behavior untouched by default.
- Add an explicit, receipt-visible unrestricted native mode equivalent to
  `IS_SANDBOX=1 claude --dangerously-skip-permissions` without weakening the
  safe profile.
- Add unit and subprocess integration coverage for protocol, profiles,
  environment, state, recovery, steering, interruption, and session ownership.

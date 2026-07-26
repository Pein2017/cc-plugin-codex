# Changelog

## Unreleased

- Add canonical `claude-haiku-4-5` with explicit low effort as a test-only model
  for Plugin smoke, hook, environment-parity, and integration checks; retain
  Sonnet/Opus for general work and reject dated model IDs as public inputs.
- Treat explicit Claude subscription, usage, allowance, credit, or quota
  exhaustion as terminal and non-retrying, with no model fallback; keep generic
  HTTP 429 recovery and caller-imposed maximum-budget failures distinct.
- Keep the 500 ms completion observation cadence while eliminating completion
  inbox locks and fsyncs from quiet polls and already-frozen redelivery; retain
  locked first-delivery freezing and acknowledgement semantics.

## 0.4.0 - 2026-07-26

- Mark all six CC Agent skills and discovery descriptions as Experimental and
  state the current host limitation: background completion cannot start a new
  Codex parent turn after the parent has ended.
- Add required, parallel-then-join, and explicitly detached parent policies;
  keep spawn asynchronous while forbidding a parent final with unresolved
  required work.
- Wake `wait_agent` on coalesced safe progress milestones without exposing
  Claude response/thinking text, tool inputs, paths, hooks, sessions, or raw
  receipts.
- Give public waits a 10-minute default and one-hour maximum observation bound;
  adapt routine progress delivery from 5 to 10, 20, then 30 seconds while
  letting completion and high-value retry/reconnect/response transitions
  bypass or reset the heartbeat cooldown.
- Add a two-phase-redelivered 4096-byte completion handoff for parent synthesis,
  with completion priority and explicit truncation, removing the need for a
  recovery follow-up or temporary-file workaround.
- Base the orchestration policy on a read-only audit of Codex Multi-Agent V2 at
  `4c43465133428898aa84f0bfc02c306ed65fb66a`: asynchronous spawn, root mailbox
  wait, separate state listing, queue-only completion, and no idle-parent
  auto-reactivation.
- Give a live lock owner a short identity-probe grace so concurrent mailbox
  writers cannot silently overwrite a steering message, while reclaiming a
  lock from a provably dead owner immediately even under clock skew.
- Make the unit and integration harnesses independent of ambient Codex/CC root
  variables so the same check gate is reproducible in CI and a bootstrapped CC
  session.

## 0.3.0 - 2026-07-26

- Make `$cc-for-pein:spawn-agent` acknowledge successful starts with only the
  selected model, Agent path, and status; preserve actionable failure details.
- Pin the spawn skill's two supported model selections to
  `claude-sonnet-5` and `claude-opus-5`, document `low` through `max` effort
  values separately, reject every other model before launch, and forbid partial
  model names, implicit defaults, or silent fallback after account rejection.
- Make Claude terminal parity the default execution profile with effective
  native config resolution, `IS_SANDBOX=1`, and
  `--dangerously-skip-permissions`; keep `safe` as explicit opt-in.
- Align list/wait model-visible receipts with Codex Multi-Agent V2, retain at
  most one bounded acknowledgement update, suppress final output, and prevent
  legacy unowned events from starving current Agent delivery.
- Make all six lifecycle skills model-visible. Separate checkout-hot runtime
  edits from cachebuster-based atomic discovery refresh without destructive
  plugin reinstall.
- Declare the standalone Pein2017 clone as the sole runtime/Git/install owner;
  the external upstream checkout is reference-only.
- Migrate pre-v0.3 Agent model state only from exact retained receipt or Claude
  session evidence, defer unproven active turns, and fail closed for terminal
  unsupported or unproven history without substituting a supported model;
  automatically recover when a located unproven artifact later proves support.

## 0.2.0 - 2026-07-25

- Replace the public job lifecycle with six canonical Agent operations:
  `spawn_agent`, `send_message`, `followup_task`, `wait_agent`,
  `interrupt_agent`, and `list_agents`.
- Replace the six job-oriented plugin skills with exactly
  `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`,
  `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`,
  `$cc-for-pein:interrupt-agent`, and `$cc-for-pein:list-agents`.
- Make each Agent a durable current-root identity with a flat
  `/root/<task_name>` path, exact targeting, logical-root default isolation,
  nonresident terminal history, and a proven native Claude continuation path.
- Add canonical message-versus-follow-up semantics and crash-safe two-phase
  completion acknowledgement through `wait_agent` tokens.
- Remove all job-oriented public methods, CLI commands, skills, aliases, and
  docs. There is no public `cancel`, `cancel_job`, archive, close, or Agent
  deletion operation; `interrupt_agent` is the sole public stop action.
- Document Codex Multi-Agent V2 alignment and deliberate deviations: plugin
  skill names remain namespaced, `fork_turns` supports only `none`, topology is
  flat, all logical terminal history remains listed, and direct Terminal
  session adoption is deferred to a future OpenSpec change.
- Scope supported execution and CI to Linux with Node.js 20.19+; non-Linux
  defensive branches are best-effort and do not define release gates.

## 0.1.0 - 2026-07-25

- Establish a checkout-owned Claude Code headless runtime with durable jobs,
  safe and terminal-parity execution profiles, one env-file contract, durable
  steering, interruption, exact-session follow-up, bounded transport recovery,
  and redacted receipts.
- Replace upstream review/setup/hook/installer/cache surfaces with a local
  bootstrap that delegates only to the declared checkout.

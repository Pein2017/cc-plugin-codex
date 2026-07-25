# Changelog

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

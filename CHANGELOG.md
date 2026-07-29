# Changelog

## Unreleased

- **Breaking:** shrink successful `send_message` receipts to only stable
  `agent_name` and `delivery`. Keep complete mailbox,
  assignment, job, and steering evidence durable for operator diagnosis, while
  directing the parent to give one concise disposition-aware confirmation
  instead of repeating raw JSON or message text.
- Make `wait_agent` completion-first by default so advisory progress no longer
  wakes the lead every 5 to 30 seconds. Add call-local `wake_on_progress` for
  one intentional bounded progress observation, preserve progress cursors
  during ordinary joins, and align Skill guidance with sparse Codex V2 waits.
- Add compatible live runtime refresh for existing Codex tasks: every accepted
  MCP lifecycle call now loads `runtime/index.mjs` and its transitive modules in
  a fresh isolated worker while the MCP adapter remains stateless. Pin new MCP
  descriptors directly to the canonical checkout, fail stale public API
  generations with `CC_MCP_RESTART_REQUIRED`, split no-cachebuster
  `refresh:local` from versioned `release:local`, and retain at most two recent
  discovery-only Plugin shells so a release does not strand older tasks on a
  deleted Cache path.
- **Breaking:** decouple behavioral write intent from Claude CLI permissions.
  Default terminal parity now sets `IS_SANDBOX=1` and always passes
  `--dangerously-skip-permissions` for both read/review and mutation turns so
  headless Bash, MCP, hooks, and native tools do not stall. Keep `write` as an
  explicit durable authority boundary and append a read-only or task-scoped
  mutation instruction to every Claude turn.
- **Breaking:** slim public spawn to required `task_name`, `message`, `model`,
  and `write`; remove public `fork_turns` and execution-profile selectors.
  Default every Agent to an immutable leaf with an appended Codex-lead envelope
  and native `Agent` denial, while allowing explicit Fable-only
  `claude_orchestrator` mode with opaque one-generation native children. Map
  public lifecycle state to five strings and expose delegation mode in listings.
- Reject stale trusted Codex workspace metadata before runtime construction and
  distinguish a removed workspace from a missing Claude executable instead of
  reporting a false PATH failure.
- Add an operator-only, redacted `doctor`, read-only storage/history inventory,
  and a zero-model-cost installed Plugin release smoke covering seven Skills,
  stdio MCP startup, seven tools, and isolated `list_agents`. Add an explicit
  one-turn Haiku 4.5/low paid extension, derive runtime/Plugin versions from the
  package base, and replace missing dependency loader stacks with an actionable
  checkout `npm install` recovery.
- Add one checkout-owned `cc_for_pein` stdio MCP server with exactly seven
  typed lifecycle tools. Bind calls to trusted Codex thread/workspace metadata,
  keep spawn/follow-up background handoff asynchronous, keep wait as the
  explicit 10-minute-default/one-hour-maximum join, and cancel only the wait
  observation. Skills now guide MCP calls without silent shell fallback; the
  installed snapshot remains descriptor-only and the CLI remains operator-only.
- Add a zero-model-cost Claude Code update guard: fingerprint the configured
  executable, cache a required-CLI-surface check, fail before incompatible new
  activation, revalidate at detached launch and after completion, and mark only
  a full-fingerprint-matching requested turn as `observed_working` without an
  automatic paid smoke.
- Deliver each new CC Agent final message completely through the durable
  completion inbox and `wait_agent`, removing the former 64 KiB persistence and
  4096-byte public handoff truncation while retaining honest legacy provenance.
- Add Experimental `read_agent_messages` and `$cc-for-pein:read-agent-messages`
  for root-bound, observation-only access to recent outer-assistant text in the
  Agent's native Claude transcript; exclude thinking, tools, attachments,
  subagent artifacts, arbitrary paths, and foreign sessions.
- Harden detached worker handoff with launcher identity/generation predicates
  and an atomic `queued` to `cancelling` cleanup fence; accepted Agent turns
  continue across Codex exit or network loss, while failed handoffs cannot race
  a worker claim or release an exact-session lease early.
- Expand the supported roster to full `claude-haiku-4-5`, `claude-sonnet-5`,
  `claude-opus-5`, and `claude-fable-5` selections. All accept `low` through
  `max`; relative Plugin guidance (not exact pricing) orders approximate
  capability and spend as Haiku < Sonnet < Opus < Fable. Make Haiku/low the
  recommended real-smoke route rather than a test-only restriction, while
  recommending Fable for core decisions and planning rather than routine coding.
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

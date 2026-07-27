---
name: spawn-agent
description: 'Experimental: create a durable, root-scoped Claude Agent and start its first asynchronous turn. Requires a task name, message, explicit supported model, and fork_turns=none; Haiku is test-only.'
---

# Spawn Claude Agent

> **Experimental.** Agent identity and Claude execution are durable, but this
> plugin cannot automatically start a new Codex model turn after the parent has
> ended. The parent must retain and resolve every required join obligation.

Use this skill to create a named Agent in the current Codex root. Resolve
`<plugin-root>` as two directories above this `SKILL.md`, then run:

`node "<plugin-root>/bootstrap/cc-runtime.mjs" spawn_agent $ARGUMENTS`

Before invoking, confirm the host command cwd is the checkout or worktree where
the new Agent should work. The lifecycle inherits that Codex cwd; never pass
`--cwd`, `-C`, or `--env-file`. The bootstrap delegates only to the fixed local
checkout and never executes a runtime from the Plugin Cache.

Canonical arguments are `--task-name <name>`, `--fork-turns none`, an explicit
`--model <model>`, and a message. Optional extensions are
`--description <text>`, `--reasoning-effort <level>`, and
`--execution-profile safe|terminal-parity`.

Use model and effort as separate arguments. This plugin supports exactly three
Claude model selections, pinned to canonical model IDs verified against the
installed Claude Code 2.1.220 and active account. Only Sonnet and Opus are for
general work:

- `Sonnet`, `Sonnet 5`, or model alias `sonnet` →
  `--model claude-sonnet-5`.
- `Opus`, `Opus 5`, `Ops5` when used as a model selector, or model alias `opus`
  → `--model claude-opus-5`.
- `Haiku` or model alias `haiku` → `--model claude-haiku-4-5` with
  `--reasoning-effort low`. This model is **test-only**: use it for Plugin
  smoke, hook, environment-parity, and integration witnesses. Do not use it
  for architecture, research judgment, audits, or ordinary delegated work.

Do not select Fable or another Claude model through this skill. Treat an
`Ops5` substring inside an Agent/task name as a label, not an implicit model
request; apply the mapping only when the user uses it to select the model. If
the task is a real Plugin smoke, hook, environment, or integration check, select
Haiku/low explicitly without spending Sonnet or Opus capacity. For other work,
if the user does not select Sonnet or Opus, stop and ask them to choose. The
runtime must reject a launch without `--model`, including under
`terminal-parity`.

The exact effort values are `low`, `medium`, `high`, `xhigh`, and `max`; map
human wording such as “x-high” to `--reasoning-effort xhigh`. Never pass partial
names such as `opus-5` or `sonnet-5`, and never silently retry with a different
model if Claude rejects the requested one.

If a real CC test explicitly reports that the Claude subscription, usage,
weekly/monthly allowance, credits, or quota is exhausted, stop all subsequent
real Claude spawns and follow-ups in that testing workflow. Report the limit
and continue only local code edits, fake-Claude fixtures, unit tests, and
integration tests. Do not reconnect or fall back to another model. A generic
transient HTTP 429 may use the runtime's bounded reconnect policy; a caller-set
`--max-budget-usd` failure is not subscription exhaustion.

- Require `fork_turns=none` explicitly. Context inheritance (`all` or a
  positive count) is unsupported and must fail rather than being put into a
  Claude prompt.
- Names resolve to a flat `/root/<task_name>` path and must be unique within
  the current logical Codex root.
- Never accept, infer, or adopt a Terminal Claude session; Terminal-session
  adoption is deferred to a future OpenSpec change.
- Keep the complete runtime receipt available for targeting and later lifecycle
  operations, but do not print its raw JSON by default.
- On successful spawn, present one concise sentence containing only the
  selected model, stable Agent path, and current status. Do not include final
  Claude output. Show the complete receipt only when the user explicitly
  requests raw or debug output.
- On failure or when recovery/action is required, report the actionable details
  instead of replacing them with a generic success acknowledgement.

## Parent orchestration policy

Before spawning, classify the result:

- `required`: the current answer or decision depends on it. Do not give the
  parent final answer until `$cc-for-pein:wait-agent` returns its completion and
  the result is synthesized.
- `parallel-then-join`: meaningful non-overlapping parent work can proceed
  first. Do that work, then join before the first dependency boundary or final.
- `explicitly-detached`: allowed only when the user clearly requests background
  execution and the result is not needed in the current answer. Report that an
  idle parent will not be automatically reactivated.

Spawn independent lanes before waiting. Do not call wait by reflex while useful
non-overlapping work remains, but never treat a `running` spawn acknowledgement
as permission to end a required or parallel-then-join parent turn.

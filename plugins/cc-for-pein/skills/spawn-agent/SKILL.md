---
name: spawn-agent
description: 'Experimental: create a durable, root-scoped Claude Agent and start its first asynchronous turn. Requires a task name, message, explicit model, explicit write intent, and fork_turns=none; supports Haiku 4.5, Sonnet 5, Opus 5, Fable 5, and all five efforts.'
---

# Spawn Claude Agent

> **Experimental.** Agent identity and Claude execution are durable, but this
> plugin cannot automatically start a new Codex model turn after the parent has
> ended. The parent must retain and resolve every required join obligation.

Use this skill to create a named Agent in the current Codex root. Invoke
`mcp__cc_for_pein__spawn_agent` with typed `task_name`, `message`,
`fork_turns: "none"`, `model`, and `write` fields. Optional fields are
`description`, `reasoning_effort`, `execution_profile`, and `allowed_tools`.

Before invoking, confirm the active Codex turn workspace is the checkout or
worktree where the new Agent should work. Trusted Codex metadata supplies the
workspace and root identity; never add cwd, environment, owner-root, or Claude
session selectors. If the typed MCP tool is unavailable, report the Plugin
discovery/startup failure instead of silently running a shell fallback.

Use model and effort as separate fields. This plugin supports exactly four
full Claude model IDs, pinned to canonical selections verified against the
installed Claude Code and active account:

- `Haiku`, `Haiku 4.5`, or alias `haiku` → `model: "claude-haiku-4-5"`:
  cheapest and fastest; use for tests,
  real smoke, and small mechanical work. Haiku/low is the recommended real-smoke
  route, but Haiku is not test-only.
- `Sonnet`, `Sonnet 5`, or alias `sonnet` → `model: "claude-sonnet-5"`:
  balanced default for general coding.
- `Opus`, `Opus 5`, `Ops5` when explicitly used as a model selector, or alias
  `opus` → `model: "claude-opus-5"`: deep analysis, complex work, or high-risk
  implementation and review.
- `Fable`, `Fable 5`, or alias `fable` → `model: "claude-fable-5"`: highest
  capability and spend; reserve for core decision discussion and planning,
  generally not routine code writing.

Relative Plugin guidance, not exact pricing: both approximate capability and
spend rise from Haiku < Sonnet < Opus < Fable. Before invoking, briefly state
the selected model and its role/tier. Every model accepts exactly `low`,
`medium`, `high`, `xhigh`, or `max`; map human wording such as “x-high” to
`reasoning_effort: "xhigh"`.

The model is always explicit. If the user does not select one of the four model
families, stop and ask them to choose; always pass its canonical full ID. Treat
an `Ops5` substring inside an Agent/task name as a label, not an implicit model
request. The runtime must reject a launch without the `model` field, including under
`terminal-parity`. Never pass a partial model ID such as `haiku-4-5`,
`sonnet-5`, `opus-5`, or `fable-5`, and never silently retry with a different
model if Claude rejects the requested one.

If a real CC test explicitly reports that the Claude subscription, usage,
weekly/monthly allowance, credits, or quota is exhausted, stop all subsequent
real Claude spawns and follow-ups in that testing workflow. Report the limit
and continue only local code edits, fake-Claude fixtures, unit tests, and
integration tests. Do not reconnect or fall back to another model. A generic
transient HTTP 429 may use the runtime's bounded reconnect policy; a caller-set
`--max-budget-usd` failure is not subscription exhaustion.

Choose mutation intent before invoking:

- Pass `write: false` for audits, reviews, exploration, planning, or any turn
  that is not authorized to mutate the workspace. Under the default
  `terminal-parity` profile this omits `--dangerously-skip-permissions` and
  leaves authorization to native Claude configuration. Do not describe this as
  an OS-enforced read-only sandbox.
- Pass `write: true` only for work explicitly authorized to modify the
  workspace. Under `terminal-parity` this adds
  `--dangerously-skip-permissions` after the fixed `CLAUDE_CONFIG_DIR` and
  `IS_SANDBOX=1` environment is established.
- Never omit `write` from a model-facing spawn, even though direct runtime
  omission fails safer and behaves like false.

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
  selected model, its role/tier, stable Agent path, and current status. Do not
  include final Claude text or raw JSON. Show the complete receipt only when
  the user explicitly requests raw or debug output.
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

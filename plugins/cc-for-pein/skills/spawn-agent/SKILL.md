---
name: spawn-agent
description: 'Experimental: create a durable, root-scoped Claude Agent and start its first asynchronous turn. Requires a task name, message, explicit model, and explicit write intent; defaults to a leaf Agent and permits native subagents only for explicit Fable orchestration.'
---

# Spawn Claude Agent

> **Experimental.** Agent identity and Claude execution are durable, but this
> plugin cannot automatically start a new Codex model turn after the parent has
> ended. The parent must retain and resolve every required join obligation.

Use this skill to create a named Agent in the current Codex root. Invoke
`mcp__cc_for_pein__spawn_agent` with typed `task_name`, `message`,
`model`, and `write` fields. Optional fields are `description`,
`reasoning_effort`, `allowed_tools`, and `delegation_mode`.

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
  that is not authorized to mutate the workspace. The runtime prompt tells the
  fully capable Claude process not to create, edit, delete, rename, move, or
  otherwise mutate workspace files or repository state. This is a behavioral
  boundary, not an OS-enforced read-only sandbox.
- Pass `write: true` only for work explicitly authorized to modify the
  workspace. The runtime prompt limits mutations to the supplied task.
- Under default `terminal-parity`, both values establish the fixed
  `CLAUDE_CONFIG_DIR` and `IS_SANDBOX=1`, then add
  `--dangerously-skip-permissions` so Bash, MCP, hooks, and other native tools
  do not stall on headless permission prompts. `write` does not reduce the
  Claude process capability.
- Never omit `write` from a model-facing spawn, even though direct runtime
  omission fails safer and behaves like false.

- Do not pass Codex history or a fork selector. The runtime always treats a CC
  Agent as a self-contained delegated lane; make the `message` complete enough
  to work without the parent transcript.
- Names resolve to a flat `/root/<task_name>` path and must be unique within
  the current logical Codex root.
- Never accept, infer, or adopt a Terminal Claude session; Terminal-session
  adoption is deferred to a future OpenSpec change.
- The model-facing Agent receipt contains only its stable ID/path, selected
  model, immutable delegation mode, and projected status. Session, job,
  continuation, workspace, and mailbox internals remain operator/debug evidence.
- On successful spawn, present one concise sentence containing only the
  selected model, its role/tier, stable Agent path, and current status. Do not
  include final Claude text or raw JSON. If the user asks for deeper diagnostics,
  use the operator diagnostics path rather than expanding the ordinary receipt.
- On failure or when recovery/action is required, report the actionable details
  instead of replacing them with a generic success acknowledgement.

## Delegation depth

Use `delegation_mode: "leaf"` or omit the field for ordinary Agents, including
Haiku, Sonnet, Opus, and ordinary Fable work. Leaf mode appends the bounded
Codex-lead role envelope and disables Claude Code's native `Agent` tool. Never
put `Agent` or an `Agent(...)` pattern in `allowed_tools` for a leaf.

Use `delegation_mode: "claude_orchestrator"` only when all of the following are
true:

- the exact model is `claude-fable-5`;
- the lead deliberately wants Fable to coordinate Claude-native subagents;
- one generation is enough; and
- the Fable parent will join its children and return one self-contained final
  synthesis to Codex.

The CC registry tracks only the durable Fable parent. Native children remain
inside that Claude session and cannot be targeted with CC tools. Haiku, Sonnet,
and Opus orchestration requests must fail rather than silently becoming leaf or
switching models. Do not add a child registry, scheduler, or hidden second
delegation layer in the prompt.

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
non-overlapping work remains, but never treat a `starting` or `working` spawn
acknowledgement as permission to end a required or parallel-then-join parent turn.

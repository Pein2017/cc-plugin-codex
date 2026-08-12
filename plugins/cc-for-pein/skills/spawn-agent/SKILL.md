---
name: spawn-agent
description: 'Experimental: start a durable current-root Claude Agent asynchronously with explicit model/write; leaf by default, exact Opus/Fable Native Agent Team lead only when requested.'
---

# Spawn Claude Agent

> **Experimental.** Claude continues in the background, but cannot reactivate
> an ended Codex turn. The parent owns every required join.

Call `mcp__cc_for_pein__spawn_agent` with `task_name`, self-contained `message`,
exact `model`, and explicit `write`; optional fields are `description`,
`reasoning_effort`, and `delegation_mode`. Trusted Codex metadata owns cwd/root;
never pass environment, session, or fork selectors. If unavailable, report
Plugin startup or discovery failure; never use a shell fallback.

## Model and effort

Use only full IDs and separate effort (`low`, `medium`, `high`, `xhigh`, `max`):

- `claude-haiku-4-5`: cheapest/fastest; tests, smoke, mechanical work. Haiku/low
  is preferred for real smoke, but Haiku is not test-only.
- `claude-sonnet-5`: balanced general coding.
- `claude-opus-5`: deep, complex, or high-risk work/review.
- `claude-fable-5`: highest capability/spend; core decisions and planning, not
  routine coding.

Approximate guidance, not exact pricing: Haiku < Sonnet < Opus < Fable. State
the selection briefly. Map “x-high” to `xhigh`; never infer a model from an
Agent label such as Ops5, use partial IDs, or substitute another model after
rejection. Ask when no model family was selected.

If a real CC test reports subscription, usage, periodic allowance, credit, or
quota exhaustion, stop further real Claude tests in that workflow. Do not
retry/fallback; local edits and fake/unit/integration tests may continue. A
generic transient 429 may follow bounded reconnect and is not this stop rule.

## Authority and delegation

- `write: false` is behavioral read/review-only authority; `write: true` permits
  task-scoped mutation. Both use fixed config, `IS_SANDBOX=1`, full-access
  terminal parity, and `--dangerously-skip-permissions`; it is not an OS-level
  process-permission switch. Never omit `write`.
- Names are unique flat `/root/<task_name>` paths. Never adopt a Terminal Claude
  session. The message must stand alone without Codex history.
- Omit `delegation_mode` or use `leaf` normally. Leaf disables native `Agent`
  and `Workflow`.
- Use `claude_orchestrator` only with exact Opus or Fable (`claude-opus-5` or
  `claude-fable-5`): it is an experimental Native Agent Team lead, not a
  Plugin-owned child lifecycle. The first named native spawn must produce the
  structured `status: teammate_spawned` proof; ordinary Agent results are
  rejected. Haiku and Sonnet cannot lead.
- The lead may select only definition-owned `haiku-scout`, `sonnet`, or `opus`
  teammates. Do not pass a call-level model override: requested models remain
  pinned by the definitions, while effective teammate model, effort, and cost
  are unknown without authoritative native facts. State intended effort; the
  fallback is inherited lead effort, not a per-teammate override.
- `write` remains behavioral, not an OS-level boundary. In a read-only turn,
  task/workspace/repository/external mutation is forbidden except local
  native-memory maintenance under `.claude/agent-memory-local/<member-type>/`.
  Native numerical limits are behavioral: at most three active teammates and
  six creations; depth/tool denial is hard, while concurrency is only a
  residual ordinary-subagent guard.
- Same-team `SendMessage`, shared tasks, and native idle/failure delivery are
  allowed only inside the current team. No cross-session recipients, nested
  delegation, isolation, fork, or completed-peer resume. Join required native
  settle evidence and return one parent synthesis. Transport never
  auto-reconnects: an explicit follow-up forms a fresh native team in the
  durable parent session. Only that parent enters the CC registry; `Workflow`
  remains disabled.
## Parent join policy

Before spawn, classify the result as `required` (wait and synthesize),
`parallel-then-join` (do independent work then join), or `explicitly-detached`
(only when the user does not need the result now). A `starting`/`working` card
does not resolve a required join. It carries retained effort, behavioral
authority, delegation mode, safe phase, and nullable timing evidence. Report
one sentence from `model`, role, `agent_name`, authority, and `status`; no final
Claude text, JSON, or internal IDs. Use operator diagnostics for deeper evidence
and preserve actionable failure/recovery detail.

For non-null `blocking`, branch on `retry`: `same_agent_followup` continues
this Agent, `new_agent` re-delegates that lane, and `operator_required` stops
further spawning in this workflow.

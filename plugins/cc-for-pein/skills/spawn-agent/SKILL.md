---
name: spawn-agent
description: 'Experimental: start a durable current-root Claude Agent asynchronously with explicit model/write; leaf by default, Fable orchestration only when requested.'
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

- `write: false` is prompt-enforced read/review-only; `write: true` permits only
  task-scoped mutation. Both use fixed config, `IS_SANDBOX=1`, full-access
  terminal parity, and `--dangerously-skip-permissions`; never omit `write`.
- Names are unique flat `/root/<task_name>` paths. Never adopt a Terminal Claude
  session. The message must stand alone without Codex history.
- Omit `delegation_mode` or use `leaf` normally. Leaf disables native `Agent`
  and `Workflow`.
- Use `claude_orchestrator` only with exact Fable when the lead wants one native
  child generation. Fable must join every child and return one self-contained
  synthesis; only the Fable parent enters the CC registry. `Workflow` remains
  disabled. Haiku/Sonnet/Opus orchestration requests must fail.
## Parent join policy

Classify the result before spawn:

- `required`: wait and synthesize before answering.
- `parallel-then-join`: do independent work, then wait before dependency/final.
- `explicitly-detached`: only when the user wants background work whose result
  is not needed now; disclose that Codex will not auto-reactivate.

Spawn independent lanes before waiting; do not reflexively wait while useful
work remains. A `starting`/`working` acknowledgement never resolves a required
join. On success report one sentence from `model`, its role, `agent_name`, and
`status`; no final Claude text, JSON, or internal IDs. Use operator diagnostics
for deeper evidence, and preserve actionable failure/recovery detail.

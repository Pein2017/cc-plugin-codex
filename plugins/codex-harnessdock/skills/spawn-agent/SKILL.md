---
name: spawn-agent
description: 'Experimental: start a durable current-root Claude Agent asynchronously with explicit model/write; exact Opus/Fable Native Agent Team lead only when requested.'
---

# Spawn Claude Agent

> **Experimental.** Claude continues in the background, but cannot reactivate
> an ended Codex turn. The caller owns joining any completion evidence it needs.

Call `mcp__codex_harnessdock__spawn_agent` with `task_name`, self-contained `message`,
exact `model`, and explicit `write`; optional fields are `description`,
`reasoning_effort`, and `delegation_mode`. Trusted Codex metadata owns cwd/root;
never pass environment, session, or fork selectors. If unavailable, report
Plugin startup or discovery failure; never use a shell fallback.

Release drift: use the exact retained Skill path. Latest-version instructions
are emergency-only; `HARNESSDOCK_MCP_RESTART_REQUIRED` means new Codex task. Never repair Plugin Cache.

## Model and effort

Use only full model IDs and a separate effort (`low`, `medium`, `high`, `xhigh`, `max`):

- `claude-haiku-4-5`
- `claude-sonnet-5`
- `claude-opus-5`
- `claude-fable-5`

State the selected model and effort briefly. Map “x-high” to `xhigh`; never infer
a model from an Agent label such as Ops5, use partial IDs, or substitute another
model after rejection. Ask when no model family was selected.

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
- `delegation_mode` may be omitted or set to `leaf`; `leaf` disables native
  `Agent` and `Workflow`.
- Use `claude_orchestrator` only with exact Opus or Fable (`claude-opus-5` or
  `claude-fable-5`): it is an experimental Native Agent Team lead, not a
  Plugin-owned child lifecycle. A named member must launch asynchronously and
  a correlated `SendMessage` to that launched current-team name must succeed
  before transport is live-validated; a synchronous Agent result or failed or
  uncorrelated message is rejected. Haiku and Sonnet cannot lead.
- The lead may select only definition-owned `haiku-scout`, `sonnet`, or `opus`
  teammates. Do not pass a call-level model override: requested models remain
  pinned by the definitions, while effective teammate model, effort, and cost
  are unknown without authoritative native facts. State intended effort; when no
  teammate effort fact exists, only inherited lead effort is known.
- `write` remains behavioral, not an OS-level boundary. In a read-only turn,
  task/workspace/repository/external mutation is forbidden except local
  native-memory maintenance under `.claude/agent-memory-local/<member-type>/`.
  Native numerical limits are behavioral: at most three active teammates and
  six creations; depth/tool denial is hard, while concurrency is only a
  residual ordinary-subagent guard.
- Same-team `SendMessage`, shared tasks, and native idle/failure delivery are
  instructed to stay inside the current team. Native `SendMessage` can
  technically reach other sessions, so recipient and completed-peer-resume
  restrictions are behavioral/prompt-governed, not hard containment. No nested
  delegation, isolation, fork, or completed-peer resume. Native teammate settle
  evidence remains Claude-local; transport never
  auto-reconnects: an explicit follow-up forms a fresh native team in the
  durable parent session. Only that parent enters the CC registry; `Workflow`
  remains disabled.
On success, report one sentence from `model`, role, `agent_name`, authority, and
`status`; no final Claude text, JSON, or internal IDs. Use operator diagnostics
for deeper evidence and preserve actionable failure/recovery detail.

For non-null `blocking`, branch on `retry`: `same_agent_followup` continues
this Agent, `new_agent` identifies a new lane, and `operator_required` stops
further spawning in this workflow.

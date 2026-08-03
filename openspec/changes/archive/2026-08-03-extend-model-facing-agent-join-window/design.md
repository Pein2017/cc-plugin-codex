## Context

The model-facing `wait_agent` schema hides timeout selection, but the MCP
adapter currently forwards an empty input and therefore inherits the public
runtime's 600000 ms default. That earlier hardening removed short model-chosen
polls and repeated hook progress, yet current Fable/Opus work regularly crosses
ten minutes. Each quiet timeout re-enters the parent model and can provoke
narration, `list_agents`, or another wait even though the Agent is healthy.

The local Codex Multi-Agent V2 source separates message delivery from turn
activation. `send_message` queues `InterAgentCommunication` with
`trigger_turn: false`; `followup_task` uses `trigger_turn: true`. A detached
completion watcher sends the child final to its direct parent's mailbox with
`trigger_turn: false`. `wait_agent` subscribes to that mailbox plus user steer
activity and returns as soon as either changes. V2 does not continuously stream
child tokens, tool calls, or reasoning to the parent. A child may explicitly
send a decision-bearing message, and its final is delivered automatically.

CC Agents are external Claude Code processes, so they cannot use Codex's native
collaboration channel directly. The existing supervisor instead publishes one
opt-in sanitized progress milestone and a complete durable final handoff. This
change keeps that bounded difference rather than adding a second mailbox
protocol.

## Goals / Non-Goals

**Goals:**

- Make an ordinary model-facing required join remain blocked for up to one hour
  while returning immediately on completion or explicitly requested progress.
- Preserve cancellation responsiveness and detached Agent lifetime.
- Prevent a quiet timeout from causing redundant list/history/status polling or
  repetitive parent narration.
- Keep the operator/runtime diagnostic timeout surface and existing completion
  delivery semantics unchanged.

**Non-Goals:**

- Do not stream raw Claude output, thinking, tool calls, or hook activity to the
  Codex parent.
- Do not add Claude-to-Codex proactive messaging, automatic wait after spawn,
  a combined delegate tool, completion batching, or acknowledgement changes.
- Do not replace the file-backed observer with a resident daemon or `fs.watch`;
  internal polling does not create model/tool turns.
- Do not change model routing, Claude execution, release, installation, or API
  generation.

## Decisions

### The typed MCP adapter injects the one-hour model bound

Keep `timeout_ms` absent from the strict model-facing schema and add an internal
`3600000` ms value when the MCP adapter invokes the public runtime operation.
The checkout CLI and direct runtime retain their current default plus explicit
0..3600000 ms diagnostic selection. This keeps model policy at the model-facing
boundary rather than globally changing operator behavior.

The MCP declaration already allows 3660 seconds, leaving a 60-second transport
margin around the one-hour runtime observation. Completion and the existing
single opt-in progress event return before that upper bound. Codex cancellation
continues to abort only the observation worker.

### Treat completion and explicit messages as the main interaction surface

Follow Codex V2's push/mailbox principle rather than exposing continuous
progress browsing. An ordinary join omits `wake_on_progress`; the caller may
request the existing one sanitized milestone only when it changes scheduling.
A Claude Agent that needs a decision should end its turn with a blocking
question, allowing the durable completion handoff and same-Agent follow-up to
carry the interaction. A future proactive child-to-parent message channel would
require its own contract and threat/receipt model.

### Make quiet-timeout recovery direct and silent

The wait and list tool descriptions, server instructions, Skills, and README
will say that a required join which reaches the one-hour bound calls the same
completion-first wait again directly. It does not narrate unchanged state and
does not call `list_agents` or `read_agent_messages` solely to recheck
completion. Explicit user status requests and real scheduling decisions remain
valid reasons to inspect state or the single progress milestone.

## Risks / Trade-offs

- [A required join holds one MCP call much longer] → completion and user steer
  still return early, and the configured outer timeout retains a 60-second
  margin.
- [A failed observer can remain quiet for longer] → Agent execution is detached;
  MCP cancellation/error remains explicit, while a genuine completion is
  durable and available to the next wait.
- [One sanitized milestone may not expose a late decision] → Claude can end the
  turn with a question; richer proactive child-to-parent messaging stays a
  separate feature rather than expanding this fix.
- [Parallel Agents still require multiple completion consumptions] → This
  change removes timeout amplification, not the intentional one-completion-per-
  delivery contract.

## Migration Plan

Land source, specifications, and tests without changing the package version,
manifest cachebuster, installed snapshot, or Cache. Newly started Codex tasks
load the updated MCP descriptor and policy from the canonical checkout. Rollback
removes the internal timeout injection and restores the 10-minute guidance.

## Open Questions

None.

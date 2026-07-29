## Why

The current Experimental Agent surface exposes runtime choices that Codex should not need to manage, while every Claude Agent can currently use native subagents without an explicit depth boundary. We need one small, checkout-owned delegation contract that keeps ordinary CC Agents leaf-shaped, permits deliberate Fable orchestration, and reduces the public spawn request to decisions the Codex lead actually owns.

## What Changes

- **BREAKING** Require `task_name`, `message`, `model`, and `write` for public `spawn_agent`; remove public `fork_turns` and `execution_profile` inputs because the runtime fixes them to no Codex-history fork and terminal parity.
- Add optional immutable `delegation_mode`, defaulting to `leaf`; only explicit `claude_orchestrator` on `claude-fable-5` is valid.
- Enforce leaf behavior through a runtime-owned appended system instruction and `--disallowedTools Agent`; reject conflicting tool grants and non-Fable orchestration before readiness or state mutation.
- Let a Fable orchestrator use Claude Code's native one-generation subagents as an opaque implementation detail, while requiring the Fable turn to join and return one self-contained synthesis to the Codex lead.
- Present the lifecycle as `starting`, `working`, `completed`, `failed`, or `interrupted`, while retaining detailed recovery/mailbox evidence only in bounded debug receipts.
- Preserve the existing seven tools, asynchronous spawn plus explicit wait, two-phase completion acknowledgement, and distinct send versus follow-up semantics.
- Extend zero-model compatibility admission to cover the appended-prompt and tool-denial flags now emitted by the runtime.

Current verified behavior remains the baseline until this change is applied: public spawn still requires `fork_turns=none`, exposes `execution_profile`, and does not impose a native Claude subagent boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Slim the public operation contract, add explicit bounded delegation mode, and simplify public lifecycle status.
- `typed-mcp-orchestration`: Align typed schemas and descriptions with the smaller public contract.
- `claude-session-execution`: Append the lead/leaf-or-orchestrator envelope and enforce the native Agent tool boundary.
- `agent-thread-registry`: Persist delegation mode as immutable Agent identity metadata and default legacy records safely to leaf.
- `claude-version-compatibility`: Admit only Claude CLIs that expose the new prompt-append and tool-denial surface.

## Impact

The change affects `runtime/mcp-server.mjs`, Agent activation and persistence, execution-profile argument construction, the Claude headless adapter, compatibility checks, Plugin skill guidance, runtime tests, and release metadata. It adds no dependency, no new tool, no Plugin-side child scheduler, and no child-Agent registry. Safe execution remains available only through operator/debug internals; public Codex lifecycle calls use terminal parity with explicit `write` intent.

Lifecycle ordering: first update and validate the durable contracts and migration default, then change argument construction and public schemas, then refresh the installed Plugin for a new Codex task. The already-completed stale-workspace classification fix is an independent prerequisite bug fix and is not part of this delegation capability.

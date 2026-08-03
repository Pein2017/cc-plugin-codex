## Context

Claude Code 2.1.220 supports native Auto Memory and enables it by default. The
official environment control is inverse: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`
forces Auto Memory on, while `1` disables both loading and writing. The current
CC terminal-parity launcher inherits native Claude configuration and does not
use `--bare`, so Auto Memory works today, but that behavior is implicit rather
than owned by the Plugin's fixed environment contract.

## Goals / Non-Goals

**Goals:**

- Explicitly enable native Claude Code Auto Memory for every model-facing CC
  Agent activation.
- Preserve Claude's own per-Git-repository storage and worktree sharing.
- Keep memory contents private to Claude's native configuration and absent from
  public receipts.
- Cover the effective fixed environment without spending Claude quota.

**Non-Goals:**

- Do not replace Auto Memory with `CLAUDE.md`, an appended prompt, or a Plugin
  memory database.
- Do not redirect all repositories to one `autoMemoryDirectory`.
- Do not synchronize Claude Auto Memory with Codex memory automatically.
- Do not add an MCP input, lifecycle state, or public receipt field.

## Decisions

### Enable Auto Memory through the fixed child environment

Add `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` to the checkout-owned fixed environment
and recognize the key in the environment owner's supported vocabulary. This is
Claude's documented force-enable value and reaches fresh and resumed CC turns
through the same environment path already used for config, proxy, and Conda.

An inherited model-facing value of `1` remains subordinate to the fixed Plugin
environment, consistent with the existing fixed-environment contract. A
trusted operator/debug invocation that deliberately selects a different
environment remains outside the model-facing default.

### Do not use a settings or prompt override

Adding `--settings` would enlarge terminal-parity's native-configuration
override surface, and prompt text cannot enable a runtime feature. The official
environment switch changes only Auto Memory availability while leaving normal
settings, hooks, skills, MCP, memory storage, and session behavior native.

### Leave storage creation and selection to Claude Code

The Plugin neither creates memory files nor passes `autoMemoryDirectory`.
Claude derives one memory directory per Git repository, shares it across that
repository's worktrees and subdirectories, and creates or updates it only when
the model decides a durable learning is useful.

## Risks / Trade-offs

- **Claude may change the inverse environment contract** → Keep the existing
  Claude CLI compatibility guard and a focused environment contract test; a
  future Claude update requires revalidation against official behavior.
- **Auto Memory can accumulate stale advisory context** → Keep formal authority
  in repository specs, source, and instructions; Claude memory remains an
  editable continuity cache.
- **A user expects one global memory across repositories** → Preserve native
  repository isolation deliberately; cross-repository memory synchronization
  is a separate, higher-risk feature.

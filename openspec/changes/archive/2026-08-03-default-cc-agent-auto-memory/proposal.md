## Why

Claude Code Auto Memory is currently available to terminal-parity CC Agents only
through Claude's implicit default. A settings change or rollout default could
silently disable the persistence the user expects from every `cc-spawn` Agent.

## What Changes

- Make Auto Memory explicitly enabled by default for every Claude Code turn
  launched by the CC runtime.
- Use Claude's official inverse environment switch with value `0`; do not use
  `CLAUDE.md` as a substitute for Auto Memory.
- Preserve Claude's repository-derived memory isolation and shared-worktree
  behavior; do not redirect all Agents into one shared memory directory.
- Preserve an explicit operator opt-out with value `1`.
- Add zero-Claude regression coverage for the effective child environment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-session-execution`: require every CC-launched Claude Code turn to
  enable native Auto Memory by default without changing the public Agent API or
  replacing repository-scoped memory storage.

## Impact

The change is limited to the checkout-owned runtime environment owner, its
fixed fallback configuration, focused tests, and the Claude session execution
spec. It adds no MCP field, prompt content, memory synchronization layer,
receipt field, dependency, or release requirement during implementation.

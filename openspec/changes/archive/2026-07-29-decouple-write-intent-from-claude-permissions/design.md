## Context

The public MCP surface requires `write` at spawn and preserves or overrides it on a
follow-up. Today `runtime/execution-profile.mjs` uses that semantic bit to decide
whether terminal-parity adds `--dangerously-skip-permissions`. A read-intent headless
Agent can therefore stop at native permission prompts before completing legitimate
Bash or MCP inspection, even though `IS_SANDBOX=1` and the user's normal Claude
configuration are otherwise identical.

`runtime/execution-profile.mjs` remains the sole owner of Claude CLI overrides. The
checkout runtime remains the sole owner of Agent persistence, recovery, mailbox, and
process lifecycle; neither MCP nor the skills acquire duplicate permission state.

## Goals / Non-Goals

**Goals:**

- Make every model-facing terminal-parity turn reliably unattended by setting
  `IS_SANDBOX=1` and always adding `--dangerously-skip-permissions`.
- Keep `write` as one explicit, durable statement of the task's behavioral authority.
- Put the current turn's read/write boundary in the runtime-owned appended system
  prompt without replacing Claude's native prompt, hooks, skills, memories, or MCPs.
- Keep reconnect and continuation deterministic from durable Agent/job evidence.

**Non-Goals:**

- Do not claim prompt guidance is an OS-enforced read-only boundary.
- Do not remove `write`, add another permission selector, or expose execution profiles
  through MCP.
- Do not change model routing, delegation depth, Agent identity, mailbox, session, or
  completion semantics.
- Do not make the operator-only safe profile part of ordinary model-facing activation.

## Decisions

### Terminal parity always has full Claude CLI authority

For `terminal-parity`, validation will always resolve
`dangerouslySkipPermissions: true`, independent of `write`. Creation will keep setting
`IS_SANDBOX=1` before the adapter emits the dangerous-bypass flag. Explicit
`permissionMode` remains incompatible because Claude must not receive contradictory
permission controls. The safe profile continues rejecting an explicit dangerous
bypass and retains its existing sandbox/tool policy.

This is preferred to granting a broad read-tool allowlist because native MCP and hook
surfaces vary with the user's Claude configuration. It is also preferred to retrying
after a permission failure because the first attempt may already have produced partial
effects and an avoidable recovery branch.

### `write` controls the delegated behavior, not the process capability

The delegation prompt becomes a function of immutable delegation mode plus the current
activation's write intent. A false intent says that full CLI authority exists only to
avoid headless prompts and explicitly forbids creating, editing, deleting, renaming,
or otherwise mutating workspace files or repository state. A true intent permits only
task-scoped mutations.

Spawn still requires `write`, and follow-up still inherits it unless the lead explicitly
changes it. This keeps recovery-risk classification and operator receipts coherent even
though both values launch with the same process capability.

### Reconnect freezes one job envelope; follow-up may create a new one

A reconnect of the same job reconstructs the same prompt from that job's persisted
write intent and delegation mode. A later follow-up may inherit or override write
intent and therefore creates the appropriate prompt for its new job. Claude session
identity is preserved in both cases; only the per-turn authority instruction changes.

## Risks / Trade-offs

- [A read-intent model can still mutate the workspace] -> State this limitation in the
  skills and docs, keep the boundary explicit in the runtime prompt, and retain Codex
  lead review as final acceptance.
- [The flag name is alarming and can bypass native prompts] -> Limit the policy to the
  already-default terminal-parity path and keep the operator safe profile available for
  deliberate diagnostics.
- [A stale write bit could produce the wrong prompt on continuation] -> Reconstruct from
  the winning durable job/Agent evidence and cover spawn, reconnect, and follow-up in
  tests.
- [Existing tests assume read intent omits the flag] -> Replace them with argv and prompt
  assertions for both intent values, plus the existing safe-profile negative cases.

## Migration Plan

1. Update the delta specs and focused execution-profile/MCP/CLI tests.
2. Change the execution-profile owner and dynamic delegation envelope.
3. Update skills, repository guidance, README, changelog, and release version.
4. Run focused tests, `npm run check`, strict OpenSpec validation, doctor, and zero-cost
   release smoke before refreshing the local Plugin installation.
5. Roll back by reverting this change; no durable data migration is required because
   existing Agent/job write evidence remains valid.

## Open Questions

None. The user explicitly accepts prompt-enforced read intent with full terminal-parity
process authority.

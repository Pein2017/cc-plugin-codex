## Context

`write` is already carried from the typed MCP surface through Agent activation, durable jobs, and the execution-profile owner. However, terminal-parity currently ignores that value and always adds `--dangerously-skip-permissions`, while persisted jobs record omitted `write` as false. That mismatch makes recovery safety and the actual Claude authority disagree. Separately, `list_agents` performs owner-scoped reconciliation before projecting logical state, so a read-only MCP hint understates its bounded persistence effects.

## Goals / Non-Goals

**Goals:**

- Make one caller-owned `write` value describe both recovery risk and terminal-parity dangerous permission bypass.
- Preserve native Claude configuration, hooks, skills, MCP servers, memories, and prompts in both read and write terminal-parity turns.
- Make model-facing activation choose the write intent deliberately.
- Make MCP annotations accurately describe reconciliation-capable operations.

**Non-Goals:**

- Do not claim that omitting `--dangerously-skip-permissions` creates an OS-enforced read-only sandbox; Claude's native permission configuration remains authoritative under terminal-parity.
- Do not change the opt-in safe profile, supported models, seven public operations, root ownership, Agent persistence, or continuation semantics.
- Do not add a second permission field or MCP-local lifecycle state.

## Decisions

### Derive terminal-parity bypass from `write`

`runtime/execution-profile.mjs` remains the sole owner of Claude CLI overrides. For terminal-parity, it will add `--dangerously-skip-permissions` exactly when `write` is true. False or omitted write intent will keep `IS_SANDBOX=1` and native Claude configuration but omit the bypass flag. An explicit legacy bypass option without write intent will fail validation rather than silently contradicting the persisted job.

This is preferred to retaining dangerous bypass as an independent switch because one authority bit keeps process launch, recovery policy, and durable receipts coherent. It is also preferred to applying the safe profile automatically because that would replace native tool and settings behavior rather than preserve terminal parity.

### Make spawn selection explicit while preserving follow-up inheritance

The spawn skill will require the parent to classify the task and pass `write: false` for read/review work or `write: true` for authorized mutations. Runtime omission remains equivalent to false so direct callers fail safer. A follow-up that omits `write` continues inheriting the Agent's most recent execution intent; the skill will require an explicit value when deliberately changing that intent.

### Advertise reconciliation effects instead of implementation appearance

`list_agents` remains logically observational to callers, but its MCP `readOnlyHint` will be false because reconciliation can persist crash-window or projection repairs. `destructiveHint` remains false. `idempotentHint` remains true because repeated reconciliation converges on the same owner-scoped logical state and does not consume completion delivery.

## Risks / Trade-offs

- [Read terminal-parity can stop on a native permission prompt in headless mode] -> Document that native Claude permissions govern the turn and offer `write: true` only when mutation authority is actually intended.
- [Existing callers omitted `write` while relying on full access] -> Treat this as an intentional breaking safety correction, update skills/docs, and cover both argv paths with tests.
- [A false non-read-only hint may reduce host-side parallel optimism] -> Prefer accurate persistence semantics; the operation remains non-destructive and idempotent.
- [A follow-up can inherit stale write intent] -> State inheritance explicitly in the skill and require an override whenever the parent changes task authority.

## Migration Plan

1. Update stable execution and MCP tests around false, omitted, true, and conflicting bypass inputs.
2. Update the execution-profile owner and MCP annotations without changing job or Agent schemas.
3. Update skills, repository contract, README, and changelog.
4. Run focused tests, the complete repository check, strict OpenSpec validation, and local Plugin reinstall verification.
5. Roll back by reverting the change; no durable-state migration is required because `write` is already persisted.

## Open Questions

None. The user explicitly selected permission-respecting read turns and dangerous-bypass write turns.

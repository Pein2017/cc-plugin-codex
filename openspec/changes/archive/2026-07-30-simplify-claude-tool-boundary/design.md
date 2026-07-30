## Context

CC Agent activations always use full-access terminal parity in the model-facing lifecycle. The public `allowed_tools` field is therefore misleading as a capability boundary: it maps to Claude Code's permission allow-list while `--dangerously-skip-permissions` bypasses those permission checks. Hard tool removal is owned by `--disallowedTools`.

The current delegation profile denies `Agent` only for leaf turns. Claude Code 2.1.220 also exposes `Workflow`, which can orchestrate native subagents outside the flat CC registry. This contradicts the intended topology even though the prompt tells a leaf not to delegate.

## Goals / Non-Goals

**Goals:**

- Make the public activation contract honest by removing `allowed_tools` from spawn and follow-up.
- Deny `Workflow` for every CC Agent turn.
- Continue allowing only explicit Fable orchestrators to use the native `Agent` tool.
- Give every bounded Claude turn an explicit way to return a lead-owned blocking question.
- Preserve exact-session recovery, full-access terminal parity, native config inheritance, and existing Agent persistence.

**Non-Goals:**

- Do not filter hooks, MCP servers, skills, memories, or any native tool other than `Agent` and `Workflow`.
- Do not change the meaning of `write`, add a process sandbox, or remove the internal operator/debug safe profile.
- Do not change completion, wait, progress, session, or mailbox semantics.
- Do not add another delegation mode or expose Claude-native child Agents in the CC registry.

## Decisions

### Use deny lists for the topology boundary

Every activation passes `Workflow` through `--disallowedTools`. Leaf mode passes both `Agent` and `Workflow`; Fable orchestrator mode passes only `Workflow`. This keeps ordinary native tools inherited and gives Fable one explicit child mechanism without permitting the separate Workflow fan-out surface.

Prompt text remains defense in depth, not the enforcement owner. The common role envelope names the lead-owned blocking-question escape hatch; leaf text continues to forbid delegation, and orchestrator text continues to permit one joined child generation.

Alternative considered: deny `Workflow` only for leaf mode. Rejected because the approved Fable topology is specifically one native `Agent` child generation; `Workflow` would add an untracked second orchestration mechanism.

### Remove only the public allow-list contract

The typed MCP schemas, seven-skill guidance, model-facing CLI, and Agent lifecycle input normalization stop accepting `allowed_tools`. Direct runtime calls reject the retired field before readiness or state mutation. Existing stored job evidence may retain historical `allowedTools`, but new Agent activations and follow-ups do not inherit it.

The generic Claude adapter and internal safe profile may retain their `allowedTools` implementation because they are operator/debug infrastructure rather than the public Agent contract. Terminal-parity Agent turns do not set an allow-list.

Alternative considered: reinterpret `allowed_tools` as a deny-all-except policy. Rejected because Claude Code's permission allow-list does not provide that guarantee under dangerous bypass, and emulating it would create a second tool-policy system.

### Treat the public schema removal as a new MCP generation

Removing an advertised optional field changes the discovered MCP contract. Increment `CC_MCP_API_GENERATION`, bump the pre-1.0 minor release, refresh the local Plugin snapshot, and require existing Codex tasks to restart before using the new schema. Durable Agent/session artifacts remain compatible and need no migration.

## Risks / Trade-offs

- [Claude Code renames or replaces `Workflow`] → Keep `--disallowedTools` in the compatibility surface, assert exact deny arguments in integration tests, and revisit the name only after an installed-version probe.
- [A caller depended on `allowed_tools`] → Fail closed with an actionable unknown/retired-field error and document that terminal parity inherits all tools except topology denies.
- [Fable needed Workflow for a legitimate plan] → Use the explicitly permitted native `Agent` mechanism; expanding topology requires a separate user decision.
- [The blocking-question sentence causes excessive questions] → Limit it to decisions only the Codex lead or user can make; do not invite routine clarification.

## Migration Plan

1. Update specs, runtime, public schemas, CLI, skills, and tests together.
2. Increment the MCP API generation and package minor version.
3. Run focused tests, strict OpenSpec validation, `npm run check`, and zero-model release smoke.
4. Refresh the checkout-owned local Plugin. Existing Codex tasks receive `CC_MCP_RESTART_REQUIRED`; new tasks load the new schema.
5. Roll back by reinstalling the prior tagged checkout release; durable Agents remain readable because no persistence schema changes.

## Open Questions

None. Token-focused success-receipt and Skill-description compaction is intentionally deferred because it changes additional public presentation contracts.

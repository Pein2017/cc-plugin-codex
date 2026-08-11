## Context

See `proposal.md` for motivation. The Claude Code Driver currently treats a successful `claude auth status` process as `loggedIn: true`, while a real headless turn can immediately fail because the access token is expired and could not be refreshed. That terminal failure correctly becomes Harness-scoped `operator_required`, but the durable Agent has no way to prove that the operator later refreshed the shared fixed credential store. The existing continuation contract already admits safe-fresh reuse only when a retained turn proves no possible side effect.

The release target is Linux and the fixed Claude configuration identity is already part of Driver readiness and session ownership. The design must not turn bearer material into runtime state or make diagnostics consume Claude subscription capacity.

## Goals / Non-Goals

**Goals:**

- Observe a bounded, non-secret credential generation at Driver boundaries.
- Preserve the original authentication failure while allowing the next activating follow-up to prove that operator action occurred.
- Reuse the same logical Agent only through the existing safe-fresh no-side-effect boundary.
- Make metadata-only readiness and doctor language objectively accurate.

**Non-Goals:**

- Automatic login, credential refresh, model-backed auth probing, watchers, timed retries, or account-limit recovery.
- Exact resume of the authentication-failed Claude native session.
- API-key rotation detection, new MCP tools, new Skill inputs, or changes to completion acknowledgement.

## Decisions

### Decision: one checkout-owned credential observer owns redacted local facts

Add one focused runtime module that observes the fixed Claude config identity. For native OAuth it reads only the known credential record, validates the minimum shape, and returns a closed versioned projection containing source kind, config identity, non-secret filesystem generation (`dev`, `ino`, `size`, `mtimeNs`, `ctimeNs` as decimal strings), access expiry, refresh expiry when present, and local-expiry booleans. It never returns tokens or hashes. For inherited API-key auth it reports presence with an unobservable generation.

This projection is consumed by Driver preflight, terminal authentication classification, follow-up recovery, and operator diagnostics. Alternatives rejected: hashing bearer material creates an unnecessary persistent secret correlator; mtime alone is weaker under atomic replacement; calling Claude print mode is not zero-cost and conflates readiness with execution.

### Decision: the failure captures its own credential generation

When native execution ends as `auth_or_permission`, the Claude Driver observes the credential store again and attaches that redacted fact to the normalized terminal result. Job persistence and Agent continuation evidence retain the observation. The historical completion tuple stays `auth_required / harness / operator_required`; recovery never rewrites it.

Observing at failure rather than only at preparation closes the case where a credential changes during a long turn. If observation fails, generation is unproven and recovery remains blocked.

### Decision: follow-up performs one activation-time proof

`followup_task` keeps rejecting ordinary blocked Agents. For a latest authentication-blocked activation only, it runs a read-only proof before mailbox mutation:

1. The Agent and failed job resolve to the current Claude Driver and same fixed config identity.
2. The current native OAuth generation is proven and differs from the failure generation.
3. The replacement access expiry is strictly later than the captured recovery time.
4. The failed job is the Agent's first activation and proves zero native tool uses, touched files, useful outer-assistant content, and other supervisor side-effect markers.
5. No active job or newer terminal activation supersedes that failure.

On success, an atomic Agent-store transition records `safe_fresh` continuation evidence tied to the failed job and replacement generation. Initial mailbox messages whose terminal acknowledgement belongs exclusively to that failed activation are restored to queued state with their original IDs and sequence; acknowledgement by any different turn fails closed. The ordinary follow-up enqueue and activation then create a new native session carrying the original task plus the new follow-up, with the same stable Agent identity and immutable route/delegation mode. Reconciliation recognizes that recovery evidence and does not reapply the consumed failure. Any missing or contradictory fact fails closed without mutation.

Alternatives rejected: exact resume trusts a native session that failed before authentication completed; automatic new Agent discards durable identity; automatic background retry cannot prove operator action and can loop against subscription state.

### Decision: readiness remains permissive but honest

Native credential presence remains sufficient for preflight because Claude CLI owns refresh behavior and an expired access token can still have a valid refresh token. Readiness adds closed local-state and `liveValidated: false` fields instead of claiming provider liveness. Recovery is stricter: a changed generation must contain a locally current access token because that is the evidence that interactive/operator refresh actually occurred.

Doctor adopts the same projection and replaces “authentication is active” with bounded credential-presence wording. A paid `--live-auth` mode is deferred.

### Decision: compatibility is additive and fail closed

Existing jobs and Agents without credential-generation evidence remain readable and retain their current block; they cannot automatically recover. No migration scans Claude history or credential backups. New optional fields are admitted only through closed validators, and no public model-facing schema changes.

## Risks / Trade-offs

- **Filesystem metadata can change for a rewrite that does not produce usable credentials** → require a different generation plus a locally current access expiry and still let the real Claude turn be the final validation.
- **A valid credential can be copied while preserving some metadata** → use the Linux filesystem identity tuple rather than mtime alone; ambiguous equality remains blocked.
- **No-side-effect proof can be too conservative** → prefer false-negative recovery and require a new Agent rather than replay work with uncertain effects.
- **A refreshed credential can expire again before launch** → immediate Driver pre-turn revalidation and the native turn retain authority; a new 401 creates a new immutable block.
- **Doctor cannot prove provider liveness without a request** → expose `liveValidated: false` explicitly and keep live probing out of the default release gate.

## Migration Plan

1. Add the credential observer and closed validators with privacy and expiry tests.
2. Add optional readiness/job/continuation evidence; legacy records remain blocked-compatible.
3. Add activation-time recovery under failing tests, then update diagnostics and docs.
4. Run focused runtime tests, `npm run check`, strict OpenSpec validation, zero-cost release smoke, and local Plugin validation.
5. Promote `developer` to `main`, refresh the local cachebuster, install the new snapshot, run doctor/readiness/smoke, and push through the configured 9090 proxy.

Rollback is a normal Git revert plus reinstall of the retained previous compatibility shell. Persisted recovery evidence is optional and ignored by the prior runtime; the original authentication failure remains intact.

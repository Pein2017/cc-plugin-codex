## Context

The runtime at commit `5303a35` is already implemented and exercised. It launches the host Claude Code CLI in headless stream-json mode, stores durable orchestration state, and delegates from an installed minimal plugin snapshot back to this checkout. OpenSpec was introduced afterward, so this change documents the existing architecture without pretending that the implementation is new.

Two identities are intentionally distinct in the current state:

- the Codex owner session (`job.sessionId`), used for default job visibility and retention buckets;
- the Claude Code session (`job.threadId` and result session ID), used for exact-session resume and session leases.

The installed Cache is unavoidable as a Codex plugin discovery mechanism, but it is not allowed to become an executable source authority. Claude Code itself remains an external host dependency and owns authentication, configuration, session artifacts, hooks, memories, MCP servers, skills, plugins, and tool execution.

## Goals / Non-Goals

**Goals:**

- Establish a reviewable contract for behavior verified at the baseline commit.
- Preserve the existing deep-module boundary: `runtime/index.mjs` is the sole public lifecycle interface.
- Make source ownership, environment selection, profile behavior, identity, persistence, process control, and recovery explicit.
- Produce a stable capability base against which the two later changes can express precise deltas.

**Non-Goals:**

- Change runtime code, public commands, retention values, or installed plugin behavior.
- Claim behavioral parity for TTY-only prompts or interactive terminal rendering.
- Treat upstream repositories, installers, or Cache snapshots as current design authority.
- Add Agent Thread identity, canonical V2 operations, proactive Codex wakeups, archive, or residency management.

## Decisions

### 1. Anchor the baseline to one commit and live verification

The baseline is explicitly retroactive and anchored to `5303a35`. Requirements describe current intended behavior only when the implementation, tests, or a bounded real smoke can substantiate them. A discovered mismatch is recorded for `harden-runtime-foundations`; the baseline is not silently rewritten to describe an aspiration.

Alternative considered: reconstruct a sequence of historical changes. Rejected because the repository has no reliable OpenSpec-era history and fabricated chronology would be weaker evidence than a named snapshot.

### 2. Keep the checkout as the only executable source authority

The installed plugin contains descriptors, skills, and a minimal bootstrap. The bootstrap validates `CC_RUNTIME_CHECKOUT` and delegates to the matching checkout; it fails closed on mismatch. Runtime modules, dependencies, and tests are loaded from this checkout, never from an upstream repository or a versioned Cache runtime copy.

Alternative considered: make the installed Cache self-contained. Rejected because it would create two mutable runtime authorities and make local development dependent on reinstall timing.

### 3. Keep Claude transport and policy overrides behind dedicated modules

`claude-headless-adapter.mjs` owns stream-json protocol and process signaling. `execution-profile.mjs` exclusively owns Claude CLI policy overrides. The safe profile adds sandbox and explicit defaults; terminal-parity adds no implicit model, effort, settings, permission, tool, MCP, or prompt override. `environment.mjs` selects and parses one dotenv-compatible file without shell evaluation.

Alternative considered: assemble flags in skills or bootstrap files. Rejected because distributed policy construction is difficult to audit and can silently diverge from direct Terminal behavior.

### 4. Separate orchestration ownership from Claude session ownership

The Codex owner session scopes default enumeration and the current terminal-job retention bucket. The Claude session ID is captured from protocol events/results and is protected by a lease keyed by canonical `CLAUDE_CONFIG_DIR` plus session ID. This prevents two plugin workers from concurrently owning the same Claude session while allowing sequential exact-session continuation.

Alternative considered: use one identifier for both concepts. Rejected because a Codex task may create multiple Claude sessions, while the same Claude session may be continued by multiple sequential jobs.

### 5. Persist control-plane state independently from Claude artifacts

Atomic job files store lifecycle state, process identities, partial/final output, receipts, attempts, and mailbox delivery state. Cleanup retains all active jobs and the newest 100 terminal jobs per Codex owner session, deleting only pruned plugin job files and default logs. Claude session artifacts under `CLAUDE_CONFIG_DIR` are never a plugin cleanup target.

Alternative considered: use Claude transcript files as the job database. Rejected because their schema and retention are owned by Claude Code and do not contain the plugin's process/mailbox control state.

### 6. Record bounded recovery and the current mixed process-identity behavior

The supervisor treats reconnect attempts as part of one logical job, records each attempt, and resumes the exact observed Claude session when safe. Possible side effects without a captured session ID stop automatic replay and require attention. User-facing interrupt/cancel paths require a recorded process identity, but current internal session-conflict cleanup may call termination with a missing identity and stale-state reaping may treat a raw PID as liveness evidence. This is a verified baseline limitation, not the desired end state; `harden-runtime-foundations` must remove both PID-only paths.

Alternative considered: describe every signal path as already identity-checked. Rejected because it would make the retroactive baseline aspirational and conceal a real PID-reuse risk.

## Risks / Trade-offs

- [A retroactive spec can normalize a known unsafe limitation] → Mark PID-only internal behavior as baseline-only and require its removal in the immediately following hardening change.
- [Terminal-parity cannot reproduce TTY-only interaction] → State this limitation and fail honestly when a portable graceful interaction is unavailable.
- [Direct Terminal processes do not participate in plugin session leases] → Require sequential handoff and document that the user must stop one owner before starting another.
- [Bounded plugin retention can remove old receipts] → Keep Claude artifacts independent and ensure later Agent Thread continuity does not depend on old job files.
- [Current public job API is intentionally temporary] → Preserve it only in this baseline; replace it explicitly in `add-agent-thread-orchestration` without a compatibility promise.

## Migration Plan

1. Validate this change's specs and trace them to the baseline commit.
2. Run focused runtime tests and one existing real-smoke path without changing runtime behavior.
3. Sync the baseline delta specs into `openspec/specs/` and archive the change.
4. Start `harden-runtime-foundations` from the archived baseline.

Rollback consists only of reverting the OpenSpec artifacts; no runtime deployment is performed by this change.

## Open Questions

None. Later behavior decisions are isolated in the two subsequent changes.

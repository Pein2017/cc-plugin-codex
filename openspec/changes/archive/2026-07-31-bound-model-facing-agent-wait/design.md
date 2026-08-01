## Context

The model-facing `wait_agent` currently exposes runtime diagnostic flexibility directly: callers may choose any timeout from 0 through 3600000 ms and may request another advisory progress update on every call. A long Codex session demonstrated that an otherwise correct lead can turn those knobs into a polling loop. The checkout already defaults ordinary waits to 600000 ms and completion wins over progress, but those prompt-level defaults do not prevent explicit 1/30/60-second waits or repeated hook wakeups.

The typed MCP boundary, checkout CLI/runtime, durable job files, and Skill have separate owners. This change constrains only the model-facing boundary while retaining operator diagnostics and durable recovery. Each internal job already represents one active Agent turn and already stores `publicProgressDeliveredRevision`, so no new registry or process is required.

## Goals / Non-Goals

**Goals:**

- Make one 600000 ms completion-first wait the only ordinary model-facing join.
- Preserve immediate return when completion arrives before the upper bound.
- Preserve one intentional progress observation per active Agent job while preventing repeated progress loops.
- Keep hook milestones private and retain root isolation, atomic claim, completion priority, cancellation, and at-least-once completion delivery.
- Give tests a deterministic upper bound: one progress delivery per job, followed by completion or timeout.

**Non-Goals:**

- Replacing the runtime's durable-file observation loop with `fs.watch`, IPC, or a resident process.
- Removing explicit timeout control from the checkout CLI, `runtime/index.mjs`, or test fixtures.
- Automatically waking an ended Codex turn or changing Agent execution lifetime.
- Changing completion acknowledgement, model routing, Claude permissions, versioning, installation, or release state.

## Decisions

### The typed MCP boundary owns the fixed model wait

`runtime/mcp-server.mjs` will remove `timeout_ms` from the strict `wait_agent` input schema and will supply `timeout_ms: 600000` when invoking the existing runtime operation. Unknown model input remains fail-fast. The runtime and CLI retain their existing 0..3600000 ms bounded timeout for operator diagnostics and focused tests.

This is preferred over stronger prompt wording because the observed model already had completion-first guidance and still selected short timeouts. It is preferred over globally raising the runtime minimum because that would remove useful local test and operator probes.

### Existing delivered revision is the per-job progress budget

An active job is one Claude Agent turn. `publicProgressDeliveredRevision > 0` therefore proves that the job has already consumed its one model-facing progress observation. Eligibility and the atomic claim path will reject all later revisions for that job. A follow-up creates a new job and naturally receives a fresh budget.

This reuses durable state that already participates in root isolation and claim locking. No new Agent-level counter, Codex-turn identifier, or MCP-local session registry is introduced.

### Hook progress remains private

Jobs may continue persisting hook activity for diagnostics, but hook revisions are not eligible for public projection or atomic delivery. Eligibility rechecks the activity while holding the job lock so a tool-to-hook race cannot consume the one public progress budget.

### Completion remains authoritative

Every wait still reads and freezes unread completion before considering advisory progress. After one progress delivery, even `wake_on_progress: true` behaves completion-first for that job. Cancellation stops only the observation; the Agent and Claude process continue unchanged.

### Guidance mirrors Codex Multi-Agent V2

The MCP description and Skill will state that the lead should do meaningful non-overlapping work after spawn, call wait only when blocked on a critical-path result, omit progress for the ordinary join, and never repeat progress waiting by reflex.

## Risks / Trade-offs

- [A caller can no longer request a short model-facing health probe] → `list_agents` remains the bounded health view, while explicit wait timeouts remain available through the checkout CLI/runtime for operators and tests.
- [The single progress observation may arrive before a later, more interesting phase] → progress is advisory; callers needing the result use completion-first wait, and a new follow-up job receives a new progress budget.
- [Legacy job files retain adaptive backoff fields] → readers ignore those fields after the one-shot rule; no migration rewrite or recovery risk is introduced.
- [A 10-minute MCP call may be cancelled by the host] → the existing abort signal ends only the observation, and durable Agent execution/completion survives.

## Migration Plan

Land source, spec, and tests without updating package version, Plugin manifest cachebuster, installed snapshot, or Cache. Existing working Codex sessions remain on their current loaded behavior. A later explicitly authorized release will install the changed typed schema for newly started tasks; rollback is a source revert before that release.

## Open Questions

None.

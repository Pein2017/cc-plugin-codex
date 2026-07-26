## Context

CC for Pein already has the Codex V2-shaped split between asynchronous spawn, durable root-scoped Agent identity, an independent list/status projection, and a bounded wait. The missing pieces are visible in current use: `wait_agent` only wakes for terminal completion, and the public completion projection deliberately removes the Claude final message. A parent therefore sees silent timeouts and, after completion, may resort to a second Claude turn or a temporary file merely to recover the first turn's answer.

The reference checkout `/data/CoordExp/external/codex` at `4c43465133428898aa84f0bfc02c306ed65fb66a` confirms that V2 does not auto-wait after spawn. Its parent model decides when to continue useful work or call `wait_agent`; a completion watcher separately injects a bounded child final into the parent mailbox with `trigger_turn=false`. An idle or already-final parent is not automatically restarted. Ordinary child commentary is not streamed to the parent.

The local checkout remains the sole runtime source. Claude's raw stream, job state, completion inbox, and Agent registry stay private behind the six canonical operations.

## Goals / Non-Goals

**Goals:**

- Make the Experimental status and host-wakeup limitation explicit on every skill.
- Give the parent a concrete critical-path policy without making spawn blocking.
- Wake a blocked wait on meaningful, sanitized progress milestones.
- Deliver enough bounded completion content for parent synthesis in the same durable completion update.
- Keep terminal completion at-least-once and progress advisory.

**Non-Goals:**

- Starting a new Codex model turn after the parent has become idle or final.
- Token-by-token Claude output streaming or exposing raw partial text/tool inputs.
- Adding a resident forwarding Agent, background terminal dependency, service, or seventh lifecycle operation.
- Copying Codex's thread manager, residency manager, context-forking, or full mailbox implementation.

## Decisions

### 1. Keep `spawn_agent` asynchronous and make joining a parent policy

The spawn skill will classify delegated work as `required`, `parallel-then-join`, or `explicitly-detached`. Required work blocks the parent's final answer; parallel work allows non-overlapping local work before a join; detached work is allowed only when the user clearly requested background execution and the result is not needed for the current answer. The parent will spawn independent lanes first and call root-wide `wait_agent` sparingly when blocked.

This follows Codex V2's useful parallelism and avoids turning every delegation into a synchronous RPC. A runtime-level “all children must finish” gate was rejected because the runtime cannot infer which result is necessary and because Codex itself permits a parent to finish before a child.

### 2. Persist only a safe public-progress projection on each job

The worker will derive a `publicProgress` record from existing stream events. It contains a per-job monotonic revision, a small activity kind, phase, fixed/sanitized summary, and timestamp. Only a fixed allowlist of native tool names may appear; every unknown, MCP, malformed, or path-shaped name becomes the generic `a tool`. Tool inputs, paths, hook payloads, thinking text, response text, session IDs, raw receipts, and partial output are never copied into this projection.

Repeated text/thinking events are coalesced and rate-limited. Tool, hook, retry, reconnect, and phase changes may create new milestones. The full log and partial output remain internal.

Progress delivery uses a separate persisted `publicProgressDeliveredRevision` plus optional adaptive delivery timestamps/interval on the job. `wait_agent` compares the revisions, atomically claims at most one oldest eligible root-owned Agent update under the job lock, and advances only the advisory delivery state. Routine activity retains only the latest revision and backs off from 5 to 10, 20, then at most 30 seconds. Retry, reconnect, and the first transition into responding reset that backoff. Completion never enters the cooldown and always has priority. A process crash may duplicate a progress hint, which is acceptable; concurrent normal waits cannot regress or claim the same revision. The parent passes the current root's active job IDs into the wait so each poll reads only that small set rather than parsing all retained workspace jobs.

A separate Agent-store schema or progress inbox was rejected because progress is non-authoritative, job-scoped, and safely reconstructible. A new `watch` operation was rejected because the canonical six-operation surface already has the correct event barrier.

### 3. Completion has priority and carries a small handoff

The completion inbox continues to store at most 64 KiB of final-message evidence. Its Agent-facing projection will add a UTF-8-bounded completion handoff capped at 4096 bytes, plus an explicit truncation flag. This approximates Codex V2's 1000-token completion envelope without adding a tokenizer dependency. The projection omits result pointers, Claude session IDs, resumability details, and the remainder of the full output. The first model-facing read atomically stamps `firstDeliveredAt`; after that point the token and payload are immutable even if a later reconciliation discovers different terminal evidence. Reconciliation runs before wait so known corrections are applied before that freeze.

Completion events take priority over progress. Their existing opaque delivery token and two-phase acknowledgement remain unchanged, so a lost parent response redelivers the same completion handoff. `list_agents` remains state-only.

Returning a bounded handoff was chosen over asking the Agent for a follow-up or materializing a temporary file: both alternatives spend another Claude turn, can alter the logical result, and bypass the intended durable delivery boundary.

### 4. Wait remains root-wide and event-oriented

`wait_agent` will still have no target. It subscribes logically to the current root, first acknowledges prior completion tokens, then checks completion, then progress, and finally polls until activity or timeout. A timeout changes no Agent or job state. The skill will suppress narration of unchanged timeouts and will not use `list_agents` as a progress-polling substitute.

The public default observation upper bound is 10 minutes and the accepted maximum is one hour. These are deadlines rather than sleep durations: completion returns as soon as it is durable, while progress is returned only when its adaptive heartbeat becomes eligible. A separate completion-only mode or model-facing interval knob was rejected for now because the same default can preserve both prompt simplicity and bounded liveness feedback.

### 5. Experimental status is part of discovery metadata

All six `SKILL.md` files and their `agents/openai.yaml` descriptions will say Experimental. The README and changelog will explain that durable Agent identity and Claude execution are real, but automatic host turn wakeup and exact parity with Codex's internal mailbox are not claimed.

## Risks / Trade-offs

- [Progress can be noisy] → Coalesce to the newest routine revision, adapt delivery from 5 to 30 seconds, return one update per wait, and keep completion priority.
- [Progress may repeat after a race or crash] → Treat it as advisory and identify it with monotonic job revision; never use it as completion evidence.
- [A 4096-byte handoff can truncate a long conclusion] → Mark truncation explicitly and retain full Claude artifacts/internal job result for operator diagnosis; the parent can ask a focused follow-up only when the missing tail is genuinely needed.
- [A parent can still end too early] → Put the join obligation in the spawn and wait skill contracts and state the host limitation prominently; no local plugin can safely force a new Codex turn after final.
- [Final content appears in a tool receipt] → Bound it, keep it current-root only, omit it from list/status, and instruct the parent to synthesize rather than dump raw text.

## Migration Plan

1. Add delta specs and focused failing tests.
2. Add the optional job progress fields and completion projection without changing existing stored schema versions.
3. Update all six skills/metadata and user documentation; bump the experimental plugin minor version.
4. Run focused runtime tests and `npm run check`.
5. Archive/sync the OpenSpec change, merge to the checkout's local `main`, refresh the local plugin snapshot, and require a new Codex task/restart for discovery changes.

Rollback is a normal Git revert plus local plugin refresh. Existing jobs and completion events remain readable because all new persisted fields are optional.

## Open Questions

None. Automatic host reactivation remains an explicit future integration question rather than an implied capability of this change.

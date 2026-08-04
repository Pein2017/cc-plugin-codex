## Context

The Claude Headless adapter parses stream-json and marks a turn complete only after the child process closes with exit code zero and a successful terminal `result`. It therefore cannot report completion while the Claude CLI process is still alive. However, top-level event types outside the current parser vocabulary are reduced to an in-memory type tail and omitted from the normalized result. The checkout has no evidence showing whether Headless Claude waits for native background tasks, emits task lifecycle receipts, or exits while those tasks continue.

Interactive Claude documentation and assistant prose are not authority for the `-p` streaming transport. A protocol-dependent lifecycle change must begin with a pinned real receipt rather than an assumed event schema.

## Goals / Non-Goals

**Goals:**

- Establish reproducible evidence for Claude Headless background-task ownership and terminal ordering.
- Preserve a safe, bounded protocol-drift summary in turn evidence.
- Prevent a clean `completed` projection when recognized native evidence proves must-join work is still outstanding.
- Keep detached and must-join semantics grounded in structured native evidence.

**Non-Goals:**

- Infer lifecycle from final assistant prose, process names, arbitrary descendants, shell conventions, or interactive-only documentation.
- Build a Plugin-owned process supervisor for Claude's native tasks.
- Keep a Claude process resident after a terminal protocol result unless the verified Headless protocol itself supports that state.
- Add a model-facing tool or promise a new status/blocking vocabulary before the spike determines it is necessary.

## Decisions

### Gate implementation on a pinned Headless protocol spike

Use the checkout's fixed environment and terminal-parity command with `claude-haiku-4-5`/low in an isolated temporary Git workspace. Record the Claude executable fingerprint and version, full raw stream-json, child/process exit timing, and a marker owned only by the probe. Test at least: a tracked background command that finishes after the outer response, the same command with streaming stdin held open, and an explicitly foreground wait control.

The evidence artifact belongs under `research/` and contains sanitized event shapes and timing, not credentials, proxy values, native session content unrelated to the probe, or arbitrary hook payloads. If Claude reports account/subscription/usage exhaustion, stop all further real Claude probes and continue only with fixtures/local code.

### Persist only bounded protocol-drift metadata before interpreting it

The adapter may retain a bounded list of unknown `{type, subtype}` pairs and counts in Driver-local native evidence. It SHALL not retain arbitrary unknown payloads. Known terminal classification remains unchanged until the spike maps a stable background lifecycle and updates the parser tests.

This diagnostic step is useful regardless of which protocol path is observed and remains behind the Driver boundary.

### Use a closed native owned-work state machine only when proven

If the spike exposes stable task identifiers and start/terminal events, the Claude Driver tracks only those recognized fields in a bounded map. An unmatched terminal event, duplicate identity with contradictory state, or successful terminal result with recognized must-join tasks open is contradictory native evidence.

If a `result` arrives while the Claude process stays alive and the protocol proves a later native reinvocation, the adapter may keep stdin open and the job active through that native lifecycle. If the process closes while must-join work remains, the Driver returns a non-success Harness failure using the existing closed incompatibility path unless a separately approved public blocking reason is required. It never fabricates `working` after process ownership is gone.

If no stable lifecycle is emitted, implementation stops after diagnostics and records that the Plugin cannot strengthen completion beyond process close plus terminal result. It SHALL not simulate certainty with process scanning.

### Treat detachment as native evidence, not a phrase

A background task is excluded from clean-completion gating only when the native protocol marks it detached or outside the current turn's ownership. If the protocol tracks a task but does not expose detachment, it defaults to must-join. Statements such as "I left this running" in assistant output have no lifecycle authority.

### Keep the shared supervisor Harness-neutral

The Claude Driver owns all task-event parsing and consistency checks. It returns a normalized completed result only after its native evidence is coherent. The shared job supervisor continues to consume one Driver terminal result and never learns Claude-specific task event schemas.

### Route implementation as evidence, builder, and independent review waves

The real protocol scout is Claude Haiku/low because the work is mechanical and cost-sensitive; its narrative interpretation is not accepted without raw receipts. The lead fixes the observed protocol contract before code begins. A Codex Luna/high or xhigh builder owns the adapter/Driver implementation behind deterministic fixtures if the live interface exposes Luna; otherwise Terra/high owns it. A fresh Claude Opus/high reviewer audits the fixed diff for false completion and payload leakage. The Codex lead runs fixtures, integration tests, and `npm run check`, and records routing observations only when they change a future routing decision.

## Risks / Trade-offs

- [Claude Code updates change the observed event schema] -> Pin version/fingerprint in evidence, keep event recognition fail-closed, and extend version compatibility smoke before accepting a new schema.
- [A real probe spends subscription quota] -> Use one Haiku/low evidence matrix, stop on account-limit evidence, and replay captured fixtures for subsequent tests.
- [Unknown event diagnostics leak payloads] -> Persist only closed type/subtype/count metadata under a strict byte and entry bound.
- [Holding stdin open changes Headless semantics] -> Test it as a separate probe arm and never promote the path without a native terminal receipt.
- [An orphaned OS process is mistaken for Claude-owned work] -> Do not scan descendants as lifecycle authority; use OS evidence only to describe probe behavior.
- [The protocol cannot distinguish detachment] -> Default tracked work to must-join and do not add a prompt-derived escape hatch.

## Migration Plan

1. Add fixture-level unknown-event summary support without changing terminal classification.
2. Run the pinned Haiku/low probe and commit the sanitized evidence artifact.
3. Stop and reconcile the design/spec if the observed protocol lacks stable task identities, contradicts the assumed ordering, or requires a new public status/blocking vocabulary.
4. Implement only the evidence-supported parser and Driver state machine, then add exact fixtures for every observed ordering.
5. Run focused adapter/Driver/supervisor tests and `npm run check`; classify promotion as hot-compatible only if the public schema and receipt vocabulary are unchanged.

Rollback removes recognized background event handling but keeps bounded unknown-event diagnostics readable. If a public status or blocking vocabulary was required, rollback is restart-required and must preserve durable receipt readability.

## Open Questions

- What exact event shapes, task identities, and terminal notifications does the currently admitted Claude version emit in Headless mode?
- Does streaming stdin permit a native task-completion reinvocation after an outer `result`, or is `result` always the final turn boundary?
- Can the protocol distinguish detached from must-join work without assistant prose? These questions are evidence gates, not implementation choices to guess.

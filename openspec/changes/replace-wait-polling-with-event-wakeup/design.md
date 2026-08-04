## Context

The current internal wait loop rereads the owner-root completion inbox and, when progress is requested, active job files every 500 ms until activity, abort, or deadline. The fixed one-hour MCP window reduces repeated model turns but magnifies local polling to roughly 7,200 scans in the quiet worst case. Each MCP call runs in an isolated Worker, so an in-process emitter owned by another call cannot provide the wakeup.

Durable job and inbox writers already use temporary-file plus atomic rename. Node's `fs.watch` maps to inotify on supported Linux, but notifications can coalesce, omit filenames, be lost on some filesystems, or stay attached to a replaced inode. The watcher therefore cannot become the fact source.

## Goals / Non-Goals

**Goals:**

- Make the supported Linux wait path dormant between durable state changes.
- Wake promptly when completion or explicitly requested progress is written.
- Preserve durable reads as truth, bounded deadline/abort, completion priority, root isolation, and quiet-wait zero writes.
- Recover from watcher setup failure, dropped events, directory creation, and isolated-worker cancellation.
- Supply deterministic evidence that local read amplification and wake latency improve.

**Non-Goals:**

- Change model-facing timeout, schema, receipts, progress budget, completion batching, or acknowledgement semantics.
- Introduce a daemon, socket, resident forwarding Agent, cross-process in-memory bus, or persistence writes solely for notification.
- Treat filesystem events or callback filenames as authoritative completion facts.
- Guarantee the same efficiency on unsupported or unreliable non-Linux filesystems.

## Decisions

### Add one internal durable-activity wake primitive

The internal runtime owns an ephemeral helper that waits for one of four reasons: filesystem hint, recovery scan, deadline, or abort. It receives computed durable paths and injected watcher/timer functions for deterministic tests. It neither reads nor writes lifecycle state itself.

`wait()` retains the observation loop and calls the helper only after a durable read finds no eligible update. Every wake returns to the existing readers and reconciliation path; completion remains authoritative over progress.

### Watch directories, never atomically replaced files

The helper watches the existing completion-inbox directory and jobs directory. When either does not exist, it walks upward only within the checkout-owned plugin state root to the nearest existing ancestor. It does not create a directory. After an ancestor reports creation, the next cycle resolves paths again and narrows coverage to the newly existing directory.

Directory events are unfiltered hints because Node does not guarantee a callback filename. Watching the inbox file itself is rejected because atomic replacement can leave the watcher attached to the old inode.

### Close the registration race with observe-register-observe

Each wait cycle follows:

1. read durable completion/progress facts;
2. register watchers for the current existing directory set;
3. read the same facts again;
4. if still quiet, await watcher hint, recovery timer, deadline, or abort;
5. close every watcher in `finally` and return to step 1.

A write between the first read and watcher registration is found by the second read. A write after registration either emits a hint or is found by the recovery scan. The existing final zero-time completion observation remains unchanged above this primitive.

### Use bounded recovery and unsupported-watcher fallback

When at least one relevant watcher is established, a 10-second recovery timer bounds missed-event latency. When no watcher can be established or all watchers error, a 5-second fallback scan is used. The final sleep is always clamped to the caller deadline. These constants are internal and testable; they are not model inputs.

Watcher errors are diagnostic wake reasons, not lifecycle failures. The next cycle may re-establish coverage. The primary Linux release gate must demonstrate event-driven completion; fallback behavior protects unusual mounts without claiming equivalent latency.

### Preserve isolated Worker cleanup and zero-write observation

Each MCP call Worker owns and closes its watchers. The existing AbortSignal closes the pending wait immediately, and `persistent: false` prevents a stray watcher from extending a Worker after the operation settles. Registration and cleanup create no durable directories, markers, counters, or receipts.

### Keep metrics test- and operator-facing

The helper exposes injected or returned internal diagnostics sufficient to test wake reason, watcher setup/error count, recovery count, and durable read count. `AgentRuntime.waitAgent` continues to omit them. Model-call count remains a host concern and is not invented by this runtime.

Acceptance includes a real Linux filesystem integration test showing an atomic rename wakes a blocked wait through the filesystem-event path before an injected long recovery interval, plus deterministic fake-watcher tests for quiet read count and failure recovery. Elapsed time remains diagnostic evidence rather than a load-sensitive correctness threshold.

### Serialize shared implementation and review independently

This change modifies the same wait seam later used by targeted/barrier join, so it is implemented first by one Codex builder. Prefer live Luna/high behind exact tests; escalate to Luna/xhigh before changing models if the gap is bounded. A fresh CC Opus/high reviewer then audits missed-event races, resource cleanup, and false fact ownership. The lead integrates and runs the verifier before targeted join begins.

## Risks / Trade-offs

- [Watcher drops or coalesces an event] -> Re-read durable facts after every hint and at the 10-second recovery boundary.
- [Atomic rename invalidates a file watcher] -> Watch existing directories or bounded ancestors, never the inbox/job file inode.
- [A desired directory does not yet exist] -> Watch the nearest existing owned ancestor without creating state, then rebuild coverage after activity or recovery.
- [Shared ancestor sees foreign-root activity] -> Treat it only as a spurious hint; owner-root readers enforce isolation and later cycles narrow the watch.
- [Watcher setup throws or filesystem support is unreliable] -> Fall back to a 5-second bounded scan and retain deadline/abort behavior.
- [Watcher leaks keep Workers resident] -> Use non-persistent watchers, close all handles in every resolution path, and test active-handle cleanup.
- [Completion and progress arrive together] -> Reuse the existing completion-first read and final-observation ordering.

## Migration Plan

1. Add the internal helper and deterministic race/cleanup tests without changing `wait()`.
2. Switch the no-update sleep boundary from 500 ms polling to the helper while preserving direct runtime timeout injection for tests and diagnostics.
3. Prove completion, progress opt-in, acknowledgement, quiet zero-write, root isolation, abort, final observation, and isolated-worker teardown.
4. Run focused tests and `npm run check`, then perform a fixed-tree provider-independent review.
5. Begin `add-targeted-barrier-agent-join` only after this wait primitive is accepted so the new barrier path uses the same notification owner.

The change is hot-compatible and requires no storage migration. Rollback restores the polling sleep and removes the helper; durable facts remain untouched.

## Open Questions

None. The recovery intervals are implementation constants with explicit tests, not public policy.

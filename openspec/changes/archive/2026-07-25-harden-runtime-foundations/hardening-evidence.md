# Hardening evidence

## Scope and implementation map

- Durable completion delivery: `runtime/completion-inbox.mjs`, terminal reconciliation in `runtime/job-store.mjs`, and bounded wait in `runtime/internal-runtime.mjs`.
- Logical root scoping: immutable host identity in `plugins/cc-for-pein/bootstrap/cc-runtime.mjs`, root-scoped resolution in `runtime/internal-runtime.mjs`, and the separate read-only `runtime/operator-cli.mjs`.
- Recoverability: explicit terminal classification and evidence in job records and completion events; follow-up rejects unproven or cancelled sources.
- Process cleanup: identity-required signaling/liveness, terminal residency receipts, lease release, and immediate worker exit.
- Capacity evidence: reproducible `scripts/probe-runtime-capacity.mjs` workload and retained results below.

`ownerRootId` is a logical default-isolation boundary against accidental cross-root orchestration. It is deliberately not described as cryptographic authorization.

## Automated verification

`npm run check` passed after implementation:

- runtime unit tests: 51 passed, 0 failed;
- runtime integration tests: 11 passed, 0 failed;
- lint and typecheck passed;
- focused hardening tests covered restart reconciliation, concurrent inbox access, at-least-once redelivery, contiguous acknowledgement, pruning, root isolation, operator-only all-roots listing, recoverability, process identity, and state protection receipts.

## Completion delivery smoke

The real terminal-parity prompt `Reply exactly CC_INBOX_OK` ran as job `cc-ms0hvxz9-o83lw2` with a 120-second bound and produced exactly `CC_INBOX_OK` without tools. Claude session `44005cbf-9dcf-4417-b566-866c63b366d9` was captured. After the starter process exited, a separate runtime invocation recovered the unread event and opaque token. A later invocation acknowledged token `delivery--YqscvuLsSVuNjVAdjGrSJNHkNPYSN8iACq9FNauZv4`; the cursor advanced to 1 and the inbox became empty. No resident Claude process was needed between calls.

## Capacity probe

Fixed workload: `Reply exactly CC_CAPACITY_OK; do not use tools`, one Claude turn per job, terminal-parity profile, 180-second timeout. The probe stopped on any incorrect output, failure, lease conflict, unclean terminal receipt, or unsafe host pressure.

| Level | Latencies (seconds) | Per-process peak RSS (bytes) | Aggregate peak RSS (bytes) | Outcome |
|---|---|---|---:|---|
| 1 | 4.896 | 372,822,016 | 372,822,016 | exact output; clean terminal state |
| 3 | 5.602, 4.754, 8.693 | 356,380,672; 362,790,912; 367,054,848 | 1,074,044,928 | all exact; no failures or lease conflicts |
| 6 | 4.622, 4.714, 5.593, 4.666, 5.140, 6.153 | 358,854,656; 362,856,448; 360,185,856; 360,419,328; 355,033,088; 357,842,944 | 2,064,584,704 | all exact; no failures or lease conflicts |

Host available memory was 1,035,397,636,096 bytes before the probe and 1,034,706,419,712 bytes after level 6. All workers and Claude children exited, identities cleared, and session leases released.

Decision: no unsafe boundary was observed at the planned levels, so the runtime adds no arbitrary internal concurrency cap. Conditional task 4.5 is satisfied by recording that its condition was false; no admission-control code was added.

## Resolved stable-spec matrix

| Delta capability | Materialized stable specification |
|---|---|
| completion events, two-phase delivery, bounded wait, pruning survival | `completion-delivery` |
| atomic inbox, recoverability evidence, idempotent reconciliation, identity-only process control, root retention | `durable-runtime-state` |
| logical owner root, direct-operation matching, operator-only diagnostics, exact-session follow-up | `tracked-job-control` |
| automatic cleanup, nonresident history, evidence-driven concurrency | `runtime-residency` |

Every hardening MODIFIED requirement was diffed against the baseline stable specification and materialized above before archive.

# Agent v0.2 acceptance evidence

Date: 2026-07-25

## Preconditions

- Repository-local baseline change archived at
  `openspec/changes/archive/2026-07-25-establish-cc-runtime-baseline`
  (`182c1fb`).
- Runtime hardening change archived at
  `openspec/changes/archive/2026-07-25-harden-runtime-foundations`
  (`a00b3f5`).
- `openspec validate add-agent-thread-orchestration --strict --no-interactive`
  passed before implementation closeout.

## Automated acceptance

`npm run check` passed on Node.js with:

- ESLint: passed.
- TypeScript check: passed.
- Runtime tests: 81 passed across 18 suites.
- Runtime integration tests: 9 passed.

The integration matrix covers the six canonical operations, duplicate-name and
logical-root isolation, two concurrent Agents, active and idle mailbox paths,
exact-session follow-up, two-phase completion acknowledgement, interruption,
removed lifecycle commands, operator-only `--all`, copied-bootstrap delegation,
and terminal-parity environment preservation. Native Windows identity and
forced-termination behavior remain defensive fake-platform tests; Linux is the
supported platform and the real smoke ran on Linux.

## Ops5 fixed-point review

An independent Sol xhigh review blocked the first release candidate on five
previously untested crash/concurrency boundaries. The implementation and
regression suite now cover each one:

1. all Agent-linked terminal facts lacking `agentProjectionReconciledAt` are
   reconciled before the newest-100 retained job view may hide or prune them;
2. Agent `messageId` is a job-lock idempotency key for steering, and initial
   prompt intent cannot also be delivered as steering;
3. session binding conflict/drift corrects the durable terminal job to failed
   and derives one consistent errored/blocked Agent completion before delivery;
4. a durable unbound prepared-job fact precedes Agent activation attachment and
   worker launch; grace-expired pre-attach reservations are conservatively
   rolled back while live launch windows are retained;
5. concurrent terminal follow-ups find their already-assigned mailbox message
   and return an already-active receipt instead of reporting false failure;
6. unknown CLI options are rejected instead of being consumed as prompt text;
7. messages racing either side of initial job preparation remain queued without
   false steering or root completion, including when preparation or attachment
   fails before Claude starts.

The added regression suites are `agent-reconciliation`,
`agent-message-idempotency`, `agent-session-conflict`, `agent-launch-boundary`,
and `args`. Six successive Sol xhigh release-gate reviews were run as fixes
converged; the final Ops5 verdict was `APPROVE` with no remaining P1/P2.

## Real Claude acceptance

All cases used owner root `cc-real-agent-v02-20260725-01`, the checkout-owned
runtime, `CLAUDE_CONFIG_DIR=/data/CoordExp/.claude`, and the configured local
proxy environment. No more than two Claude turns ran concurrently.

| Case | Result | Durable evidence |
|---|---|---|
| Agent A | `CC_AGENT_A_OK` | completed, resumable, session `ad2f...4a39` |
| Agent B | `CC_AGENT_B_OK` | completed, resumable, session `9606...43dd` |
| Agent A follow-up | `CC_AGENT_A_FOLLOWUP_OK` | completed on the same `ad2f...4a39` session; completion sequence advanced from 1 to 2 |
| Sequential interrupt | graceful SIGINT during the 30-second Node timer | interrupted, `forced=false`, resumable session `14fe...3cfd`, logical Agent retained |

The first wait returned both A/B events without acknowledgement. A later wait
acknowledged their exact oldest contiguous token prefix and returned the
follow-up as the next unread event. This confirms completion is durable for a
later Codex turn; it does not claim unsolicited host wakeup while no Codex turn
is active.

The complete A/B, same-session follow-up, token acknowledgement, and graceful
interrupt matrix was repeated after all Ops5 P1 fixes under owner root
`cc-real-agent-v02-final-20260725-01`; the exact outputs, same-session property,
and `forced=false` interrupt result passed again.

After the final durable launch-boundary changes, a last real Claude smoke under
owner root `cc-final-launch-boundary-20260725` returned the exact output
`CC_FINAL_BOUNDARY_OK`, completed as resumable on session
`40f73752-66cb-4545-90f2-d26c9acc692c`, and left the logical Agent nonresident
after worker exit.

## Resolved delta-to-stable matrix

| Capability | Delta operation | Stable materialization |
|---|---|---|
| `agent-thread-registry` | added | new stable specification |
| `canonical-agent-orchestration` | added | new stable specification |
| `completion-delivery` | 3 modified | Agent-linked terminal event, Agent wait semantics, pruning-independent unread completion |
| `durable-runtime-state` | 5 added, 4 modified | Agent projection, explicit status mapping, durable metadata/session binding, root inbox, recoverability, reaping, leases |
| `tracked-job-control` | 2 added, 8 removed | jobs become internal Agent-turn receipts; public job lifecycle and destructive cancellation are removed |

No legacy job is auto-promoted into an Agent, no Terminal-created Claude session
is adopted, and no close/archive/delete lifecycle is introduced. Agent records
are logical nonresident history; worker processes and session leases are cleaned
up at terminal transition.

## Local plugin snapshot

`npm run install:local` installed `cc-for-pein@pein-local` version `0.2.0` from
this checkout. The installed snapshot contains exactly:

- `spawn-agent`
- `send-message`
- `followup-task`
- `wait-agent`
- `interrupt-agent`
- `list-agents`

The copied bootstrap rejects versioned-Cache runtime execution and delegated a
real readiness request to `CC_RUNTIME_CHECKOUT`. Codex restart/reload remains the
explicit post-install user step; the stable-main checkout will be installed once
more after merge so the configured checkout path survives feature-worktree
cleanup.

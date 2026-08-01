# Architecture and migration review evidence

The independent read-only review required by task 5.4 was completed before source
acceptance. Its initial green-suite verdict was treated as evidence, not acceptance:
the lead then traced the production execution, activation, persistence, rollback,
and migration paths and found contract defects that the first review had missed.

## Final verdict

PASS at source level after remediation. No open P0/P1/P2 finding remains in the
accepted scope. Release, installation, Cache refresh, and a second Harness were not
performed by this change.

## Findings remediated before acceptance

| Finding | Resolution and discriminating evidence |
| --- | --- |
| The generic supervisor reconstructed lifecycle state from Claude-only `nativeReceipt` fields | `execute()` now consumes only the normalized turn result. A fake non-Claude Driver returns a poison native receipt and proves the production payload ignores it (`tests/runtime/harness-driver-contract.test.mjs`). |
| Worker launch performed Claude compatibility checks outside the Driver | Prepared-preflight validation, immediate revalidation, and opaque launch context are required Driver operations. `runWorker()` contains no Claude compatibility owner. |
| The runtime invoked `describeUnreadiness` without requiring it in the Driver contract | Driver composition now fails before state or process creation when the operation is absent. |
| Agent activation checked only Harness identity | A v2 Agent now retains an immutable Driver version and closed capability snapshot; activation, steering, continuation, and history fail closed on drift. Interrupt remains available across a Driver build change when the persisted Harness and interrupt capability are valid. |
| Agent-store creation/updating could override or mutate the accepted Driver contract | Harness, Driver version, capability snapshot, schema version, model, and topology now remain store-owned and immutable after v2 creation. |
| The Agent supervisor directly imported Claude model/profile validation | Spawn, follow-up, and legacy model normalization now validate through the resolved Driver. The public canonical-model rule for topology-changing routes remains behavior-compatible. |
| Version-2 jobs used the same literal `queued` state accepted by a v1 worker | New jobs use the wire-level `harness_queued` fence. The v2 worker claims that state; a v1 worker rejects it before launch. |
| The earlier migration wording claimed every v2 record was unreadable by v1 | The specification now states the real safe boundary: v1 rejects v2 Agents and cannot claim v2 jobs, while Claude bindings and leases stay wire-readable so an old process observes existing ownership instead of stealing a live session. |
| Effort was frozen into Agent identity even though follow-up permits per-turn effort | The immutable Agent route is Harness/model/topology. Effort and write intent are validated and persisted per job. Legacy `selectedEffort` is removed only during safe terminal migration. |
| Non-Claude instance keys were path-canonicalized by job and Agent stores | Only `claude-code` treats its instance key as a canonical filesystem path. Other Drivers retain validated opaque text byte-for-byte. |
| A v2 Agent could carry a native session reference for another Harness | Durable validation now rejects the cross-Harness reference before lifecycle use. |
| A Driver could return `status=failed` with `exitStatus=0`, causing the generic runner to persist a completed job | The normalized terminal contract requires consistent status/exit evidence, a failure class for non-completion, normalized final-message text, process evidence, and a bounded owned Driver receipt. |
| A Driver version bump could make an in-flight turn uninterruptible | Process control validates the persisted closed capability snapshot but permits same-Harness Driver-version drift. Execution, steering, continuation, and history remain strict. |
| Claude and future Harness session identities could collide or drift under symlinked config paths | Claude preserves the literal v1 digest formula over canonical `CLAUDE_CONFIG_DIR`; other Harnesses are namespaced by Harness ID and opaque instance key. Agent bindings and active leases share that identity. |

## Final verification

Executed from `/data/CoordExp/cc-plugin-codex` on Linux:

```text
npm run check
  lint: pass
  typecheck: pass
  runtime: 259 passed, 0 failed
  integration: 14 passed, 0 failed

openspec status --change generalize-agent-runtime-with-harness-drivers --json
  artifacts: 4/4 done

openspec instructions apply --change generalize-agent-runtime-with-harness-drivers --json
  tasks: 18/18 complete

openspec validate generalize-agent-runtime-with-harness-drivers --strict
  valid

git diff --check
  pass
```

Static scope checks confirm exactly one admitted Driver (`claude-code`), no public
`harness` selector, no package/manifest version change, no dependency change, no raw
provider API, no upstream or versioned-Cache runtime dependency, no installer action,
and no Plugin rename.

## Accepted compatibility boundary

- Valid version-1 Agents/jobs are interpreted only as Claude Code.
- Active or ownership-uncertain v1 records are never rewritten or stolen.
- Terminal unowned v1 Agents normalize only when their persisted job proves the
  Driver contract and model route.
- Version-2 Claude bindings and leases deliberately retain the v1 digest and
  ownership fields; this is necessary hot-rollback protection, not dual-write
  compatibility scaffolding.
- The narrower neutral native-session ID syntax is fail-closed and accepts every
  currently observed Claude session ID.

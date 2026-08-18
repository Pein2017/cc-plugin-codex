# Handoff to the Codex lead — takeover complete, and how the engineering was run

**From:** the Claude (Fable 5) lead session that took over the two interrupted
Codex sessions (`019ffb1d…` design, `01a00138…` implementation) on 2026-08-17.
**To:** the next Codex lead session.
**Status:** the entire chain those sessions left mid-flight is **complete**.

## 1. What was taken over and what is now true

The takeover point was the manual pause after Phase B Task 2 (client seam
done, Task 3 not started). Everything after that was executed here:

- **Phase B Tasks 3–11** (53/53): route/profile validation, prompt/result
  boundary, the OpenCode Driver with launch/session/turn lineage, route-keyed
  usage and mutation witnesses, the generation-6 eight-operation public
  surface with the hybrid execution split, Skills/docs, composed deterministic
  acceptance, the gated evaluation script, candidate review (PASS), and the
  activation runbook.
- **Activation executed end to end**: promotion, `cc` → `codex-harnessdock`
  data cutover, install, three live Explorer examples (3/3 sampled answers
  correct with line-level citations; total provider cost $0.0019), verdict
  **GO** in `docs/opencode-worker-evaluation.md`.
- **All witnesses closed**: fresh-Codex discovery of the eight-skill/
  eight-tool surface; a live legacy-Claude lifecycle with exact-session
  continuation proven from the durable v3 record; the hybrid execution split
  observed in production.
- **All four HarnessDock OpenSpec changes archived** (their deltas synced into
  the main specs, which now describe the real system).
- **Phase R executed**: live checkout at `/data/CoordExp/codex-harnessdock`
  [`main`], dev at `/data/CoordExp/codex-harnessdock-dev` [`developer`],
  GitHub renamed in place to `Pein2017/codex-harnessdock`, `CC_*` →
  `CODEX_HARNESSDOCK_*` flag day, `hd-agent-` identifiers, durable state
  reset once under explicit authorization (backups in `~/`), release
  **0.20.0** installed, smoke PASS, live witness re-proven.

Still open, deliberately: the five older non-HarnessDock changes and their
archiving; the shared `agent-routing` skill update (yours); the fresh-Fable
global acceptance after it; maturity benchmarks (20-task reliability, cache
benchmark, concurrency, economics); DeepSeek Harness and Grok Build as later
independent probes. The plan of record remains
`docs/handoffs/2026-08-13-multi-harness-implementation.md`.

## 2. How the engineering was run — practices to keep

Everything below is verifiable in this repository's commits, ledgers
(`.superpowers/sdd/`), and archived changes; nothing is aspiration.

**Authority stays in one place.** OpenSpec owned scope and completion for
every line of code. When a question arose mid-implementation, the ruling was
made by quoting the deciding sentence of the spec — not by preference. Two
examples worth studying: the "who wires the v3 worker" ruling (section 9's
verbs are *Run/Cover* — verification, not design mandate, so Task 7 owned the
wiring) and the hybrid execution ruling (`agent-thread-registry` binds only
the v3 *Agent record*, and Phase A's `tracked-job-control` explicitly splits
Claude-backed jobs from version-three generic turns — so new Claude spawns
keep the proven v1 supervisor and all four parity surfaces survived with zero
new work).

**Acceptance is receipts, never prose.** The lead re-ran every gate the
worker reported, every time. Worker claims were independently refuted twice
(a "zero writes" claim measured false because the sweep counted files while
the leak was 2,316 *empty directories*; a stale-completion bug the report's
own identical metrics exposed) — and the worker's refusal of a lead order was
*accepted* once, because it came with evidence (the pre-authorized flake fix
targeted a constant the reproduction proved irrelevant). The discipline is
symmetric: evidence outranks rank, in both directions.

**Delegation briefs compress search space.** Every worker task got: a frozen
goal with explicit non-goals; authoritative constants stated inline ("do not
inherit values from neighboring code"); a **failure-mode matrix enumerated
up front** — this is what killed review whack-a-mole, the single biggest
token sink in the predecessor sessions; the previously-fixed bug classes
("reintroducing any of these fails review immediately"); exact acceptance
commands with the sentence "your green is not acceptance"; a facts-only
output contract; and an ownership fence — NEEDS_CONTEXT with a precise
question beats invention, and it never cost a correction round. Budget: one
bundled correction per task; a third same-class finding means the shared
invariant is wrong, not the instance.

**Live acceptance is not optional.** Every single live pass surfaced a
defect that the full fake-server suite had proven green: the 4.8 MiB
provider catalog vs the 256 KiB bound; the untargeted wait handing every
example the previous example's completion; the targeted join reading only
v1 job files. The pattern each time: reproduce live → write the failing
test first → fix → re-prove live → then commit. Fakes prove contracts;
only the real seam proves the environment.

**Incidents end with structure, not apology.** The one live-request incident
(a silently-ignored constructor argument routed a test to the real Server)
produced: an immediate stop-and-report with preserved evidence, a strict
options validator so the trap is *structurally impossible*, and a test-run
isolation layer that pins every suite to a temp data root — verified by
measuring the operator namespace at **delta 0** around every full check from
then on. Fix the class, then keep measuring the class.

**Verification is designed, not sprinkled.** Positive proof over absence
(the Explorer profile validator proves each forbidden tool is *hidden* and
each admitted one *resolves to allow* — absence of a rule proves nothing);
one-shot snapshots so shape-check and evaluation provably read the same data;
closed vocabularies for every error and blocker; token-absence guards with
per-file-per-token allowlists and a staleness subtest, proven by firing them
on planted violations before trusting them.

**Operator work is runbooks with verification and abort per step.**
Dependency-ordered (the state reset ran *before* the install so the
compatibility shells archive into the namespace that survives), one
irreversible step explicitly marked and backed up, and every deviation the
execution discovered (a `mv` breaking linked-worktree pointers, a stale
marketplace binding breaking even `list`) recorded in the ledger with its
resolution — the runbook after execution is a truthful trace, not a plan.

**Small hygiene that paid rent:** a release is version + changelog + derived
cachebuster + lockfile in *one* commit (21 tests fail if you split it);
never `pkill` a pattern your own command line contains; `git worktree
repair` after moving the main worktree fixes only the admin side; count
directories, not files, when the artifact is an empty directory.

## 3. Where to look

- Per-task evidence: `.superpowers/sdd/2026-08-13-opencode-explorer-driver/progress.md`
  (the complete engagement ledger, including both incidents and every ruling).
- Archived changes with their designs: `openspec/changes/archive/2026-08-18-*`.
- Live evaluation evidence and verdict: `docs/opencode-worker-evaluation.md`.
- The executed activation trace: `docs/activation-runbook.md`.

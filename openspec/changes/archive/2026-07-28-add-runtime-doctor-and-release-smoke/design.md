## Context

CC for Pein deliberately separates a checkout-owned runtime from Codex's versioned Plugin discovery snapshot. The seven lifecycle operations are already tested behind `runtime/index.mjs`, while installation, dependency resolution, host Claude authentication, fixed environment values, MCP discovery, and accumulated local state span several operator-owned seams. Today those seams require manual commands and can report generic Node loader failures.

The diagnostic path must remain outside the model-facing Agent API, must not mutate or duplicate Agent/session ownership, and must not make a paid Claude call by default. It also must distinguish evidence from the installed snapshot from executable runtime ownership: the snapshot is inspected and its descriptor bootstrap is launched for release acceptance, but all runtime implementation still comes from `/data/CoordExp/cc-plugin-codex`.

## Goals / Non-Goals

**Goals:**

- Provide one redacted, machine-readable operator health report with actionable failures.
- Exercise the actual installed Plugin discovery snapshot and stdio MCP boundary without model spend.
- Expose aggregate storage and retention facts without reading message bodies or changing state.
- Make the package version the only human-edited release base and derive other runtime/plugin version expressions.
- Convert dependency-loader failures into a stable recovery instruction.

**Non-Goals:**

- Add or change a model-facing lifecycle operation or Skill.
- Delete, archive, compact, or repair any Agent, job, completion, or Claude artifact.
- Guarantee that a zero-cost smoke reproduces an entire paid Codex model turn.
- Auto-wait after spawn, wake an idle Codex task, or retain MCP-local session state.

## Decisions

### 1. Operator commands remain outside `runtime/index.mjs`

`npm run doctor` and `npm run smoke:release` call dedicated scripts and testable operator modules. They do not become MCP tools or Skills, and they do not widen the frozen seven-operation public runtime. This keeps model permissions and root isolation unchanged.

Alternative considered: add `doctor` as an eighth MCP tool. Rejected because host installation and cross-root storage facts are operator concerns and would unnecessarily expose system-level evidence to the model.

### 2. Diagnostics are structured checks with redacted public details

Each check returns a stable identifier, `pass`/`warn`/`fail` status, a bounded public summary, and an optional recovery action. Authentication reports only `loggedIn`, method/provider/subscription class when available; it never emits email, organization IDs, tokens, proxy credentials, raw command output, or environment dumps. Proxy checks compare normalized endpoints to the fixed 9090 contract.

The command exits nonzero only when a required check fails. Warnings cover advisory facts such as cleanup candidates or a Claude history directory with no discovered sessions.

### 3. The release smoke launches the installed descriptor snapshot

The smoke resolves `cc-for-pein@pein-local` from `codex plugin list --json`, derives the installed snapshot from Codex's local cache layout, confirms exact version and seven Skill directories, then starts that snapshot's `bootstrap/cc-mcp.mjs` with an MCP client. It verifies exactly seven tools and calls `list_agents` using a random synthetic root ID, the requested workspace URI, and a temporary `CC_RUNTIME_HOME` so the smoke does not touch production Agent state.

This is a fresh host-load acceptance of the same discovery and protocol boundaries used by a new Codex task. It does not claim to execute a paid Codex model turn. The optional `--real-claude` continuation invokes only `claude-haiku-4-5` at `low`, with `write: false`, and stops after its single task or any quota/subscription failure.

### 4. Storage diagnostics scan metadata without invoking reconciliation

The inventory reads file metadata and bounded JSON control records directly. It counts workspace state roots, Agent records by status, job records by status, inbox files and unread counts, stale reservation/temporary files, and Claude JSONL session artifacts by age. It does not call `list_agents`, `listJobs`, or other paths that can reconcile state, acquire durable locks, acknowledge completion, or prune files.

Cleanup output is dry-run only. Conservative candidates are limited to stale reservation/atomic-temp artifacts and bounded terminal job records that exceed the existing newest-100-per-owner policy. Claude artifacts are reported under their separate 30-day history policy and are never cleanup candidates.

### 5. `package.json` owns the release base version

A small runtime version module reads the checkout package metadata. MCP server identity uses that value. Cachebuster refresh replaces the manifest's base with the package version instead of preserving a stale manifest base; the install path validates the derived relationship. `package-lock.json` remains generated npm metadata rather than an independent release decision.

### 6. Bootstraps preflight checkout dependencies

Both installed bootstraps test that the checkout can resolve the MCP SDK and Zod before starting either entrypoint. Failure produces one concise message naming the checkout and `npm install`. The preflight intentionally avoids importing the runtime module so Node cannot print an unbounded dependency loader stack first.

## Risks / Trade-offs

- [Codex changes cache layout or plugin-list JSON] -> Keep layout resolution isolated, fail with an actionable host-compatibility message, and cover the resolver with fixtures.
- [Auth status JSON changes] -> Treat exit status and `loggedIn` as primary evidence, allow bounded optional fields, and never expose unknown fields.
- [Direct state scanning misclassifies malformed files] -> Count malformed records separately, never repair them, and make them a warning rather than a cleanup candidate.
- [Optional real smoke consumes subscription quota] -> Require `--real-claude`, print the model/effort before launch, run one task only, and preserve existing quota stop guidance.
- [Snapshot checksum differs only because refresh is pending] -> Doctor fails the version/content check and instructs `npm run refresh:local`; it never silently installs.

## Migration Plan

1. Add tests and operator modules, then run the zero-cost doctor and release smoke against the current installation.
2. Refresh the local Plugin once so the updated bootstrap and cachebuster are installed.
3. Re-run doctor and release smoke against the new snapshot.
4. Start a new Codex task to load the refreshed Skills/MCP server.

Rollback is a normal Git revert plus local Plugin refresh. Operator commands create no durable migration state.

## Open Questions

None. Automated cleanup remains deferred until real storage growth justifies a separate OpenSpec change.

## Why

The runtime and Agent lifecycle are well tested, but host updates can still fail at the seams between the checkout, installed Plugin snapshot, Claude authentication, fixed environment, and Codex MCP discovery. Maintainers need one redacted diagnostic and one repeatable release acceptance path before an update is trusted for daily use.

## What Changes

- Add one operator-only `doctor` command that checks the canonical checkout, installed Plugin version, required Node dependencies, Claude CLI compatibility and authentication, fixed Claude config and 9090 proxy envelope, and discovery of exactly seven MCP tools.
- Add read-only storage inventory to `doctor`, including Agent registry, job, completion inbox, and Claude session-history retention facts plus conservative dry-run cleanup candidates; it never deletes runtime or Claude artifacts.
- Add a zero-model-cost release smoke that exercises the installed snapshot as a fresh host load would: Plugin/skill discovery, stdio MCP startup, tool listing, and `list_agents` with isolated trusted task metadata.
- Allow an explicit paid release-smoke extension using only Haiku 4.5 with low effort; the default smoke never launches a Claude model.
- Make `package.json` the single manually maintained base-version source. Derive the MCP server version and refreshed Plugin manifest base from it, while keeping the cachebuster installation suffix.
- Replace raw dependency loader failures at both installed bootstraps with a concise checkout-specific `npm install` recovery message.
- Document and test the operator workflow. This change does not add an eighth model-facing tool or Skill.

Non-goals: automatic runtime cleanup, Claude history deletion, model-side archive/delete, forced wait after spawn, persistent MCP-owned Agent state, or waking a completed Codex turn.

## Capabilities

### New Capabilities

- `runtime-operations-diagnostics`: Redacted operator health and storage diagnostics without lifecycle mutation.
- `plugin-release-readiness`: Zero-model-cost installed Plugin acceptance plus an explicit Haiku/low paid extension.

### Modified Capabilities

- `local-runtime-boundary`: Require actionable bootstrap dependency failures and base-version derivation from the checkout package.
- `claude-version-compatibility`: Reuse the zero-model-cost compatibility probe in operator diagnostics without changing Agent admission.
- `durable-runtime-state`: Define read-only inventory and conservative cleanup-candidate boundaries without deleting state.

## Impact

The change affects package scripts, Plugin bootstraps, MCP metadata, local install/version helpers, operator diagnostics, release-smoke scripts, runtime tests, documentation, and the existing Linux-only local Plugin refresh workflow. It adds no production dependency and does not change the seven public Agent operations.

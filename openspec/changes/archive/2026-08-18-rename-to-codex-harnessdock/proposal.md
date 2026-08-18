## Why

The current public identity, `CC for Pein`, describes one Claude Code integration and one private user, while the accepted product direction is a Codex-originated control plane for multiple Agent Harnesses. The identity must change before the multi-Harness public generation so later APIs, Skills, receipts, and documentation are built on one durable neutral name.

## What Changes

- **BREAKING (public Plugin identity):** rename the displayed product to **HarnessDock for Codex**, the Plugin/Skill slug to `codex-harnessdock`, the MCP server namespace to `codex_harnessdock`, and the runtime package/bin identity to `codex-harnessdock-runtime`.
- Preserve the current seven Claude Code operations and their behavior during this phase; only their model-visible Skill and MCP prefixes change.
- Make the public metadata third-party and Codex-oriented: identify Pein2017 by public handle/link, remove private email from distributable metadata, retain Apache-2.0, and state that the Plugin is unofficial and not endorsed by OpenAI.
- Prepare one local atomic cutover, but permit it to be deferred while dependent Phase A/B candidate code is implemented. At the consolidated final activation: drain active Agents, back up state, refresh only the final accepted identity/generation, start a fresh Codex task, prove the then-current operation catalog plus the specified legacy-Claude and OpenCode witnesses, and verify the old MCP server is absent.
- Keep one canonical runtime and one durable state lineage. Do not run old and new MCP servers concurrently or copy/migrate Agent state into a second store.
- Retain the canonical production checkout path in this phase while allowing development to continue in `/data/CoordExp/codex-harnessdock-dev`. A later, separately reviewed production-source/deployment rename occurs only after the neutral control plane and OpenCode Driver are accepted and before a third Harness is added.

Explicit non-goals:

- No Harness-neutral Driver refactor, OpenCode/DeepSeek/Grok Driver, eighth tool, public route arguments, v3 Agent creation, automatic routing, Agent behavior change, or provider/model call.
- No long-lived compatibility alias, dual Plugin registration, two MCP servers, historical OpenSpec/CHANGELOG/receipt rewrite, GitHub repository rename, physical checkout move, publish, push, or public release.
- No claim that renaming changes security, lifecycle ownership, or Claude Code capability.

Lifecycle ordering: implement and candidate-accept this change first using exact checkout-level tests and review. Then implement/candidate-accept `generalize-multi-harness-agent-control-plane`, then `add-opencode-explorer-driver`; these may proceed sequentially in one task/worktree. Installed cutover and fresh loaded-Plugin acceptance are deferred until the final Phase B candidate is ready, so the operator performs one release transition rather than installing the intermediate seven-operation generation. The later physical production-source/deployment rename is an independent change after those two phases, not part of this cutover; using `/data/CoordExp/codex-harnessdock-dev` as the successor development worktree is allowed now. Before implementation freezes its tree, re-run `openspec list` and rebase its copied requirements/affected public files against any accepted or archived overlapping change; current known overlaps are `add-targeted-barrier-agent-join`, `expose-actionable-agent-blocking`, `improve-agent-card-and-usage-receipts`, `replace-wait-polling-with-event-wakeup`, and `harden-native-background-task-completion`.

## Capabilities

### New Capabilities

- `plugin-identity-transition`: define the canonical HarnessDock for Codex identity, single-runtime cutover, provenance/disclaimer metadata, rollback, and live discovery witness.

### Modified Capabilities

- `canonical-agent-orchestration`: rename the seven model-facing Skill prefixes while preserving their operations and behavior.
- `typed-mcp-orchestration`: rename the one typed MCP server namespace while preserving its seven-tool schema and lifecycle ownership.
- `plugin-release-readiness`: make zero-cost and live acceptance verify the new identity and reject concurrent old/new discovery.
- `local-runtime-boundary`: identify the renamed Plugin while deliberately retaining the current canonical checkout path until the later physical rename.
- `operator-usage-ledger`: count new `codex_harnessdock` events while retaining bounded pre-cutover `cc_for_pein` history without accepting post-cutover legacy traffic.

## Impact

Affected surfaces include `package.json` and lock metadata, Plugin/marketplace manifests, `plugins/cc-for-pein/` directory and bootstrap names, seven Skill directories and discovery metadata, MCP server metadata and generation guards, release/doctor/refresh/install scripts, documentation/assets/tests, and local installed Plugin records. `runtime/index.mjs` remains the sole lifecycle interface and Agent/job/mailbox/session stores remain the same logical state owners.

# CC for Pein: local Claude Code runtime for Codex

This repository is a checkout-owned Codex Plugin. It uses the host `claude`
CLI in headless stream-json mode and owns only the orchestration layer:

- durable background jobs and stable job IDs;
- live steering with an ordered persisted mailbox;
- SIGINT interruption versus destructive cancellation;
- bounded exact-session recovery after transport closure;
- exact-session follow-up;
- runtime receipts for the Claude binary, config, proxy, hooks, MCP, attempts,
  and partial output.

The runtime has no source or runtime dependency on the Sendbird repository or
its installer. When installed, Codex necessarily caches the plugin descriptors
and a small bootstrap, but that bootstrap fails closed unless it can delegate
to `CC_RUNTIME_CHECKOUT`; executable runtime source is never loaded from the
versioned Cache. The host Claude Code CLI remains an intentional dependency
because it owns authentication, sessions, memory, hooks, plugins, skills, MCP
configuration, and tool execution.

## Architecture

`runtime/index.mjs` is the only public lifecycle interface:

```text
start(task) -> jobId
steer(jobId, message)
interrupt(jobId)
cancel(jobId)
status(jobId?)
result(jobId?)
followUp(jobId, message) -> jobId
```

Internally, `claude-headless-adapter.mjs` owns the Claude CLI protocol,
`job-supervisor.mjs` owns one logical job across reconnect attempts,
`job-store.mjs` owns atomic state and the mailbox, and
`execution-profile.mjs` owns every CLI override.

## Execution profiles

`safe` is the default. It adds a local sandbox, explicit permission policy,
and safe model/effort defaults. Read-only safe tasks use a narrow tool list.

`terminal-parity` adds only headless transport and lifecycle flags. It does
not override model, effort, settings, permissions, tools, MCP configuration,
or system prompts unless the caller explicitly supplies an override. With the
same canonical cwd and environment, Claude therefore loads the same user and
project configuration as a direct Terminal session.

```bash
node runtime/cli.mjs start --profile terminal-parity --write \
  "inspect the current workspace and report which Claude integrations are active"
```

TTY-only interaction is not reproduced. Session handoff must be sequential:
the runtime enforces one active owner for each
`CLAUDE_CONFIG_DIR + Claude session ID` across workspaces. A direct Terminal
process cannot participate in this lease, so Terminal-to-plugin handoff still
requires the user to stop one owner before starting the other.

Interactive Terminal permission prompts are also TTY-only. In
`terminal-parity`, the runtime leaves permission behavior untouched by
default; a headless request that would have prompted may therefore be denied.
Use shared Claude settings for durable allow rules, or pass an explicit
`--permission-mode auto` / `--allowed-tools ...` override when that is the
intended non-interactive policy. The receipt records every such override.

For an explicitly unrestricted native launch equivalent to
`IS_SANDBOX=1 claude --dangerously-skip-permissions`, use:

```bash
node runtime/cli.mjs start --profile terminal-parity --write \
  --dangerously-skip-permissions "task"
```

This flag is never implicit, cannot be combined with `safe` or
`--permission-mode`, and is recorded in the runtime receipt.

Native Windows supports deterministic process identity and destructive
process-tree cancellation. A detached Windows process cannot receive a
portable graceful SIGINT, so `$cc-for-pein:interrupt` fails honestly there and asks the
caller to choose explicit cancellation instead.

## Environment

The runtime selects one env file in this order:

1. `--env-file <path>` or `CC_RUNTIME_ENV_FILE`;
2. `${CODEX_HOME}/.env`;
3. the nearest ancestor `.codex/.env` from the workspace;
4. `config/runtime.env` in this checkout.

The selected file is parsed as literal `KEY=VALUE`; it is never executed as a
shell script. Its values overlay the inherited environment, so `CONDA_EXE`,
`PATH`, `CLAUDE_CONFIG_DIR`, proxy variables, and other valid variables reach
the Claude worker together. Receipts expose only selected non-secret fields
and redact proxy credentials.

This checkout's project-local source is `/data/CoordExp/.codex/.env`. It sets
`CLAUDE_CONFIG_DIR=/data/CoordExp/.claude`, both lower- and upper-case proxy
variables for `http://127.0.0.1:9090`, localhost bypasses, and the existing
Conda environment values. It also pins `CC_CLAUDE_BIN` to the same Claude
2.1.220 executable currently selected by Terminal and declares
`CC_RUNTIME_CHECKOUT=/data/CoordExp/.worktrees/cc-plugin-codex`. Terminal can
use the same file:

```bash
set -a
. /data/CoordExp/.codex/.env
set +a
claude
```

## Commands

```text
$cc-for-pein:run [--profile safe|terminal-parity] [--write] [--dangerously-skip-permissions] [--wait] <task>
$cc-for-pein:steer <job-id> <message>
$cc-for-pein:steer --follow-up <job-id> <message>
$cc-for-pein:interrupt <job-id>
$cc-for-pein:cancel <job-id>
$cc-for-pein:status [job-id] [--wait] [--all]
$cc-for-pein:result [job-id]
```

The corresponding checkout CLI is `node runtime/cli.mjs --help`.

## Local development

Run directly from this checkout:

```bash
npm ci
npm run check
node runtime/cli.mjs readiness --json
```

The repo-local marketplace manifest is `.agents/plugins/marketplace.json` and
points to the intentionally minimal `plugins/cc-for-pein/` subtree. An eventual Codex
snapshot therefore contains only the manifest, six skills, and bootstrap.
Every skill calls `plugins/cc-for-pein/bootstrap/cc-runtime.mjs`, which validates
`CC_RUNTIME_CHECKOUT` and delegates there. Install the local marketplace entry
only after development checks and real smokes pass, then restart Codex so the
updated skill snapshot is loaded.

## Provenance

The resilient runtime began from behavior proven while evaluating the
Apache-2.0 Sendbird plugin. This repository keeps the applicable LICENSE and
NOTICE. Current public architecture, lifecycle API, environment contract, and
runtime source are locally owned; old upstream surfaces are retained only
under `legacy-upstream/` or as unreferenced migration residue until the user
performs the final physical cleanup.

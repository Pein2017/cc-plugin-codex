# CC for Pein: durable Claude Agents for Codex

CC for Pein is a checkout-owned Codex Plugin that runs the host `claude` CLI
in headless stream-json mode. It owns durable orchestration only; Claude Code
continues to own authentication, project configuration, memory, hooks,
plugins, skills, MCP configuration, sessions, and tool execution.

Version 0.2 makes a named Agent—not an internal job ID—the public object. A
Claude turn is temporary. An Agent has a stable root-scoped identity, a native
Claude session pointer when safe, a durable message queue, and nonresident
history after its worker exits.

The runtime has no source or runtime dependency on Sendbird, upstream
installers, Codex forwarding hooks, or a versioned plugin Cache. Codex caches a
minimal descriptor/bootstrap for discovery, but that bootstrap fails closed
unless it delegates to `CC_RUNTIME_CHECKOUT`. Executable runtime source always
comes from this checkout.

The supported platform is Linux with Node.js 20.19 or newer. Any surviving
macOS or native Windows defensive branches are best-effort only and are not a
compatibility or release guarantee.

## Public lifecycle

`runtime/index.mjs` is the only model-facing lifecycle interface. Its complete
v0.2 surface is:

```text
spawn_agent({ task_name, message, fork_turns: "none", description?, model?, reasoning_effort?, execution_profile? })
send_message({ target, message })
followup_task({ target, message })
wait_agent({ timeout_ms?, acknowledge_tokens? })
interrupt_agent({ target })
list_agents({ path_prefix? })
```

The installed plugin exposes the same six operations as namespaced skills:

```text
$cc-for-pein:spawn-agent
$cc-for-pein:send-message
$cc-for-pein:followup-task
$cc-for-pein:wait-agent
$cc-for-pein:interrupt-agent
$cc-for-pein:list-agents
```

Plugin skills necessarily remain namespaced; they are not literal replacement
registrations for Codex built-in tools. Each invokes only
`plugins/cc-for-pein/bootstrap/cc-runtime.mjs`, which delegates to the
checkout-owned matching snake_case command.

## Agent model and V2 alignment

An Agent belongs to the logical Codex root that created it. Its path is flat:
`/root/<task_name>`. Names are unique within that root. Mutating operations
accept only an exact Agent ID, full path, or normalized name; prefixes are
valid only for `list_agents(path_prefix)`.

This is a logical default-isolation boundary against accidental cross-root
orchestration, not a cryptographic authorization mechanism. Normal plugin
operations never accept an owner/root override. A redacted `--all` diagnosis is
reserved for a separate operator CLI and cannot message, follow up, interrupt,
wait on, or acknowledge foreign Agents.

The public names and core semantics align with Codex Multi-Agent V2 where the
native Claude process permits it:

| Surface | Codex Multi-Agent V2 | CC for Pein v0.2 |
| --- | --- | --- |
| Operations | Six built-in snake_case tools | Same six runtime names, exposed as namespaced hyphenated skills |
| Spawn | `task_name`, `message`, `fork_turns` | Same core fields; only `fork_turns=none` is supported because Codex context cannot safely become Claude history |
| Targeting | Agent tree | Flat `/root/<task_name>` topology; exact mutation target |
| Send / follow-up | Message versus activation distinction | `send_message` queues an idle Agent; `followup_task` guarantees delivery or activation |
| Wait | Untargeted mailbox | Untargeted root completion inbox with durable acknowledgement tokens |
| Residency | Runtime can unload and reload | Each Claude turn exits; logical terminal Agent history remains listed and can be resumed when its receipt proves it safe |

`list_agents` intentionally includes logical nonresident terminal history.
`wait_agent` is also intentionally narrower than a host-agent mailbox: it
wakes for the current root's durable Agent activity, not arbitrary Codex
inter-agent messages or a new user steer.

`fork_turns=all`, positive fork counts, `agent_type`, Codex service-tier
routing, and Claude session adoption fail explicitly rather than being ignored
or injected into a prompt. Direct Terminal-session adoption is deferred to a
future OpenSpec change.

There is no public `cancel`, `cancel_job`, archive, close, delete-history, or
Agent deletion operation. `interrupt_agent` stops only the current turn. A
successful graceful interruption retains exact-session continuation when the
receipt proves it; forced termination without flush evidence becomes an
errored, non-resumable turn while preserving the Agent record.

## Durable delivery and continuation

`send_message` records a durable Agent-mailbox entry. It delivers to an active
turn when possible. For an idle resumable Agent it returns `queued_no_turn` and
does not start a Claude process. `followup_task` uses the same mailbox but
guarantees work: it delivers to an active turn, or starts one exact-session or
receipt-proven safe-fresh turn and assigns queued entries in order.

`wait_agent` reads the current root's durable completion mailbox. It may first
acknowledge valid oldest-contiguous tokens returned by a previous wait, then
returns the oldest unread activity. New activity remains unread until a later
call echoes its tokens, so a lost host response safely redelivers. Repeated
`list_agents` calls are read-only and preserve unread completion summaries.

Job receipts are bounded internal execution evidence. Agent identity, session
binding, mailbox entries, and completion projection survive worker exit and
job pruning. The terminal job receipt is the reconciliation fact source; the
registry and inbox are rebuildable projections.

## Execution profiles

`safe` is the default. It supplies the runtime's explicit sandbox and
permission policy. `terminal-parity` adds only headless transport and lifecycle
flags: it does not implicitly override model, effort, settings, permissions,
tools, MCP configuration, or system prompts. Given the same canonical working
directory and environment, it loads the same Claude configuration as a direct
Terminal session.

For explicitly unrestricted native authority, a caller may request
`terminal-parity` plus `--dangerously-skip-permissions`. The runtime sets
`IS_SANDBOX=1` for that Claude child and records the explicit override; it is
never inferred by the plugin.

## Environment

The runtime resolves exactly one env file in this order:

1. `--env-file <path>` or `CC_RUNTIME_ENV_FILE`;
2. `${CODEX_HOME}/.env`;
3. the nearest ancestor `.codex/.env` from the workspace;
4. `config/runtime.env` in this checkout.

Files are parsed as literal `KEY=VALUE`, never evaluated as shell code. Valid
values such as `CONDA_EXE`, `PATH`, `CLAUDE_CONFIG_DIR`, lower- and upper-case
proxy variables, and localhost bypasses reach the Claude child together.
Receipts expose only selected non-secret fields and redact proxy credentials.

This checkout's project configuration is `/data/CoordExp/.codex/.env`. It
selects `/data/CoordExp/.claude`, the local 9090 proxy, the existing Conda
environment, Claude binary, and this checkout through `CC_RUNTIME_CHECKOUT`.

## Migration from 0.1

No compatibility aliases remain. Migrate calls by addressing the stable Agent,
not an internal job ID:

| Removed v0.1 surface | v0.2 canonical replacement |
| --- | --- |
| `run` / `start` | `spawn_agent` with `task_name`, `message`, and `fork_turns=none` |
| `steer <job>` | `send_message <target> <message>` |
| `steer --follow-up <job>` / `followUp` | `followup_task <target> <message>` |
| `status` / `result` | `list_agents` and untargeted `wait_agent` |
| `interrupt <job>` | `interrupt_agent <target>` |
| `cancel` | Removed; use `interrupt_agent` for graceful stop semantics |

## Local development and installation

Run from this checkout:

```bash
npm ci
npm run check
node runtime/cli.mjs readiness --json
npm run install:local
```

The repository-local marketplace is `.agents/plugins/marketplace.json`; its
plugin source is the intentionally small `plugins/cc-for-pein/` subtree.
`npm run install:local` removes any prior `pein-local` snapshot, repoints that
marketplace to this checkout, and installs the current plugin through Codex's
own plugin manager. Restart or reload Codex afterward. Verify the installed
snapshot has exactly the six v0.2 skills and every one delegates only to
`CC_RUNTIME_CHECKOUT`.

## Provenance

The initial runtime ideas were evaluated against the Apache-2.0 Sendbird
plugin. Current public architecture, lifecycle, environment contract, and
runtime source are locally owned. Historical upstream material is reference
only and is not an active compatibility contract.

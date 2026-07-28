## Context

The Plugin currently uses seven Experimental skills as both orchestration guidance and shell-command adapters. Each skill launches a short checkout bootstrap that delegates to `runtime/cli.mjs`; the durable runtime then owns root isolation, Agent records, job supervision, mailboxes, completion delivery, Claude session binding, and detached workers. This is behaviorally sound, but model calls carry paths, shell quoting, and terminal transport details that Codex can represent as typed Plugin MCP tools.

Codex 0.145.0 starts stdio MCP servers declared by selected plugins, attaches `_meta.threadId` to tool calls, and attaches `_meta["codex/sandbox-state-meta"].sandboxCwd` when the server advertises that experimental capability. MCP calls themselves are synchronous request/response operations; they do not receive Unified Exec terminal session IDs. The CC worker lifecycle is already asynchronous where appropriate, so MCP must adapt the existing API rather than add another background abstraction.

## Goals / Non-Goals

**Goals:**

- Expose the seven canonical operations through short, typed MCP calls.
- Preserve `runtime/index.mjs` as the sole public lifecycle owner and keep all durable state in the existing stores.
- Bind every call to the exact Codex root thread and turn workspace supplied by trusted host metadata.
- Preserve asynchronous Agent activation and explicit bounded join semantics.
- Keep installed Plugin Cache code descriptor-only and execute the MCP implementation from the canonical checkout.
- Make cancellation of an in-flight wait stop only the observation, never the Agent.

**Non-Goals:**

- No generic background terminal, MCP job registry, second Agent supervisor, or second session identifier.
- No automatic Codex parent wake-up after its turn ends.
- No public `cancel`, delete, archive, cross-root `--all`, cwd, environment-file, owner-root, or Claude-session selector.
- No removal of the checkout CLI; it remains an explicit operator/debug surface rather than the normal model-facing path.
- No change to Claude worker, mailbox, retention, completion, reconnect, or model-routing semantics.

## Decisions

### 1. Use one thin stdio MCP adapter over `runtime/index.mjs`

`runtime/mcp-server.mjs` will register exactly seven tools and instantiate `createClaudeRuntime` per call using trusted call context. It will not retain Agents, jobs, workspace registries, or Claude session mappings in memory. This keeps restart and recovery semantics identical to the CLI path.

Alternative considered: implement MCP-native jobs and sessions. Rejected because it duplicates the proven durable runtime and creates conflicting ownership after MCP server restart.

### 2. Pin the official JavaScript MCP SDK

The checkout will pin `@modelcontextprotocol/sdk` and its direct `zod` schema dependency in `package-lock.json`. The SDK owns stdio framing, initialization, tool schemas, cancellation signals, and protocol compatibility; project code owns only CC context validation and lifecycle delegation.

Alternative considered: hand-code JSON-RPC framing. Rejected because fewer dependency lines would trade away protocol correctness and compatibility testing.

### 3. Require Codex metadata and fail closed

The server advertises `codex/sandbox-state-meta`. Every lifecycle call requires a non-empty `_meta.threadId` and a local `file:` `sandboxCwd`. The URI is converted to a native path and canonicalized by the existing runtime. Per-call environment construction overwrites `CODEX_THREAD_ID` and `CC_TRUSTED_OWNER_ROOT_ID` with the trusted metadata value; tool arguments cannot supply any context selector.

Alternative considered: fall back to MCP process cwd or inherited thread variables. Rejected because the process cwd is the installed Plugin root and a long-lived MCP server may handle calls from different Codex roots.

### 4. Preserve Codex Multi-Agent V2-style scheduling

`spawn_agent` returns after the existing durable detached-worker handoff. `send_message`, `followup_task`, and `interrupt_agent` preserve their current activation semantics. The parent does useful independent work before calling `wait_agent`; `wait_agent` is a synchronous bounded join, defaults to ten minutes, and returns early for eligible progress or completion. MCP request cancellation terminates only that wait observation through an abort signal.

Alternative considered: launch `wait_agent` inside a Codex background terminal. Rejected because this would add a Unified Exec session ID beside the durable CC Agent ID without improving Agent lifetime or recovery.

### 5. Keep the Plugin Cache descriptor-only

`plugins/cc-for-pein/.mcp.json` starts `plugins/cc-for-pein/bootstrap/cc-mcp.mjs`. That bootstrap validates `/data/CoordExp/cc-plugin-codex`, loads the fixed `config/runtime.env` as dotenv data, then starts the checkout's `runtime/mcp-server.mjs` over inherited stdio. No executable runtime module is imported from the versioned Cache snapshot.

The checkout remains the source of truth, but an already-running MCP process
does not hot-reload its module graph. Runtime edits need no uninstall or Plugin
refresh; a new Codex task (or explicit server restart) loads them. Discovery
file changes still require the atomic cachebuster refresh and a new task.

### 6. Give MCP waits an outer timeout margin

The Plugin MCP server config sets `tool_timeout_sec` to 3660 seconds. This exceeds the public runtime maximum wait of 3600 seconds by one minute, so the inner CC timeout can return its honest receipt before Codex cancels the transport. The timeout remains a tool-call bound, not Agent execution lifetime.

### 7. Skills become orchestration guidance

All seven skills name the matching `mcp__cc_for_pein__<operation>` tool and its typed arguments. They retain model selection, join obligations, privacy, concise presentation, and recovery guidance. They do not silently fall back to shell commands when the MCP server is unavailable; that is an actionable Plugin discovery/startup failure. The CLI remains documented for operator diagnostics.

## Risks / Trade-offs

- [Codex omits required metadata] → Advertise sandbox-state capability and fail with an actionable compatibility error instead of binding to the Cache directory or a foreign root.
- [MCP SDK or Claude CLI updates drift] → Pin dependencies, retain the Claude compatibility gate, and test initialize/list/call/cancel through a real stdio protocol client fixture.
- [A cancelled wait continues polling] → Thread the SDK abort signal into the existing wait loop and check it before and after each bounded sleep.
- [Concurrent MCP calls race on one Agent] → Advertise parallel calls only because existing file locks, activation reservations, idempotency keys, and tests already serialize durable mutations.
- [Tool result is too verbose] → Return structured receipts for model reasoning while preserving skill-level concise presentation rules; do not add a second lossy result projection.
- [New MCP startup breaks discovery] → Keep the CLI and runtime unchanged for rollback, validate the Plugin package, and require a new Codex task for acceptance.

## Migration Plan

1. Add the SDK dependency, checkout MCP server, cache-safe bootstrap, Plugin config, and contract tests.
2. Update skill guidance and documentation while preserving the CLI.
3. Run focused MCP protocol tests, the complete runtime suite, strict OpenSpec validation, and Plugin validation.
4. Refresh `cc-for-pein@pein-local` through the existing cachebuster flow using the fixed proxy environment.
5. Start a new Codex task and verify tool discovery before any real Haiku smoke; stop real CC testing if the subscription limit is reported.

Rollback removes the MCP manifest entry/config/bootstrap and refreshes the Plugin. Existing Agent, job, mailbox, and Claude session artifacts require no migration or deletion.

## Open Questions

None. The user approved typed MCP calls with asynchronous spawn and explicit synchronous wait semantics; background-terminal emulation is explicitly excluded.

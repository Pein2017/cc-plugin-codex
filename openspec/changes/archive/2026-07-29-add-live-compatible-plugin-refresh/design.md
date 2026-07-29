## Context

Codex resolves Plugin-relative MCP working directories to the installed version directory and caches Skill/tool discovery for the life of a task. Its Plugin installer also removes older version directories after installing a new version. Separately, the current checkout-owned MCP process statically imports `runtime/index.mjs`, so that process keeps one Node ESM graph even though all durable Agent/session state already lives outside MCP.

This creates two independent failure modes: a release can make an older task's resolved Cache path disappear, and a compatible lifecycle fix cannot reach an existing MCP process. The checkout must remain the sole source/runtime owner; the Cache may retain only host discovery material.

## Goals / Non-Goals

**Goals:**

- Let compatible changes behind `runtime/index.mjs` take effect on the next MCP call in an existing Codex task.
- Keep MCP stateless and preserve the existing durable lifecycle owner.
- Prevent routine checkout development from churning Plugin versions.
- Fail explicitly when a stale task schema cannot safely call the current checkout generation.
- Keep a small recent discovery shell so version refresh does not turn an older task into `ENOENT`.

**Non-Goals:**

- Reload already-discovered Skills, MCP schemas, annotations, or tool names inside an existing Codex task.
- Make old schemas forward-compatible with arbitrary public API changes.
- Add another registry, resident Agent process, generic command, or runtime source under the Cache.
- Guarantee resurrection of versions deleted before this mechanism existed.

## Decisions

### 1. New descriptors launch an absolute checkout bootstrap

`.mcp.json` will use the canonical checkout bootstrap and working directory as absolute paths. This removes the installed version directory from the process-launch chain for tasks created after this change. The installed bootstrap remains present only for older descriptors and discovery-shell compatibility.

Using a relative Cache bootstrap was rejected because Codex materializes it into a version-specific absolute working directory. A symlink from the Cache to the checkout was rejected because it makes cache layout part of the runtime contract.

### 2. Every production MCP operation gets a fresh worker module graph

The long-lived MCP protocol server will validate trusted Codex metadata and the static tool schema, then invoke the matching `runtime/index.mjs` operation in a fresh Node worker. Worker isolation gives every call a new ESM cache, including transitive imports, while durable state remains owned by the existing runtime files and stores. Test-only injected runtime factories may remain in-process.

Dynamic import query strings were rejected because transitive modules can remain cached. Restarting the whole stdio server per call was rejected because Codex owns the transport process and protocol lifecycle.

Cancellation is forwarded to the worker's `AbortController`; terminating a cancelled observation must not interrupt the Agent turn.

### 3. One integer API generation separates compatible and incompatible edits

The MCP process captures the API generation at startup. Each fresh worker reports the current checkout generation before invoking the lifecycle operation. A mismatch returns `CC_MCP_RESTART_REQUIRED` with a new-task instruction and performs no runtime operation.

The generation changes only when the public tool contract or adapter/runtime call contract becomes incompatible. Ordinary runtime fixes keep the generation and hot-load on the next call. Semver alone was rejected because package releases can contain compatible implementation changes and build metadata is a discovery concern.

### 4. Development refresh and release refresh are separate

- Runtime-only compatible edit: no install command.
- Same-generation Skill/discovery edit: `npm run refresh:local` reinstalls the same manifest version; existing tasks still keep their already-loaded discovery snapshot, so acceptance uses a new task when those files matter.
- Public schema/Skill generation or base release change: `npm run release:local` updates one cachebuster, installs the new snapshot, and requires a new task.

This keeps the common path small while retaining an explicit release boundary.

### 5. Preserve at most two recent non-current discovery snapshots

Before installation, the local installer copies up to two most-recent existing version directories to a temporary location. After Codex completes or fails installation cleanup, it restores those directories at the same paths if absent. These directories contain only Plugin discovery files, Skills, and descriptor bootstraps; executable lifecycle code still resolves to the canonical checkout.

Two versions bound accumulation without adding archive/delete APIs or a background cleanup service. Older-than-two tasks may require a new Codex task. A future operator diagnostic may expose this state, but it is not a model-facing lifecycle concept.

## Risks / Trade-offs

- **Worker startup adds latency to every MCP call.** -> Keep the worker payload minimal and measure focused tests; Claude/process work dominates activation latency.
- **A runtime edit may accidentally be incompatible without increasing the API generation.** -> Contract tests cover the worker seam and release guidance requires changing the generation with public schema/call-contract changes.
- **A task can retain stale Skill text even while runtime logic is fresh.** -> Document the boundary and return `CC_MCP_RESTART_REQUIRED` for incompatible generations; do not claim Skill hot reload.
- **Restored discovery snapshots consume bounded disk space.** -> Retain only two non-current snapshots and no runtime/node_modules copy outside the Plugin's existing small discovery tree.
- **A process can be cancelled during a worker call.** -> Forward cooperative abort and limit forced worker termination to the observation boundary, leaving detached Claude turns and durable state intact.

## Migration Plan

1. Add the API generation owner, isolated worker, and tests without changing the seven public tools.
2. Switch the descriptor to the canonical absolute bootstrap.
3. Split refresh/release scripts and add bounded snapshot preservation.
4. Bump the package release, refresh the local installation, and run zero-model-cost release smoke.
5. Rehydrate the one known recent deleted discovery path as a best-effort compatibility shell, then verify an old path can start the canonical bootstrap.

Rollback is a Git revert plus a versioned local release refresh. Durable Agent/session state is unchanged by this migration.

## Open Questions

None. The user approved compatible hot reload, explicit restart on incompatibility, and a bounded discovery-only compatibility shell.

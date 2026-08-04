## Context

The live Plugin bootstrap is fixed to `/data/CoordExp/cc-plugin-codex`, and the long-lived MCP adapter invokes `runtime/index.mjs` in a fresh Worker for every accepted operation. That makes compatible implementation changes visible on the next call, but editing the live checkout directly exposes incomplete files to active tasks. Git branches alone do not isolate this risk when one physical checkout is switched between them.

The new `developer` branch is therefore checked out at `/data/CoordExp/cc-plugin-codex-dev`; `main` remains checked out at the canonical live path. Both are worktrees of the same independent repository, while only `main` is executable runtime source.

## Goals / Non-Goals

**Goals:**

- Make `developer` the persistent implementation/test track and `main` the stable live track.
- Promote only clean, tested, fast-forwardable commits.
- Tell the operator whether the promoted diff hot-loads or requires Plugin refresh and a new Codex task.
- Prevent a fresh MCP Worker from importing the live module graph while Git is updating `main`.
- Keep the current seven-tool MCP contract and durable Agent state unchanged.

**Non-Goals:**

- General CI/CD, remote pushes, automatic commits, or branch protection.
- Making the development worktree executable.
- Hot-reloading MCP schemas, Skills, environment, dependencies, or the long-lived MCP server.
- Merging divergent histories or automatically resolving dirty worktrees.
- Interrupting already-started MCP calls or Claude turns during promotion.

## Decisions

### 1. Use sibling worktrees with fixed roles

`/data/CoordExp/cc-plugin-codex-dev` SHALL remain on `developer`; `/data/CoordExp/cc-plugin-codex` SHALL remain on `main`. The promotion command runs from the development checkout but invokes Git against both exact paths. A nested `.worktrees/dev` layout was rejected because repository-local recursive search, backup, cleanup, and path ownership become easier to confuse.

The developer checkout is a source authoring surface only. Existing bootstraps continue to reject it as runtime source.

### 2. Promotion is clean and fast-forward-only

The command validates exact repository identity, branch names, shared Git common directory, clean status in both worktrees, and that `developer` is a descendant of `main`. It runs `npm run check` in the developer checkout before acquiring the short promotion gate. It then runs `git merge --ff-only developer` in the main checkout. It does not commit, push, refresh, release, or restart Codex.

Automatic merge commits and cherry-pick-based synchronization were rejected because `main` should identify an already-tested developer commit exactly. An operator resolves divergence explicitly before retrying.

### 3. Classify from the exact promoted diff

The command compares the pre-promotion `main` commit with the `developer` commit. Changes to MCP schemas/server/generation, Plugin Skills or descriptors, bootstrap, fixed environment, package dependencies, or host instruction surfaces are `restart_required`. Compatible implementation modules behind the worker boundary and non-runtime project files are `hot_compatible`, provided the public MCP generation is unchanged.

Classification is deliberately conservative. Unknown Plugin discovery/configuration surfaces require restart. The receipt lists the decisive paths and tells the operator which existing command to run; the promotion command itself does not mutate the installed Plugin.

### 4. Gate only fresh runtime module loading

The MCP Worker uses a small filesystem gate under the canonical main checkout's Git metadata. Before importing `runtime/index.mjs`, it waits while a promotion lock exists, creates a unique loader marker, rechecks the lock, and only then imports. It removes the marker immediately after import. The MCP parent also owns fallback cleanup for that known marker when the Worker exits.

Promotion atomically creates the exclusive lock, waits for loader markers to drain, updates `main`, and removes the lock in `finally`. Already-imported Workers and Claude turns continue; only the short module-load boundary is serialized. This avoids blocking one-hour waits or Agent execution for the duration of promotion.

A simple lock-file check without loader markers was rejected because a Worker could pass the check immediately before promotion starts. Holding the gate for a whole MCP call was rejected because `wait_agent` may legitimately remain open for an hour.

### 5. First adoption is restart-required

This feature modifies the long-lived MCP server/Worker loader boundary. Its first promotion is therefore classified `restart_required`; after local refresh/release and a new Codex task, subsequent compatible runtime-only promotions can hot-load safely.

## Risks / Trade-offs

- **A crashed MCP process can leave a loader marker.** -> Markers contain the owning PID; promotion removes only markers whose process is provably absent and otherwise fails after a bounded wait.
- **Path classification cannot prove semantic compatibility.** -> `npm run check`, fast-forward provenance, the explicit MCP generation, and conservative static-path rules remain required; uncertain changes classify as restart-required.
- **Main and developer can diverge through direct main commits.** -> Promotion fails without modifying either checkout; the operator explicitly rebases or merges developer before retrying.
- **Existing calls keep old code.** -> This is intentional call-level consistency; the next call loads the promoted implementation.

## Migration Plan

1. Create the `developer` branch/worktree from current clean `main`.
2. Add promotion classification, the module-load gate, focused tests, package command, and operator documentation on `developer`.
3. Run the full acceptance suite and commit on `developer`.
4. Perform the first fast-forward promotion to `main`; because the loader/server boundary changed, run the normal local release/refresh and start a new Codex task.
5. Thereafter, use `developer` for implementation and `promote:local` for tested promotion. Runtime-only compatible promotions require no Plugin refresh.

Rollback is an explicit Git revert on `developer`, followed by another tested fast-forward promotion. Durable Agent/session state is not rewound.

## Open Questions

None.

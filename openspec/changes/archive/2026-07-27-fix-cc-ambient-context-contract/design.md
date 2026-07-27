## Context

The installed skill snapshot currently discovers an environment file and a runtime checkout from each invocation's arguments and ambient environment. The public runtime then separately accepts `--cwd`/`-C` and `--env-file`. This allows a model-facing call to override both the Agent registry workspace and the runtime/configuration source even though the Codex host already started the command in the intended checkout.

This is a personal Linux-only Plugin with one canonical source checkout (`/data/CoordExp/cc-plugin-codex`) and one canonical Claude envelope (`config/runtime.env`). Portability and multi-user configuration are not current requirements. Detached workers still need a serialized workspace path so they can reconstruct the same registry after the short-lived public launcher exits.

## Goals / Non-Goals

**Goals:**

- Establish one model-facing context authority: Codex's ambient process cwd.
- Establish one installed runtime/configuration authority: the canonical checkout and its tracked environment file.
- Fail visibly when a model tries to supply a removed context selector.
- Keep the checkout executable source hot while retaining normal Plugin refresh semantics for discovery/bootstrap assets.
- Keep private worker restart and read-only operator diagnostics operational.

**Non-Goals:**

- Generalizing installation paths, adding a user configuration UI, or supporting multiple CC runtime checkouts.
- Removing internal worker/operator cwd options.
- Changing Agent ownership, mailbox, completion, history, Claude permissions, or session semantics.
- Making the versioned Codex Plugin cache an executable runtime owner.

## Decisions

### 1. The installed bootstrap owns fixed source and environment constants

The bootstrap will validate `/data/CoordExp/cc-plugin-codex`, load only `/data/CoordExp/cc-plugin-codex/config/runtime.env`, overlay that file on the inherited host environment, and force `CC_RUNTIME_CHECKOUT`, `CC_RUNTIME_ENV_FILE`, and `CC_RUNTIME_SOURCE_ROOT` to those canonical values. It will no longer discover `.codex/.env` or trust ambient selector variables.

This intentionally trades portability for an auditable single-owner setup. Keeping a selectable `.codex/.env` was rejected because it preserves the exact ambiguity the change is meant to remove. Executing a cache-local runtime was rejected because cache refresh is a discovery mechanism, not source authority.

### 2. Public lifecycle commands inherit `process.cwd()` and reject selectors

All seven public commands will reject `--cwd`, `-C`, and `--env-file` before argument parsing. Their runtime options will therefore use `process.cwd()`. Each skill will require the parent Codex Agent to confirm that its command workdir is the intended checkout/worktree before invocation.

Silently ignoring the flags was rejected because a caller could believe it had selected a different workspace. Retaining one of the aliases was rejected because that would leave two equivalent context APIs.

### 3. Private reconstruction controls remain separate

The detached `worker` command retains `--cwd` because it is launched by the runtime itself after public context has already been canonicalized. The read-only operator CLI retains explicit `--cwd`/`--env-file` for diagnosis and is never referenced by Plugin skills. The generic environment resolver remains injectable for unit/integration fixtures and private operator/runtime construction; the installed bootstrap is the fixed Plugin boundary.

### 4. Fixed environment keys override ambient values

`config/runtime.env` will explicitly pin both `CLAUDE_NATIVE_CONFIG_DIR` and `CLAUDE_CONFIG_DIR`, the Claude executable, Conda executable, upper/lower proxy variables, and no-proxy values. Unrelated inherited host values such as `PATH`, Codex root identity, and runtime-state location remain available. Bootstrap-protected Codex root identity cannot be replaced by the tracked file.

## Risks / Trade-offs

- [Canonical checkout is moved] → Bootstrap fails closed with the expected fixed path; changing the path requires an intentional OpenSpec/code update and Plugin refresh.
- [A stale installed bootstrap remains cached] → `npm run refresh:local` advances one cachebuster and validates the installed snapshot; acceptance occurs in a new Codex task.
- [Internal worker flags are accidentally rejected] → Tests exercise public rejection separately from a detached-worker handoff regression.
- [Ambient proxy or Claude config differs from the Plugin contract] → The tracked fixed file overlays those protected values, and a bootstrap test supplies poison selectors to prove they are not selected.

## Migration Plan

1. Add public failure tests and bootstrap fixed-source/environment tests.
2. Replace bootstrap discovery with fixed validation and add public CLI rejection.
3. Update skills, README, and the stable spec.
4. Run focused tests and `npm run check`.
5. Archive/sync the OpenSpec change, refresh the local Plugin, and validate the installed snapshot.
6. Start a new Codex task before testing model-visible skill behavior.

Rollback is a Git revert plus `npm run refresh:local`; no Agent state migration is required.

## Open Questions

None. The user explicitly selected a codebase-specific fixed environment and Codex-owned cwd over compatibility with the previous selectors.

## Why

The model-facing `cc:*` route currently accepts per-call workspace and environment selectors even though Codex already owns the intended working directory and this personal Plugin has one fixed Claude environment. Those selectors create two competing context authorities and can silently route an Agent to the wrong registry or configuration.

## What Changes

- **BREAKING**: remove `--cwd`, `-C`, and `--env-file` from all seven model-facing lifecycle commands and reject them explicitly.
- Make the installed bootstrap delegate only to `/data/CoordExp/cc-plugin-codex` and load only that checkout's `config/runtime.env`; ambient `CC_RUNTIME_CHECKOUT`, `CC_RUNTIME_ENV_FILE`, `${CODEX_HOME}/.env`, and workspace `.codex/.env` no longer select the public runtime.
- Require each public lifecycle call to inherit the Codex host process working directory as its workspace context.
- Update every lifecycle skill to tell Codex to confirm the intended checkout/worktree before invoking the command and never synthesize context flags.
- Preserve explicit `--cwd` for the private detached worker and operator diagnostics; these are implementation/maintenance surfaces, not model-facing API.
- Preserve checkout-hot runtime execution and the local Plugin refresh boundary for skills, metadata, manifest, and bootstrap changes.
- Non-goals: changing Claude Agent ownership semantics, changing terminal-parity permissions, changing job/session persistence, or making the installed versioned Plugin cache an executable runtime source.

Lifecycle ordering: first update the stable boundary contract and public tests, then implement the bootstrap/CLI restriction, refresh the local Plugin snapshot, and require a new Codex task before model-visible acceptance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-runtime-boundary`: replace selectable public workspace/environment context with a fixed Plugin environment plus Codex ambient-cwd inheritance, while preserving private worker/operator context controls.

## Impact

Affected surfaces are `plugins/cc-for-pein/bootstrap/cc-runtime.mjs`, `runtime/cli.mjs`, the seven Plugin skills, `config/runtime.env`, README/runtime-boundary documentation, public CLI and Plugin contract tests, and local Plugin installation metadata. Existing callers that pass model-facing context selectors must instead launch the skill from the intended Codex working directory.

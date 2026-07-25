---
name: status
description: 'Show active or recent local Claude Code jobs in this workspace, or detailed status for a specific job id. Supports optional waiting, timeout, and all-owner views. Use for tracked-job inspection and progress checks, not result retrieval.'
---

# Claude Code Status

Use this skill when the user wants the current state of Claude Code jobs in this repository.

Resolve `<plugin-root>` as two directories above this `SKILL.md` file. Run:
`node "<plugin-root>/bootstrap/cc-runtime.mjs" status $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported arguments: `[job-id]`, `--wait`, `--timeout-ms <ms>`, `--all`, `--env-file <path>`

Output:
- Present the runtime stdout exactly as returned.
- Do not add extra prose or reformat it.
- By default, status overview is scoped to the current Codex session in this repository. `--all` widens that overview to all tracked jobs in the current repository workspace.

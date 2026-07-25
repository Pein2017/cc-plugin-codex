---
name: status
description: 'Show current-root Claude Code jobs and unread completions, or wait durably for a job or the next root completion. Use for tracked-job inspection, completion delivery, and bounded waiting.'
---

# Claude Code Status

Use this skill when the user wants the current state of Claude Code jobs in this repository.

Resolve `<plugin-root>` as two directories above this `SKILL.md` file. Run:
`node "<plugin-root>/bootstrap/cc-runtime.mjs" status $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported arguments: `[job-id]`, `--wait`, `--timeout-ms <ms>`, `--acknowledge-tokens <comma-separated-tokens>`, `--env-file <path>`

Output:
- Present the runtime stdout exactly as returned.
- Do not add extra prose or reformat it.
- Status and direct job lookup are always scoped to the current Codex root. Cross-root `--all` is intentionally absent from this model-facing skill.
- A wait may acknowledge tokens returned by an earlier call, but newly returned completion events remain unread until a later call echoes their tokens.

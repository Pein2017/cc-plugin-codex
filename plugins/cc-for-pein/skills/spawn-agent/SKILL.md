---
name: spawn-agent
description: 'Create a durable, root-scoped Claude Agent and start its first turn. Requires a task name, message, and fork_turns=none. Use when Claude Code should work as a named, follow-up-capable Agent rather than a one-shot job.'
---

# Spawn Claude Agent

Use this skill to create a named Agent in the current Codex root. Resolve
`<plugin-root>` as two directories above this `SKILL.md`, then run:

`node "<plugin-root>/bootstrap/cc-runtime.mjs" spawn_agent $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Canonical arguments are `--task-name <name>`, `--fork-turns none`, and a
message. Optional extensions are `--description <text>`, `--model <model>`,
`--reasoning-effort <level>`, and `--execution-profile safe|terminal-parity`.

- Require `fork_turns=none` explicitly. Context inheritance (`all` or a
  positive count) is unsupported and must fail rather than being put into a
  Claude prompt.
- Names resolve to a flat `/root/<task_name>` path and must be unique within
  the current logical Codex root.
- Never accept, infer, or adopt a Terminal Claude session; Terminal-session
  adoption is deferred to a future OpenSpec change.
- Present the runtime receipt exactly as returned.

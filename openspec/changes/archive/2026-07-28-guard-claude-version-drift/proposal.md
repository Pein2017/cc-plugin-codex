## Why

The host Claude Code CLI auto-updates independently from this checkout, so a new
binary can change flags or stream behavior between two turns of the same durable
Agent. The runtime currently records the version only after launch and cannot
distinguish a known compatible CLI surface from an unverified upgrade before it
creates durable work.

## What Changes

- Detect the configured Claude executable identity and version during readiness,
  and rerun a zero-model-cost `--help` compatibility check only when that identity
  changes.
- Persist the current static result plus the last statically compatible and last
  successfully exercised versions outside versioned source and plugin Cache.
- Block new Agent activation when the required CLI surface is missing, with an
  explicit diagnostic instead of attempting fallback or creating durable work.
- Mark a new statically compatible version as live-unverified until a normal
  user-requested turn succeeds. An operator may instead run an ordinary explicit
  Haiku/low Agent as the cheapest production-path smoke.
- Preserve cross-version exact-session continuation while recording the actual
  Claude Code version used by each successful turn.

Non-goals: pinning or downgrading Claude Code, accepting unknown model aliases,
automatically consuming subscription quota, or promising compatibility with
undocumented native transcript layouts.

## Capabilities

### New Capabilities

- `claude-version-compatibility`: Host CLI drift detection, static gating,
  persisted compatibility evidence, and successful-turn observation.

### Modified Capabilities

- `claude-session-execution`: Readiness and completed-turn receipts carry the
  compatibility evidence for the exact Claude Code version used.

## Impact

The change affects Claude availability/readiness, internal diagnostics, durable
plugin state, completed-turn receipts, runtime tests, documentation, and local
Plugin installation metadata. It keeps the model-facing Agent API unchanged and
retains the fixed executable configured by `config/runtime.env`.

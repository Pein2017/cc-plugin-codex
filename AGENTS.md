# Repository guidance

- This is a checkout-owned Node.js 20.19+ ESM Codex Plugin supported on Linux. Non-Linux branches are best-effort only and do not define release gates.
- `runtime/index.mjs` is the sole public lifecycle interface. Keep stream-json, process, persistence, recovery, and mailbox details behind it.
- `runtime/execution-profile.mjs` is the sole owner of Claude CLI overrides. `terminal-parity` must not acquire implicit model, effort, settings, permission, tool, MCP, or prompt overrides.
- Resolve one env file through `runtime/environment.mjs`; never evaluate it as shell code or leak arbitrary values in receipts.
- Do not add runtime or source dependencies on Sendbird, upstream installers, Codex hooks, forwarding subagents, or versioned plugin cache paths.
- Keep the six lifecycle skills under `plugins/cc-for-pein/skills/`, `runtime/`, package/manifest metadata, and `tests/runtime*` in sync. Old upstream material is not a compatibility contract.
- Run `npm run check` before merging.
- For releases, update `CHANGELOG.md` and keep `package.json` and `plugins/cc-for-pein/.codex-plugin/plugin.json` versions synchronized.

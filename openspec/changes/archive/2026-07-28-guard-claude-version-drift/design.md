## Context

Claude Code is an independently updated host dependency. The fixed Plugin
environment selects `/root/.nvm/versions/node/v22.22.0/bin/claude`, which is the
same current executable reached from `PATH`, but npm/native updates may replace
the target in place without changing that path. Readiness currently runs
`claude --version` and authentication checks, while the adapter records the
runtime-reported version only after a turn has started.

The guard must run before Agent or mailbox mutation, remain free of model calls,
work across detached worker handoff, and retain enough evidence to explain which
binary admitted a turn. It must not turn a fast-moving upstream version number
into a hardcoded allowlist.

## Goals / Non-Goals

**Goals:**

- Detect version, executable-target, or in-place binary replacement.
- Check the exact CLI flags and value vocabulary emitted by current profiles.
- Cache a static result until the executable fingerprint changes.
- Fail before a known-incompatible CLI can create a new Agent activation.
- Recheck the prepared fingerprint in the detached worker before Claude launch.
- Record successful production-path observation without adding a paid probe.

**Non-Goals:**

- Pinning, installing, downgrading, or automatically rolling back Claude Code.
- Claiming that `--help` proves stream-json schema compatibility.
- Automatically launching Haiku or any other model for compatibility testing.
- Stabilizing Claude's private transcript layout.
- Changing the model-facing Agent lifecycle surface.

## Decisions

### Fingerprint the configured executable, not only the version string

The fingerprint combines the canonical executable target, filesystem identity
and metadata, and normalized `claude --version` text. The fixed
`CC_CLAUDE_BIN` contract remains authoritative. This detects same-version
reinstalls and in-place replacements while preserving the user's fixed runtime
envelope. Using only semantic version was rejected because two binaries can
report the same version; switching production back to ambient `PATH` was
rejected because it would violate the existing fixed-environment contract.

### Persist compatibility in the locked workspace config

The existing workspace-scoped `config.json` gains a versioned
`claudeCliCompatibility` value with `current`, `lastStaticallyCompatible`, and
`lastSuccessfulTurn` evidence. Config read-modify-write becomes lock-protected
and remains atomic. A separate database or per-Agent copy was rejected as
unnecessary state duplication.

### Gate on advertised surface, not a Claude semver allowlist

For a new fingerprint the guard invokes only `--version` and `--help`, checks
the flags and value vocabulary the runtime actually emits, then samples the
fingerprint again. Missing surface, command failure, timeout, or mid-probe
identity drift is incompatible. New version numbers with the same surface are
accepted as `static_only`; this lets the user follow the frontier without repo
updates for every patch.

### Distinguish static compatibility from successful runtime observation

Static readiness is sufficient to launch but does not claim stream-schema
proof. A completed ordinary user-requested turn records `observed_working` for
the prepared fingerprint only when the runtime-reported version matches and a
post-turn resample confirms the complete fingerprint is unchanged. An explicit
Haiku/low `spawn_agent` remains the cheapest real smoke; no separate
compatibility command can accidentally spend quota.

### Bind preparation and launch to one fingerprint

The readiness receipt stored on the prepared job contains the compatible
fingerprint and executable. The detached worker reruns the zero-cost check. If
the fingerprint changed after preparation, it fails before spawning Claude even
when the replacement is also statically compatible; a subsequent activation
must prepare against the new evidence. The admitted absolute executable is
passed to the adapter so launch cannot perform a different late lookup.

Existing active Claude processes are not interrupted. Active-turn steering does
not require a new CLI check; idle follow-up activation does. A pre-Claude worker
race failure retains safe-fresh retry evidence and must not consume a queued
message as if Claude received it.

## Risks / Trade-offs

- [`--help` is not a protocol schema`] → Report `static_only` until a real turn
  succeeds and keep parser fail-safe behavior.
- [First use in each workspace performs extra local subprocesses] → Cache by
  fingerprint; unchanged readiness runs only the existing version/auth probes.
- [An update lands between final recheck and process creation] → Bind the
  absolute executable, record the runtime-reported version, resample the full
  fingerprint after the turn, and do not mark a mismatched result as observed
  working.
- [A compatibility check races across Codex roots] → Use the existing
  process-identity-aware lock and atomic config write inside each workspace.
- [A new Claude release changes help formatting only] → Match option tokens and
  required vocabulary rather than whole lines, and surface the bounded missing
  set for diagnosis.

## Migration Plan

No durable migration is required. Missing compatibility state is populated on
the next readiness check; existing config keys, Agents, jobs, and Claude
sessions remain unchanged. Rollback removes the guard code and leaves the
unknown config key harmless under the existing merge-based config reader.

## Open Questions

None. A future OpenSpec may add a richer operator doctor command if real update
incidents show that readiness plus an ordinary Haiku smoke is insufficient.

## Why

CC for Pein is a private local runtime for Pein's Linux Codex environment.
macOS and native Windows portability add support claims and release gates that
are not required by the product owner.

## What Changes

- Make Linux with Node.js 20.19+ the only supported runtime platform.
- Keep non-Linux branches as best-effort defensive code without compatibility
  or testing guarantees.
- Run CI only on Linux and remove native Windows acceptance requirements.

## Capabilities

### Modified Capabilities

- `local-runtime-boundary`: replace the cross-platform support promise with a
  Linux-only support boundary.
- `durable-runtime-state`: make owner-only POSIX storage the supported security
  contract and remove native Windows ACL acceptance scenarios.

## Impact

Documentation, repository guidance, CI, and stable OpenSpec authority become
consistent with the deployed Linux environment. Runtime behavior on other
platforms is explicitly unsupported.

## Context

The runtime is developed, installed, and exercised on Linux. Existing Windows
branches came from portability hardening but do not serve a current consumer.

## Decisions

### Linux is the sole supported platform

Node.js 20.19+ on Linux is the release contract. POSIX owner-only modes,
process identity, signals, and the host `claude` executable define acceptance.

### Non-Linux code is best-effort only

Defensive branches may remain when deleting them would add risk, but they are
not tested in CI and do not create compatibility commitments. New features are
not required to preserve them.

## Risks

- A future macOS or Windows consumer will require a separate OpenSpec change
  and real platform evidence before support is claimed.

## Migration

Update specs, guidance, README, and CI together; retain the current Linux real
smoke as the release acceptance source.

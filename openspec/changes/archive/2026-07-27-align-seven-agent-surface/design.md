## Context

`read_agent_messages` was added and verified in the preceding archived change, but the stable orchestration spec still contains two six-item enumerations. This is a specification bookkeeping defect, not a runtime defect.

## Goals / Non-Goals

**Goals:**

- Make the stable spec enumerate the exact seven-operation public surface.
- Preserve the already-implemented behavior and archived provenance.

**Non-Goals:**

- Change runtime code, Plugin skills, installation, history semantics, or compatibility.

## Decisions

### Replace the count-bearing requirement explicitly

The old requirement name itself says “six”, so the delta removes it and adds a seven-operation replacement. This avoids leaving a contradictory stable heading or rewriting the previous archive.

### Modify the existing Plugin mapping in place

Its requirement name remains accurate; only its complete enumeration changes from six to seven.

## Risks / Trade-offs

- [Risk] Another stale six-item statement remains. → Mitigation: residue grep plus strict all-spec validation.

## Migration Plan

Archive this spec-only correction after validation. No runtime rollback or installation action is needed.

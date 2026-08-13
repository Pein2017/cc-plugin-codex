## ADDED Requirements

### Requirement: Doctor reports active-task discovery coverage
Doctor SHALL compare bounded successful-install coverage metadata, the durable
discovery archive, and restored Codex Cache shells without reading arbitrary
historical runtime content. It SHALL report the current installed version, the
known predecessor when one exists, retained versions, archive validity, and
whether active-task discovery coverage is complete. Zero retained shells SHALL
pass only when no distinct predecessor is known; a missing known predecessor
SHALL fail with an instruction to run the local compatibility repair or refresh
path. Diagnostic output SHALL remain read-only and SHALL NOT repair, install, or
delete Plugin state.

#### Scenario: Known predecessor is retained
- **WHEN** the last successful installed version differs from the current version and a valid restored shell exists for it
- **THEN** doctor reports active-task discovery coverage complete

#### Scenario: Known predecessor is missing
- **WHEN** bounded coverage metadata names a distinct predecessor that is absent or invalid in the restored Cache
- **THEN** doctor fails the compatibility-shell check and reports the exact bounded version identifier plus an operator recovery command

#### Scenario: First-install coverage is explicit
- **WHEN** no predecessor has been recorded
- **THEN** doctor reports coverage unavailable or first-install rather than claiming that zero shells protect older active tasks

#### Scenario: Archive contains non-whitelisted content
- **WHEN** a durable discovery archive contains a path outside the compatibility whitelist or a bootstrap that does not route exclusively to the canonical checkout
- **THEN** doctor reports the archive invalid without opening or executing that content

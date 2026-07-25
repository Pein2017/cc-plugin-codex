## ADDED Requirements

### Requirement: Linux runtime control state is durable and owner-only
On supported Linux systems, the runtime SHALL persist control state using atomic
replacement and owner-only POSIX modes.

#### Scenario: Linux lifecycle state changes
- **WHEN** an atomic state update is committed on Linux
- **THEN** readers observe either the previous complete record or the new complete record, and state directories/files remain owner-only

### Requirement: Linux completion inbox is atomically persisted per owner root
On supported Linux systems, the runtime SHALL persist Agent-linked completion
events, delivery tokens, and contiguous acknowledgement cursors outside process
memory, keyed by the trusted Codex root thread and protected by owner-only POSIX
modes.

#### Scenario: Linux runtime restarts with unread events
- **WHEN** the owner root invokes the runtime after a Linux process restart
- **THEN** its unread sequence and acknowledgement cursor are recovered without consulting another root

## REMOVED Requirements

### Requirement: Runtime control state is durable and atomic
**Reason**: The prior requirement carried a native Windows ACL support obligation; the supported contract is now Linux owner-only POSIX state.

**Migration**: Use the Linux-specific durable state requirement.

#### Scenario: Lifecycle state changes
- **WHEN** a supported Linux state update commits
- **THEN** the Linux-specific replacement requirement applies

#### Scenario: Native Windows storage initializes
- **WHEN** native Windows storage initializes
- **THEN** no supported runtime guarantee is made

### Requirement: Completion inbox state is atomically persisted per owner root
**Reason**: The prior requirement included platform-generic and native Windows protection; the supported contract is now Linux owner-only POSIX state.

**Migration**: Use the Linux-specific completion inbox requirement.

#### Scenario: Runtime restarts with unread events
- **WHEN** the supported Linux runtime restarts
- **THEN** the Linux-specific replacement requirement applies

#### Scenario: Native Windows state protection is checked
- **WHEN** native Windows state is inspected
- **THEN** no supported runtime guarantee is made

## ADDED Requirements

### Requirement: Runtime evidence is owner-only
Plugin-owned runtime state directories and log files SHALL use owner-only permissions on Linux, including correction of permissive modes on artifacts opened by the current runtime.

#### Scenario: Existing log has a permissive mode
- **WHEN** the runtime opens a Plugin-owned job log whose mode permits group or other access
- **THEN** it corrects the log to an owner-only mode before appending sensitive evidence

### Requirement: Compatibility refresh copies only discovery files
The local refresh path SHALL reconstruct a compatibility shell from an explicit whitelist of Plugin discovery descriptors and checkout-owned bootstrap files and SHALL NOT copy arbitrary content from an older cache snapshot.

#### Scenario: Old cache contains an unrelated executable
- **WHEN** an older discovery snapshot contains a file outside the compatibility whitelist
- **THEN** refresh does not copy that file into the new compatibility shell

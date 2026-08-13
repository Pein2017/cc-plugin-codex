## MODIFIED Requirements

### Requirement: Recent Plugin discovery shells survive version refresh
The local installer SHALL preserve an exact discovery-only shell for each
successfully installed version in bounded owner-local Plugin data outside the
volatile Codex Plugin Cache. Before changing Plugin state, it SHALL combine any
eligible cached shells with that durable archive, and after installation it
SHALL restore at most the two most-recent non-current versions. A retained shell
SHALL contain only the Plugin snapshot's discovery configuration, Skills, and
descriptor bootstraps, and all executable lifecycle operations SHALL still
resolve to `/data/CoordExp/cc-plugin-codex`.

The installer SHALL retain bounded coverage metadata for the last successful
installed version. If that known predecessor differs from the requested version
and cannot be reconstructed from either the durable archive or the existing
Cache, refresh SHALL fail before invoking Codex instead of silently dropping the
active-task compatibility promise. An installation with no prior coverage
metadata MAY proceed as an explicitly reported first-install or migration case.

#### Scenario: Existing task references the immediately previous version
- **WHEN** a versioned local release causes Codex to remove previous Cache versions
- **THEN** the installer restores the recent previous discovery path from durable owner-local data so an existing task can resolve its exact Skill/bootstrap without using cached lifecycle source

#### Scenario: Previous Cache disappeared before refresh starts
- **WHEN** the known previous version is absent from Codex Cache but its durable discovery archive is valid
- **THEN** refresh restores that version after installing the current snapshot and reports it as retained

#### Scenario: Known predecessor has no valid shell
- **WHEN** coverage metadata names a non-current previous version that is absent or invalid in both durable owner-local data and Codex Cache
- **THEN** refresh fails before calling Codex and reports the missing version without deleting or replacing current Plugin state

#### Scenario: First managed installation has no predecessor evidence
- **WHEN** no coverage metadata or durable archive exists before installation
- **THEN** installation may proceed, explicitly reports that no predecessor coverage was available, and archives the successfully installed current discovery shell for the next upgrade

#### Scenario: More than two prior versions exist
- **WHEN** preservation selects compatibility shells from Cache and durable owner-local data
- **THEN** it restores at most the two most-recent non-current version directories and bounds the durable archive to the current version plus those two predecessors

#### Scenario: Installation fails after cleanup begins
- **WHEN** Codex Plugin installation fails after compatibility shells were staged
- **THEN** the installer attempts to restore the selected shells before reporting the installation failure and does not advance successful-install coverage metadata

#### Scenario: Historical cache contains executable runtime source
- **WHEN** a cached or archived version contains content outside the compatibility whitelist
- **THEN** that content is not copied into the durable archive or restored shell


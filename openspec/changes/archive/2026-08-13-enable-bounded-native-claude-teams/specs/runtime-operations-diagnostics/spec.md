## ADDED Requirements

### Requirement: Doctor reports bounded native-tool drift evidence
Doctor SHALL report the configured forbidden-tool policy and the latest bounded
production initialization inventory for each delegation mode and executable
fingerprint when such evidence exists. It SHALL fail a mode whose latest
inventory contains a forbidden tool, warn on unknown non-forbidden names, and
report `denySetLiveValidated: false` when no matching production observation
exists. That field SHALL describe only the reviewed deny set, not universal
containment. For an orchestrator it SHALL separately report whether all three
injected definitions and necessary coordination tool names were observed, and
whether correlated launch-and-message evidence produced
`teamTransportLiveValidated: true`. Doctor SHALL
NOT launch a model to obtain inventory and SHALL NOT expose tool inputs,
prompts, outputs, session identity, member roster, or memory content.

#### Scenario: Matching live evidence is clean
- **WHEN** the latest production observation for an executable fingerprint contains no mode-forbidden tool
- **THEN** doctor reports `denySetLiveValidated: true` and lists only bounded tool-name facts without making a universal safety claim

#### Scenario: No production inventory exists
- **WHEN** static CLI compatibility passes but no matching initialization inventory has been retained
- **THEN** doctor reports the mode as statically compatible with `denySetLiveValidated: false`

#### Scenario: Unknown tool appears
- **WHEN** retained initialization evidence includes a non-forbidden name outside the reviewed baseline
- **THEN** doctor emits an advisory drift warning without declaring the executable incompatible

#### Scenario: Injected definition is absent
- **WHEN** the latest orchestrator observation omits one required teammate definition
- **THEN** doctor reports the native team surface incompatible even if the reviewed deny set itself is clean

#### Scenario: No validated current-team transport exists
- **WHEN** init names are clean but no asynchronous named member launch plus successful correlated `SendMessage` has been observed
- **THEN** doctor reports the native transport as live-unverified rather than inferring Agent Teams from tool names or launch status alone

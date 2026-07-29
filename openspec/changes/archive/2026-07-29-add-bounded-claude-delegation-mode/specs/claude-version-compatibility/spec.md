## MODIFIED Requirements

### Requirement: Required CLI surface gates new activation
The static check SHALL require every option and value vocabulary emitted by the current terminal-parity and safe execution profiles, including `--append-system-prompt` and `--disallowedTools`. A missing option, failed or timed-out probe, or unstable fingerprint SHALL make readiness false and SHALL fail before a new Agent, job, or idle follow-up activation is durably published. It SHALL NOT pin a semantic-version range or fall back to another executable, model, or effort.

#### Scenario: Required flag is missing
- **WHEN** the new Claude CLI help omits a flag used by the runtime
- **THEN** readiness reports the version, executable, missing surface, and incompatibility without launching Claude

#### Scenario: Delegation policy flag is missing
- **WHEN** Claude CLI help omits `--append-system-prompt` or `--disallowedTools`
- **THEN** every new public activation fails before state mutation because the runtime cannot enforce its delegation boundary

#### Scenario: Compatible frontier version appears
- **WHEN** a previously unseen version advertises the complete required surface and stays stable through the probe
- **THEN** readiness admits it as statically compatible and live-unverified without requiring a repo change

#### Scenario: Active turn receives steering after an update
- **WHEN** a Claude process is already active and a message is delivered to that process
- **THEN** the message does not require readiness for a different not-yet-launched executable

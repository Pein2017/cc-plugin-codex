## MODIFIED Requirements

### Requirement: Claude runs through the headless streaming protocol
The runtime SHALL execute only a statically admitted Claude executable, using
print mode, stream-json input and output, verbose partial messages, and hook
events so that prompts, steering, session identity, output, tool use, and
terminal receipts can be tracked. Each attempt SHALL retain the prepared
executable fingerprint and record the runtime-reported Claude Code version.

#### Scenario: A tracked turn starts
- **WHEN** the supervisor launches a Claude attempt
- **THEN** the initial prompt is written through stdin and stream events are parsed into bounded runtime receipts

#### Scenario: A tracked turn completes
- **WHEN** Claude reports a terminal success for the admitted executable
- **THEN** the turn receipt records both its prepared compatibility fingerprint and runtime-reported Claude Code version

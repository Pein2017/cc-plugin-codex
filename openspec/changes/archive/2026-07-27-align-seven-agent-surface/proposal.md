## Why

The completed native-history iteration exposes seven model-facing Agent operations, but two pre-existing main-spec statements still enumerate only the former six-operation surface. The runtime, Plugin skills, tests, and governing guide already agree on seven, so the stable OpenSpec must be corrected without rewriting archived history.

## What Changes

- Replace the obsolete six-operation public-runtime requirement with a seven-operation requirement that includes `read_agent_messages`.
- Update the Plugin-skill mapping requirement to enumerate the corresponding seven namespaced skills.
- Make no runtime, Plugin, persistence, or compatibility behavior change.

## Capabilities

### Modified Capabilities

- `canonical-agent-orchestration`: Aligns the stable public-surface enumeration with the already-implemented seven-operation contract.

## Impact

Only OpenSpec planning artifacts change. No production code, installed snapshot, Agent state, or native Claude history is modified.

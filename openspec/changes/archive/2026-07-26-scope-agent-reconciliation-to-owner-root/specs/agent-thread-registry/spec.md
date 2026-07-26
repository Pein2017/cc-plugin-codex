## MODIFIED Requirements

### Requirement: Agent registry is root-scoped by default
Normal Agent lookup, control, and lifecycle reconciliation SHALL use the immutable root thread ID injected by the Codex bootstrap and SHALL resolve and mutate only Agents owned by that logical root scope. This is an accidental cross-root isolation boundary, not a cryptographic authorization claim. Model-facing calls SHALL NOT supply or override this identity.

#### Scenario: Root lists its Agents
- **WHEN** `list_agents` is called
- **THEN** only Agents owned by the current root are returned

#### Scenario: Foreign Agent path is supplied
- **WHEN** a root references an Agent owned by another root
- **THEN** lookup fails without exposing or modifying the foreign Agent

#### Scenario: Current root observes a foreign terminal receipt
- **WHEN** root A reconciles its Agent registry while a root B terminal receipt lacks session binding or Agent projection
- **THEN** root A leaves root B's receipt, Claude-session binding, completion inbox, and Agent registry unchanged

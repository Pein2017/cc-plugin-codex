## ADDED Requirements

### Requirement: Every Harness Agent is an internal worker under Codex ownership
The Plugin SHALL represent every admitted Harness Agent as a root-scoped internal worker. Codex and the user SHALL retain task decomposition, route selection, synthesis, final repository modification, review, acceptance, and the final answer. A Driver result is research or implementation evidence, not ground truth or an automatically accepted decision.

#### Scenario: Multiple Harnesses return findings
- **WHEN** Codex explicitly starts workers on different routes
- **THEN** the Plugin preserves each lineage independently and Codex verifies, reconciles, and synthesizes the results

### Requirement: Core orchestration is policy-thin
The Plugin SHALL require explicit route inputs and enforce ownership, capability, mailbox, control, lease, and delivery invariants. It SHALL NOT encode delegation thresholds, automatic route ranking, cost optimization, fan-out, fallback, worker conflict resolution, implementation-worker admission, or a rule that all Agents in one root use the same Harness. Operation-specific Skills MAY explain mechanics and safety boundaries but SHALL leave task and route choice to the current Codex lead and user instructions.

#### Scenario: Root mixes Harness routes
- **WHEN** Codex explicitly starts two valid Agents under different Harnesses
- **THEN** both coexist under the same root without a Plugin rule forcing one Harness for the whole root

#### Scenario: Selected route fails
- **WHEN** a Driver reports auth, quota, service, model, or compatibility failure
- **THEN** the Plugin preserves that route-qualified failure and does not start or retry another Harness automatically

#### Scenario: Work appears inexpensive to delegate
- **WHEN** a task matches no runtime safety or ownership constraint
- **THEN** the Plugin makes no delegation decision based on file count, token estimate, price, or latency

## REMOVED Requirements

### Requirement: Parent orchestration uses explicit join policy
**Reason**: Required/parallel/detached task classification and prescribed wait scheduling are lead-level policy. The user chose a policy-thin Plugin whose orchestration strategy evolves through Codex and user prompts rather than mandatory core guidance.

**Migration**: Retain the factual wait, completion, acknowledgement, and progress mechanics in their owning operation contracts. Remove mandatory task classification and polling prescriptions from shared server/Skill policy; Codex remains responsible for joining any evidence it needs before answering.


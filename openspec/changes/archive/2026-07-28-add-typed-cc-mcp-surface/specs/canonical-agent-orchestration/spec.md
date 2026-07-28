## MODIFIED Requirements

### Requirement: Plugin skills map directly to the canonical operations
The installed Plugin SHALL expose exactly `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, `$cc-for-pein:list-agents`, and `$cc-for-pein:read-agent-messages` as Experimental orchestration guidance for the matching `mcp__cc_for_pein__spawn_agent`, `mcp__cc_for_pein__send_message`, `mcp__cc_for_pein__followup_task`, `mcp__cc_for_pein__wait_agent`, `mcp__cc_for_pein__interrupt_agent`, `mcp__cc_for_pein__list_agents`, and `mcp__cc_for_pein__read_agent_messages` typed tools. Each MCP tool SHALL delegate to the matching checkout-owned snake_case runtime operation. All seven skills and tools SHALL be eligible for model-visible discovery in a newly started Codex task. Skills SHALL NOT silently substitute shell execution when the typed server is unavailable; the checkout CLI remains an operator/debug fallback.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads Plugin version `0.4.0`
- **THEN** all seven Experimental Agent skills and all seven typed Agent tools are present in the model-visible catalog, none of the old lifecycle skills is discoverable, and ordinary lifecycle calls require no shell command

#### Scenario: Typed MCP server is unavailable
- **WHEN** a model-facing lifecycle operation cannot resolve its matching MCP tool
- **THEN** the skill reports the Plugin discovery or startup failure instead of silently invoking the checkout CLI

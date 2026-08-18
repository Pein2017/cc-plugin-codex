## MODIFIED Requirements

### Requirement: Plugin skills map directly to the canonical operations
The installed Plugin SHALL expose exactly `$codex-harnessdock:spawn-agent`, `$codex-harnessdock:send-message`, `$codex-harnessdock:followup-task`, `$codex-harnessdock:wait-agent`, `$codex-harnessdock:interrupt-agent`, `$codex-harnessdock:list-agents`, and `$codex-harnessdock:read-agent-messages` as Experimental orchestration guidance for the matching `mcp__codex_harnessdock__spawn_agent`, `mcp__codex_harnessdock__send_message`, `mcp__codex_harnessdock__followup_task`, `mcp__codex_harnessdock__wait_agent`, `mcp__codex_harnessdock__interrupt_agent`, `mcp__codex_harnessdock__list_agents`, and `mcp__codex_harnessdock__read_agent_messages` typed tools. Each MCP tool SHALL delegate to the matching checkout-owned snake_case runtime operation. All seven Skills and tools SHALL be eligible for model-visible discovery in a newly started Codex task. Skills SHALL NOT silently substitute shell execution when the typed server is unavailable; the checkout CLI remains an operator/debug fallback.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads the HarnessDock identity generation
- **THEN** all seven Experimental Agent Skills and all seven typed Agent tools are present under the new namespaces, none of the old lifecycle Skills is discoverable, and ordinary lifecycle calls require no shell command

#### Scenario: Typed MCP server is unavailable
- **WHEN** a model-facing lifecycle operation cannot resolve its matching MCP tool
- **THEN** the Skill reports the Plugin discovery or startup failure instead of silently invoking the checkout CLI


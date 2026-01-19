# How to Create ElevenLabs Agents

This guide explains how to create and manage ElevenLabs voice agents using MCP tools.

## Prerequisites

- ElevenLabs API key configured in `~/.claude/.env`
- `mcp__elevenlabs-mcp__*` tools available

## Cloud-First Principle

**The ElevenLabs cloud is the source of truth**. Local files in `old/agents/` are archived snapshots only. Always use MCP tools to interact with live agents.

---

## List All Agents

```bash
# Via Claude Code
mcp__elevenlabs-mcp__list_agents
```

**Output**: List of all conversational AI agents with IDs and names.

---

## Get Agent Details

```bash
# Via Claude Code
mcp__elevenlabs-mcp__get_agent --agent_id agent_xxxx_demo
```

**Output**: Complete agent configuration including:
- Name, ID, voice configuration
- System prompt
- Tools and conversation config
- Creation/update timestamps

---

## Create New Agent

```bash
# Via Claude Code
mcp__elevenlabs-mcp__create_agent \
  --name "[DEV] My New Agent" \
  --voice_id "pFZP5JQG7iQjIQuC4Bku" \
  --system_prompt "You are a helpful assistant..."
```

**Best Practices**:
1. **Phase Prefix**: Use `[DEV]`, `[ALPHA]`, `[BETA]`, or `[PROD]` prefix
2. **Voice Selection**: Choose appropriate voice ID from library
3. **Prompt Structure**: Include IDENTITY, VOICE, GUARDRAILS sections
4. **Tool Configuration**: Define tools with clear schemas

---

## Update Agent

```bash
# Via Claude Code
mcp__elevenlabs-mcp__update_agent \
  --agent_id agent_xxxx_demo \
  --system_prompt "Updated prompt text..."
```

**What You Can Update**:
- System prompt
- Voice configuration
- Tools and conversation config
- Name and metadata

**Governance**: Only `[DEV]` agents can be modified by Claude Code. Production agents require approval.

---

## Working Directory Pattern

When developing a new agent prompt:

1. **Draft Locally** in `temp/agent-drafts/my-agent-prompt.md`
2. **Test and Iterate** on the local draft
3. **Deploy to Cloud** via `create_agent` or `update_agent` MCP tool
4. **Verify** via `get_agent` that cloud state is correct
5. **Archive Draft** (optional) - move to `old/` if you want to keep the snapshot

**Never** create `agents/my-agent/` directories - cloud is the source of truth.

---

## Agent Registry

Update `agent-registry.yaml` after creating agents:

```yaml
agents:
  my-new-agent:
    id: "agent_xxxxx"
    name: "My New Agent"
    phase: DEV
    scenario_file: "supersystem/scenarios/my-agent.yaml"
    description: "Purpose of this agent"
    # Cloud-managed: Query via mcp__elevenlabs-mcp__get_agent
```

---

## Testing

1. **Create Test Scenarios**: `supersystem/scenarios/my-agent.yaml`
2. **Run Tests**: Via Voice Agent Tester workflow
3. **View Results**: Check test execution logs

See `how-to-test-agents-supersystem.md` for testing guide.

---

## Troubleshooting

### "Agent not found"
- Verify agent ID is correct via `list_agents`
- Check ElevenLabs API key is valid

### "Forbidden - Cannot modify production agent"
- Only `[DEV]` agents can be modified via MCP
- Change agent name to `[DEV] ...` or request manual approval

### "Invalid system prompt"
- Check prompt length (max 10,000 chars recommended)
- Validate JSON if using structured prompts
- Test prompt in ElevenLabs console first

---

## See Also

- `deploy-n8n-workflow.md` - n8n workflow management
- `cloud-first-workflow.md` - Development process
- `test-agents-supersystem.md` - Testing framework

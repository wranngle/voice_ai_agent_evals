# AGENTS.md — voice_ai_agent_evals

> Project-specific guidelines for any AI agent operating in this repo. Universal rules live in `~/.claude/CLAUDE.md`; this file covers only ElevenLabs-specific judgment.

## ElevenLabs agent governance

This project uses the same DEV-only modification model as the n8n project, but with one structural difference: **ElevenLabs agents have no tags** — phase is encoded **only** in the agent name as a `[PHASE]` prefix.

Rules:
- Phases: `[DEV]`, `[ALPHA]`, `[BETA]`, `[PROD]`, `[ARCHIVED]`. Only `[DEV]` may be modified by an agent autonomously; everything else requires explicit user approval to touch.
- New agents you create are auto-assigned `[DEV]`. Promotions to any other phase need the user to explicitly say "yes, promote to BETA" — they cannot be done as a side effect of an update.
- Names without a `[PHASE]` prefix are treated as a naming-standard violation; rename to `[DEV] <name>` before proceeding.
- ElevenLabs MCP doesn't expose a delete operation; treat that as policy, not just API limitation. To retire an agent: rename with `[ARCHIVED]` prefix, then update governance state.
- Before creating a new agent, check the existing roster for similar ones (70%+ name/system-prompt similarity → strongly prefer cloning; 40-70% → at least surface to the user).

Governance state lives in `context/elevenlabs-agents/governance.yaml` (auto-maintained on create).

## ElevenLabs agent LLM models

The agent's `llm` parameter is gated against the project model-rankings list. Banned/deprecated values (e.g. `gpt-4o-mini`, `gpt-5-mini`, `gemini-2.0-flash-001`) are blocked at create time. Default for new ElevenLabs agents is `gemini-3-flash-preview` (low-latency voice agent default). If you need a different model, justify it against `config/model-rankings.json` first — don't pick by name recall.

## ElevenLabs PATCH /agents semantics

`PATCH /v1/convai/agents/{agent_id}` and the `mcp__elevenlabs-mcp__update_agent` tool require the **full** `conversation_config` object, not just the changed fields. The standard workflow:

1. `GET /v1/convai/agents/{agent_id}` → grab current config.
2. Extract `conversation_config` from the response.
3. Make your modifications (most commonly to `conversation_config.agent.prompt.tools[*].api_schema.request_body_schema.properties[*]`).
4. **Clean the schema before PATCH** (see below).
5. `PATCH /v1/convai/agents/{agent_id}` with `{ conversation_config: <modified> }`.
6. Verify with a follow-up GET.

### Mutually exclusive fields — these will reject the request

- **`agent.prompt.tools` AND `agent.prompt.tool_ids`**: providing both fails with `both_tools_and_tool_ids_provided`. Pick one — full inline `tools` array, OR `tool_ids` references — never both. If you're enriching schemas inline, `delete config.agent.prompt.tool_ids` before sending.
- **Per-property field conflicts** in `tool.api_schema.request_body_schema.properties[*]`: each property can have **only ONE** of `description` / `is_system_provided` / `dynamic_variable` / `constant_value` set. The API rejects with `value_error: Can only set one of: description, dynamic_variable, is_system_provided, or constant_value`. Before PATCH, strip every property down to `{ type, description }` only — drop `enum`, `is_system_provided`, `dynamic_variable`, `constant_value`.

### MCP tool vs direct HTTPS

The `mcp__elevenlabs-mcp__update_agent` tool has strict validation and poor error visibility (errors land deep in `detail.message`). Use it for: simple agent config changes (first message, voice/TTS params, temperature, model swap). Use **direct HTTPS to `api.elevenlabs.io`** for: tool schema enrichments, complex nested property updates, bulk tool modifications, and any time you're debugging a 400 — the raw response is much more readable than what bubbles through MCP.

## Authoring agent tool schemas

Tool field `description` strings carry semantic weight — they're the primary instruction surface for the agent at runtime. Format guideline (max 500 chars):

```
{type} in {format}. MUST validate: {constraints}. Context: {usage notes}
```

Concrete pattern:
- Lead with type + format: `"Recipient phone number in E.164 format (+1XXXXXXXXXX for US/Canada)."`
- Embed validation as `MUST validate:` clauses: `"MUST validate: starts with +, 10-15 digits, no spaces/dashes."`
- Include business context and impact, not just data shape.
- Reference dynamic variables explicitly: `"ALWAYS check {{system__caller_id}} before asking user."`
- For enum-style fields, **list allowed values in the description, not via the `enum` field** (which the API doesn't accept alongside description). Example: `"Business industry. Values: hvac, plumbing, legal, veterinary, automotive, retail, healthcare, other. Default 'other'."`
- For optional fields, state the impact: `"Company name for lead enrichment. Optional but HIGHLY RECOMMENDED (improves lead quality 40%). Max 100 chars."`

## Naming standards (ElevenLabs)

- **Agents**: `[PHASE] Name - Role Description` in Title Case with phase prefix. ✅ `[DEV] Sarah - Wranngle Lead Specialist`. ❌ `Sarah v2`, `sarah-agent`.
- **Tools**: `snake_case` `verb_noun`. ✅ `send_email`, `send_sms`, `process_lead`, `extract_data`. ❌ `sendEmail`, `send-email`, `send_email_v2`.
- Universal forbiddens (across both agents and tools): version suffixes, `tool` / `workflow` / `v1` suffixes, mixed cases.

---

<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->
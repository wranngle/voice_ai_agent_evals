# Voice AI Agents

ElevenLabs voice agent configurations, n8n workflow pipelines, testing infrastructure, and supporting documentation for ExampleCo.

## Directory Structure

```
voice_ai_agents/
├── supersystem/            # Autonomous evaluation framework (runs tests against cloud)
│   ├── test-factory/       # Advanced test generation system
│   │   ├── lib/            # Core modules (generator, executor, uploader)
│   │   ├── templates/      # Base scenarios and variants
│   │   └── generated/      # Auto-generated test suites
│   ├── scenarios/          # Test scenarios for cloud agents
│   │   └── example-agent.yaml      # Sarah agent test scenarios
│   └── tests/              # Test execution and evaluation configs
│
├── docs/                   # Documentation
│   ├── how-to/             # Cloud operation guides (MCP tools)
│   ├── architecture/       # Architecture documentation
│   ├── decisions/          # Architecture decision records (ADRs)
│   └── elevenlabs-twilio-voiceagent/  # API documentation
│
├── templates/              # Reusable component templates
│   ├── sms-booking-tool-template.json
│   └── test-scenarios-template.yaml
│
├── temp/                   # Working directory (gitignored)
│   ├── agent-drafts/       # Draft ElevenLabs agent configs before cloud deployment
│   └── workflow-exports/   # Exported n8n workflows for local modification
│
├── old/                    # Archived cloud-mirroring files (read-only snapshots)
│   ├── agents/             # Archived ElevenLabs agent configs (use MCP tools for current)
│   ├── pipelines/          # Archived n8n workflow JSONs (query cloud for current)
│   └── transcript-extraction/  # Archived workflows
│
├── openspec/               # Formal change specifications
│   ├── project.md          # Project definition
│   └── changes/            # Change proposals and specs
│
├── agent-registry.yaml     # Master index of cloud agents
└── CLAUDE.md               # OpenSpec integration instructions
```

## Cloud-First Architecture

This project is a **cloud-first portal** for managing ElevenLabs voice agents and n8n workflows. The cloud systems are the source of truth:

- **ElevenLabs Agents**: Managed via `mcp__elevenlabs-mcp__*` tools
- **n8n Workflows**: Managed via `mcp__n8n-mcp__*` tools
- **Local Repository**: Control plane with testing infrastructure, documentation, and working directory

See `docs/how-to/` for guides on cloud operations.

## Active Agents

### Sarah - B2B Sales SDR
- **Agent ID:** `agent_xxxx_demo`
- **Phone:** +1-888-266-2193
- **Status:** PRODUCTION
- **Purpose:** the AI hotline - AI hotline for after-hours B2B sales
- **Industries:** HVAC, plumbing, property management, personal injury law
- **Cloud Config:** Query via `mcp__elevenlabs-mcp__get_agent agent_xxxx_demo`
- **Archived Docs:** `old/agents/example-agent/` (historical reference)
- **Note:** Agent config managed via ElevenLabs API (cloud-first)

#### Client Initiation Data Enhancement ✨ NEW
Sarah now features personalized greetings powered by real-time CRM enrichment:
- ✅ Greets callers by name ("Hi John, great to hear from you again!")
- ✅ References company and industry context
- ✅ VIP treatment for high-value customers (Gold tier)
- ✅ Auto-integrates with CRM for post-call enrichment

**Quick Start:** [CLIENT-INITIATION-INDEX.md](CLIENT-INITIATION-INDEX.md) | [QUICK-REFERENCE.md](QUICK-REFERENCE.md)

**Status:** Production Ready (v1.0.0) | **Performance:** <500ms P95 latency, 100% call success rate

## Quick Reference

| Need | Location |
|------|----------|
| **Client Initiation Data** | |
| Quick start guide | [CLIENT-INITIATION-INDEX.md](CLIENT-INITIATION-INDEX.md) |
| Quick reference card | [QUICK-REFERENCE.md](QUICK-REFERENCE.md) |
| Feature documentation | `docs/client-initiation-data-README.md` |
| Deployment guide | `docs/client-initiation-deployment-guide.md` |
| Deploy script | `supersystem/tools/deploy-client-initiation.js` |
| Health check | `supersystem/tools/webhook-health-check.js` |
| Monitoring dashboard | `supersystem/monitoring/client-initiation-dashboard.js` |
| **Sarah Agent** | |
| Agent's setup guide | `agents/example-agent/SETUP.md` |
| Agent's full spec | `agents/example-agent/tech-spec.md` |
| Test Sarah | `agents/example-agent/tests/scenarios.yaml` |
| **Workflows** | |
| Main voice pipeline | `pipelines/elevenlabs-twilio-bulletproof-v3.json` |
| Post-call processing | `pipelines/elevenlabs-post-call-bulletproof-v2.json` |
| Client initiation webhook | `supersystem/client-initiation-data-prod.json` |
| **Testing & Tools** | |
| Test generation | `supersystem/test-factory/` |
| Change proposals | `openspec/changes/` |

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ElevenLabs    │────▶│   n8n Pipeline  │────▶│    CRM    │
│   Voice Agent   │     │   (post-call)   │     │      CRM        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│    Twilio       │     │   Supersystem   │
│   (SMS/Voice)   │     │   (evaluation)  │
└─────────────────┘     └─────────────────┘
```

## Development Principles

### Cloud-First Architecture
- **ElevenLabs agents:** Managed via API, no local config files
- **n8n workflows:** Managed via API, JSON files for version control only
- **Credentials:** Centralized in `~/.claude/.env`, synced to services

### TypeScript Environment
- **Runtime:** Bun
- **Validation:** ArkType for I/O boundaries
- **Linting:** XO
- **Config:** `tsconfig.json`, `bunfig.toml`, `package.json`

### OpenSpec Integration
Formal change proposals are tracked in `openspec/`:
- See `CLAUDE.md` for routing logic
- See `openspec/AGENTS.md` for workflow details

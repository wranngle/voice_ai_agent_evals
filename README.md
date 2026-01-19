# Voice AI Agents

ElevenLabs voice agent configurations, n8n workflow pipelines, testing infrastructure, and supporting documentation for ExampleCo.

## Directory Structure

```
voice_ai_agents/
├── agents/                 # Per-agent configurations
│   └── example-agent/              # Sarah - B2B Sales SDR (PRODUCTION)
│       ├── tech-spec.md    # Technical specification (846 lines)
│       ├── SETUP.md        # Setup documentation
│       └── tests/
│           └── scenarios.yaml  # Sarah-specific test scenarios
│
├── pipelines/              # n8n workflow definitions
│   ├── elevenlabs-twilio-bulletproof-v3.json # Main voice agent pipeline
│   ├── elevenlabs-post-call-bulletproof-v2.json # Post-call processing
│   ├── crm-lead-caller.json        # CRM integration
│   ├── voice-agent-tester-v2.json        # Test runner workflow
│   ├── example-agent-email-tool-v1.json          # Email sending tool
│   └── qdrant-*.json                     # Vector DB setup
│
├── supersystem/            # Autonomous evaluation framework
│   ├── test-factory/       # Advanced test generation system
│   │   ├── lib/            # Core modules (generator, executor, uploader)
│   │   ├── templates/      # Base scenarios and variants
│   │   └── generated/      # Auto-generated test suites
│   └── tests/              # Test scenarios and evaluation configs
│
├── templates/              # Reusable components
│   ├── sms-booking-tool-template.json
│   └── test-scenarios-template.yaml
│
├── transcript-extraction/  # Post-call transcript processing
│   ├── transcript-field-extractor-v2.json
│   └── workflow.json
│
├── docs/                   # API documentation
│   └── elevenlabs-twilio-voiceagent/
│
├── openspec/               # Formal change specifications
│   ├── project.md          # Project definition
│   └── changes/            # Change proposals and specs
│
├── agent-registry.yaml     # Master index of all agents
├── CLAUDE.md               # OpenSpec integration instructions
└── docs/decisions/         # Architecture decision records (ADRs)
    └── 2026-01-19-project-reorganization.md  # old/ directory removal
```

## Active Agents

### Sarah - B2B Sales SDR
- **Agent ID:** `agent_xxxx_demo`
- **Phone:** +1-888-266-2193
- **Status:** PRODUCTION
- **Purpose:** the AI hotline - AI hotline for after-hours B2B sales
- **Industries:** HVAC, plumbing, property management, personal injury law
- **Docs:** `agents/example-agent/SETUP.md` | `agents/example-agent/tech-spec.md`
- **Note:** Agent config managed via ElevenLabs API (cloud-first)

## Quick Reference

| Need | Location |
|------|----------|
| Agent's setup guide | `agents/example-agent/SETUP.md` |
| Agent's full spec | `agents/example-agent/tech-spec.md` |
| Test Sarah | `agents/example-agent/tests/scenarios.yaml` |
| Main voice pipeline | `pipelines/elevenlabs-twilio-bulletproof-v3.json` |
| Post-call processing | `pipelines/elevenlabs-post-call-bulletproof-v2.json` |
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

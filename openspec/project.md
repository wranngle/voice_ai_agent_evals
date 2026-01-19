# Project Context

## Purpose

Voice AI Agents is a production-grade infrastructure for building, testing, and deploying ElevenLabs voice agents integrated with n8n workflows and Twilio SMS capabilities. The project powers **ExampleCo' "the AI hotline"** - AI hotlines that handle after-hours calls for small businesses (HVAC, plumbing, property management, legal services).

**Primary Goals:**
- B2B sales SDR automation via conversational AI
- 24/7 after-hours call handling for SMBs
- Comprehensive testing and evaluation at scale (1000+ test scenarios)
- Autonomous self-improvement through the Supersystem engine

**Active Agents:**
| Agent | Phase | Purpose | Phone |
|-------|-------|---------|-------|
| Sarah (Lead Specialist v2.0) | PROD | B2B Sales SDR for "the AI hotline" | +1-888-266-2193 |
| Example Garage | DEV | Garage door repair booking | Not assigned |

## Tech Stack

### Voice & Telephony
- **ElevenLabs** - Voice AI engine (agent hosting, native testing API, TTS)
- **Twilio** - Phone + SMS delivery
- **Voice Models**: eleven_turbo_v2, Sarah voice (pFZP5JQG7iQjIQuC4Bku)

### Workflow & Automation
- **n8n** - Workflow orchestration (webhooks, HTTP requests, data routing)
- **Pipelines**: SMS delivery, post-call processing, client lookup, Slack notifications

### LLM/AI
- **OpenAI GPT-4o** - Test simulation
- **Google Gemini** - Research engine, transcript extraction
- **Agent LLM**: gpt-4o-mini (temperature: 0.3 for deterministic responses)

### Data Storage
- **Google Sheets** - Call logs, client data, test results
- **Local JSON** - Test results, agent modifications, configuration
- **Supabase** (future) - Upgrade path for scale

### CRM
- **CRM** - Lead/deal creation and management

### Languages & Formats
- **JavaScript/Node.js** - Scripts, supersystem engine, test factory
- **YAML** - Configuration, test scenarios, agent registry
- **JSON** - n8n workflows, ElevenLabs agent configs
- **Markdown** - Prompts, specs, documentation

## Project Conventions

### Code Style

**File Naming:**
- `snake_case.js` for scripts and utilities
- `kebab-case.json` for workflows and configs
- `kebab-case.yaml` for test scenarios and registries
- `PascalCase.md` for documentation (except README.md)

**Pipeline Naming:**
- `elevenlabs-[integration]-[purpose].json` - Service integration focused
- `[feature]-[version].json` - Feature-focused workflows
- Example: `elevenlabs-twilio-bulletproof.json` (v2.0 production SMS)

**Agent Naming (Phase Prefixes):**
- `[DEV] Agent Name` - Development/testing only
- `[ALPHA] Agent Name` - Limited testing
- `[BETA] Agent Name` - User acceptance testing
- `[PROD] Agent Name` - Production deployment

**Webhook Paths:**
- `/send-sms` - SMS delivery
- `/post-call` - Post-call orchestrator
- `/client-lookup` - Pre-call client data
- `/log-execution` - Call logging
- `/slack-notify` - Slack alerts

### Architecture Patterns

**Data Flow:**
```
┌─────────────────┐     ┌─────────────┐     ┌─────────────┐
│   Inbound Call  │────▶│  ElevenLabs │────▶│   n8n SMS   │
│   (Twilio)      │     │   Agent     │     │  Pipeline   │
└─────────────────┘     └──────┬──────┘     └─────┬───────┘
                               │                   │
                               ▼                   ▼
                        ┌──────────────┐  ┌──────────────┐
                        │ Google Sheets│  │ Twilio SMS   │
                        │  (Logs)      │  │ (Delivery)   │
                        └──────────────┘  └──────────────┘
```

**Agent Prompt Structure:**
- IDENTITY - Who the agent is
- VOICE - Tone, word economy (<25 words per response)
- PRODUCT - What they're selling/supporting
- GUARDRAILS - What to avoid, emergency handling
- OBJECTION HANDLING - Response patterns
- FORBIDDEN LANGUAGE - Never say these phrases

**Tool Patterns:**
- Webhook-based tools (ElevenLabs → n8n)
- Typed request schemas with required fields
- Timeout and interruption settings

### Testing Strategy

**Test Scenario Format (YAML):**
```yaml
- id: scenario-id
  name: "Human readable name"
  category: happy_path|objection|tool|edge_cases
  priority: critical|high|low
  tags: [regression, sms, core-flow]
  simulated_user_prompt: |
    Instructions for GPT-4o simulation
  expected_tool_calls: [send_sms, end_call]
  evaluation_criteria:
    - id: criterion-id
      name: "What this tests"
      prompt: "Question for LLM evaluator"
      weight: 1.0
      severity: critical|high|low
```

**Quality Gates:**
- Critical failure count: 0 allowed
- Success rate minimum: 80%
- Tool accuracy minimum: 95%
- Promotion gate: 95% pass rate required

**Test Infrastructure:**
- `agents/{agent}/tests/scenarios.yaml` - Agent-specific tests
- `supersystem/test-factory/` - Scalable test generation (1000+)
- ElevenLabs Native Testing API for execution

### Git Workflow

**Branch Strategy:**
- `main` - Production-ready code
- Feature branches for development

**Commit Message Format:**
```
[category] action: description

Categories: n8n, ultrathink, agent, test, docs, fix
Actions: create, update, fix, add, remove, refactor
```

**Recent Examples:**
- `[n8n] create: ATDD test suite for post-call webhook self-healing`
- `[ultrathink] Voice agent breakthrough: 100% pass rate, fleet rollout complete`

## Domain Context

### Voice Agent Conversation Flow (Sarah)
1. **Hook** (10 sec): Identity + value prop + concrete example + permission ask
2. **Discovery** (3 questions): Call volume, current solution, decision authority
3. **Pain Agitation**: Industry-specific pain statement
4. **Solution**: Brief AI hotline description
5. **Demo Close**: "I want to show you exactly how it works" → SMS booking link
6. **Recap**: Confirm details before closing

### Target Industries
- HVAC contractors
- Plumbing services
- Property management companies
- Personal injury law firms
- Dental practices
- Veterinary clinics
- Home services (garage doors, landscaping)

### Key Terminology
- **the AI hotline**: ExampleCo's AI hotline product
- **SDR**: Sales Development Representative
- **After-hours calls**: Calls outside business hours (primary use case)
- **Tool calls**: Agent actions (send_sms, end_call, skip_turn)
- **Scribe**: ElevenLabs speech-to-text during calls

## Important Constraints

### Technical Constraints
- **Word Economy**: Agent responses must be <25 words
- **One Question Per Turn**: Never ask multiple questions
- **Temperature 0.3**: Deterministic, predictable responses
- **Webhook Timeouts**: Must handle gracefully, never verbalize errors

### Business Constraints
- **Emergency Redirect**: Life-threatening situations → 911
- **No Pricing Discussion**: Redirect pricing questions to demo
- **Call Direction Awareness**: Different greetings for inbound vs. outbound

### Regulatory Constraints
- **Never Claim Human**: Agent must not claim to be human if asked
- **SMS Consent**: Only send SMS after explicit or implied consent
- **Data Privacy**: Caller information protected

### Forbidden Language
- Never say: "None", "null", "undefined", "error", "failed"
- Never use placeholder text or technical jargon
- Never make up information or prices

## External Dependencies

### APIs & Services

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| ElevenLabs | Voice agents, TTS, testing | API Key |
| Twilio | Phone numbers, SMS delivery | Account SID + Auth Token |
| n8n | Workflow orchestration | API Key (self-hosted) |
| OpenAI | GPT-4o for test simulation | API Key |
| Google Gemini | Research, transcript extraction | API Key |
| Google Sheets | Data storage | Service Account |
| CRM | CRM integration | API Key |
| Slack | Notifications | Webhook URL |

### Key Endpoints
- n8n: `https://your-n8n-host.example.com/webhook/...`
- ElevenLabs Native Testing: `https://api.elevenlabs.io/v1/convai/...`

### Configuration Files
- `agent-registry.yaml` - Master agent index
- `agents/{agent}/config.json` - ElevenLabs agent configuration
- `agents/{agent}/system-prompt.md` - Conversation engine
- `pipelines/*.json` - n8n workflow definitions

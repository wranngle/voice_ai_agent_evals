# ElevenLabs + Twilio voice agent

> Smoke tests and reference scripts for the ElevenLabs + Twilio integration surface. Each test is a standalone shell script that exercises one API endpoint with placeholder credentials — useful when bringing up a new sandbox or verifying credential rotation.

## Overview

This workflow combines ElevenLabs voice AI capabilities with Twilio telephony to create a conversational voice agent that can:

- Receive inbound calls via Twilio
- Generate natural speech responses using ElevenLabs
- Send follow-up SMS messages via Twilio
- Clone voices for personalized interactions
- Handle multi-turn conversations

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        VOICE AGENT FLOW                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐     │
│  │   Twilio    │────>│  Webhook    │────>│  AI Processing      │     │
│  │   Trigger   │     │  Handler    │     │  (LLM + Context)    │     │
│  └─────────────┘     └─────────────┘     └──────────┬──────────┘     │
│                                                      │                │
│                                                      ▼                │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │   Twilio    │<────│  HTTP Request   │<────│  ElevenLabs     │     │
│  │   Response  │     │  (Voice Stream) │     │  Text-to-Speech │     │
│  └─────────────┘     └─────────────────┘     └─────────────────┘     │
│                                                                       │
│  [Optional SMS Follow-up]                                             │
│  ┌─────────────┐                                                      │
│  │   Twilio    │──── Post-call SMS summary                           │
│  │   SMS Send  │                                                      │
│  └─────────────┘                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Integrations

### ElevenLabs (HTTP Request - No native n8n node)

| Feature | API Endpoint | Status |
|---------|--------------|--------|
| Text-to-Speech | `/v1/text-to-speech/{voice_id}` | Required |
| Voice Cloning | `/v1/voices/add` | Optional |
| Conversational AI | `/v1/convai/conversation` | Optional |
| Speech-to-Speech | `/v1/speech-to-speech/{voice_id}` | Optional |

### Twilio (Native n8n nodes)

| Feature | Node | Status |
|---------|------|--------|
| Inbound Call Trigger | `twilioTrigger` | Required |
| Send SMS | `twilio` | Required |
| Make Call | `twilio` | Optional |

## Credentials Required

| Service | Auth Type | Credential Name |
|---------|-----------|-----------------|
| ElevenLabs | API Key | `elevenlabs_api` |
| Twilio | Account SID + Auth Token | `twilio_api` |

## File Structure

```
elevenlabs-twilio-voiceagent/
├── README.md                    # This file
├── docs/
│   ├── elevenlabs/             # ElevenLabs API docs (cached)
│   │   └── api-reference.md
│   └── twilio/                 # Twilio API docs (cached)
│       └── api-reference.md
├── env/
│   ├── .env.elevenlabs         # ElevenLabs credentials template
│   └── .env.twilio             # Twilio credentials template
├── tests/
│   ├── elevenlabs/             # ElevenLabs curl tests
│   │   ├── 01-auth-test.sh
│   │   └── 02-text-to-speech.sh
│   └── twilio/                 # Twilio curl tests
│       ├── 01-auth-test.sh
│       └── 02-send-sms.sh
└── workflow.json               # Exported workflow (when ready)
```

## Setup Instructions

### 1. Configure Credentials

```bash
# Edit the credential files with your API keys
# ElevenLabs: Get key from https://elevenlabs.io/app/settings/api-keys
# Twilio: Get SID/Token from https://console.twilio.com/

nano env/.env.elevenlabs
nano env/.env.twilio
```

### 2. Run Integration Tests

```bash
cd tests
./run-all-tests.sh
```

### 3. Deploy to n8n

Once tests pass, the workflow can be deployed via the n8n-mcp tools.

## Development Status

- [ ] ElevenLabs API documentation cached
- [ ] Twilio API documentation cached
- [ ] Curl tests passing
- [ ] Workflow JSON created
- [ ] Deployed to dev instance
- [ ] Integration tested
- [ ] Deployed to production

## Use Cases

1. **Customer Service Voice Bot**: Answer calls, provide info, send SMS receipts
2. **Appointment Reminders**: Outbound calls with voice, SMS confirmations
3. **Voice-to-Text Transcription**: Record calls, transcribe, summarize
4. **Personalized Outreach**: Clone executive voice for branded calls

---

*Seed created: 2025-12-26*

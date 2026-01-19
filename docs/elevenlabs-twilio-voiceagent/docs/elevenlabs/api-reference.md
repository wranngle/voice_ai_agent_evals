# ElevenLabs API Reference

> Cached: 2025-12-26 | Sources: ref-tools, exa

## Overview

ElevenLabs Text to Speech (TTS) API turns text into lifelike audio with nuanced intonation, pacing and emotional awareness. Models adapt to textual cues across 32 languages.

## Authentication

```bash
# Header-based API Key
xi-api-key: YOUR_API_KEY
```

Get your API key: https://elevenlabs.io/app/settings/api-keys

## Base URL

```
https://api.elevenlabs.io
```

## Key Endpoints

### Text-to-Speech

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/text-to-speech/{voice_id}` | Convert text to speech |
| POST | `/v1/text-to-speech/{voice_id}/stream` | Stream audio in real-time |

**Request Body:**
```json
{
  "text": "Hello, this is a test.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}
```

### Voice Cloning

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/voices/add` | Instant voice clone |
| GET | `/v1/voices` | List all voices |
| GET | `/v1/voices/{voice_id}` | Get voice details |

### Conversational AI Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/convai/conversation` | Start conversation |
| GET | `/v1/convai/agents/{agent_id}` | Get agent config |
| POST | `/v1/convai/agents` | Create agent |

## Models

| Model | Latency | Languages | Use Case |
|-------|---------|-----------|----------|
| `eleven_flash_v2_5` | ~75ms | 32 | Real-time/telephony |
| `eleven_multilingual_v2` | ~250ms | 29 | High quality |
| `eleven_turbo_v2_5` | ~250ms | 32 | Balanced |

## Audio Formats

- **MP3**: 22.05kHz-44.1kHz, 32-192kbps
- **PCM (S16LE)**: 16kHz-44.1kHz, 16-bit
- **μ-law**: 8kHz (telephony optimized)
- **Opus**: 48kHz, 32-192kbps

## Agent Platform - Client Initiation Data

When initializing a conversation with an ElevenLabs agent, you can pass client context:

### Via SDK (Recommended)
```javascript
const conversation = await Conversation.startSession({
  agentId: 'your-agent-id',
  // Client initiation data - passed to agent context
  clientData: {
    customerId: '12345',
    customerName: 'John Doe',
    accountStatus: 'premium',
    previousInteractions: 3,
    preferredLanguage: 'en-US'
  }
});
```

### Via API
```bash
POST /v1/convai/conversation
{
  "agent_id": "your-agent-id",
  "custom_llm_extra_body": {
    "customer_context": {
      "id": "12345",
      "name": "John Doe",
      "tier": "premium"
    }
  }
}
```

### Via Webhook (n8n Integration)
The n8n workflow can enrich the agent with data by:
1. Receiving Twilio call webhook
2. Looking up caller in CRM
3. Passing context to ElevenLabs agent via `custom_llm_extra_body`

## Rate Limits

Varies by subscription tier. See https://elevenlabs.io/pricing/api

## MCP Server Available

This project has access to `mcp__elevenlabs-mcp` for direct integration:
- `text_to_speech` - Generate audio
- `create_agent` - Create conversational agent
- `make_outbound_call` - Initiate calls (with Twilio)

---

*Retrieved via ref-tools + exa research*

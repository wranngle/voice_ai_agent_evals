# Voice Agent & ElevenLabs Workflow Patterns

**Source**: n8n Template Database Analysis
**Templates Analyzed**: 7 community workflows
**Date**: 2025-12-29

---

## Executive Summary

ElevenLabs has **no native n8n node**. All integrations use HTTP Request nodes to the ElevenLabs API. Voice agent workflows follow consistent architectural patterns across the community.

---

## Templates Analyzed

| ID | Name | Key Pattern |
|----|------|-------------|
| 2846 | AI Voice Chatbot with ElevenLabs & OpenAI | Webhook + RAG + Vector Store |
| 4484 | Voice AI Chatbot with InfraNodus GraphRAG | Multi-Expert AI Agent |
| 4672 | ElevenLabs MCP Server | Tool Exposure Pattern |
| 4368 | AI Real Estate Agent | Voice Call + TTS + Twilio |
| 4888 | Voice-Powered Marketing Assistant (Gwen) | Multi-Agent Subworkflows |
| 3657 | Voiceflow Chatbot/Voice/Phone Agent | Multi-Webhook RAG |
| 3563 | AI Phone Agent with Retell | Phone + Calendar Booking |

---

## Pattern 1: ElevenLabs Integration (No Native Node)

### HTTP Request Configuration

**Endpoint Base**: `https://api.elevenlabs.io/v1/`

**Common Operations**:
```
POST /text-to-speech/{voice_id}          → Generate speech
GET  /voices                              → List voices
POST /voice-generation/generate-voice     → Create voice
POST /audio-isolation                     → Isolate audio
POST /sound-generation                    → Sound effects
```

**Authentication**:
```json
{
  "headerParameters": {
    "parameters": [
      { "name": "xi-api-key", "value": "={{ $credentials.elevenLabsApi }}" }
    ]
  }
}
```

### Credential Pattern

ElevenLabs API key stored as Header Auth credential:
- Credential Type: `httpHeaderAuth`
- Header Name: `xi-api-key`
- Referenced via: `{{ $credentials.elevenLabsApi }}`

---

## Pattern 2: Webhook-Based Voice Agent Integration

### ElevenLabs Conversational AI Callback

ElevenLabs Conversational AI (voice agents) sends webhook callbacks to n8n:

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ ElevenLabs          │────▶│ n8n Webhook         │────▶│ AI Agent         │
│ Conversational AI   │     │ (receives prompt)   │     │ (processes)      │
└─────────────────────┘     └─────────────────────┘     └──────────────────┘
         ▲                                                       │
         │                                                       │
         └───────────────────────────────────────────────────────┘
                        Respond to Webhook (returns answer)
```

**Webhook Payload from ElevenLabs**:
```json
{
  "prompt": "User's spoken input transcribed",
  "sessionId": "unique-session-identifier"
}
```

**Response Format**:
```json
{
  "response": "AI-generated text response"
}
```

### Session-Based Memory

The `sessionId` from ElevenLabs enables conversation continuity:
```json
{
  "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  "parameters": {
    "sessionIdType": "customKey",
    "sessionKey": "={{ $json.sessionId }}"
  }
}
```

---

## Pattern 3: Data Flow Architectures

### A. Simple Voice Chatbot (Template 2846)

```
Webhook ──▶ AI Agent ──▶ Respond to Webhook
               │
               ├── Tool: Vector Store (RAG)
               ├── Tool: Memory Buffer
               └── Model: OpenAI Chat
```

### B. Multi-Expert Architecture (Template 4484)

```
Webhook ──▶ AI Agent ──▶ Respond to Webhook
               │
               ├── HTTP Request Tool: Expert 1 (API call)
               ├── HTTP Request Tool: Expert 2 (API call)
               ├── HTTP Request Tool: Expert N (API call)
               └── Memory: Window Buffer (session-based)
```

### C. Voice Call Workflow (Template 4368)

```
Webhook (Lead) ──▶ Generate Script ──▶ ElevenLabs TTS ──▶ Twilio Call
                        │                    │                  │
                        ▼                    ▼                  ▼
                   AI Agent           HTTP Request         HTTP Request
                   (LLM)              (audio file)         (place call)
                                           │
                                           ▼
                                      Google Drive
                                      (store audio)
```

### D. Multi-Agent Subworkflow (Template 4888)

```
Webhook ──▶ AI Agent (Orchestrator) ──▶ Respond to Webhook
               │
               ├── Subworkflow Tool: Blog Post Generator
               ├── Subworkflow Tool: Image Creator
               ├── Subworkflow Tool: Image Editor
               ├── Subworkflow Tool: Think/Reason
               └── Memory: Window Buffer
```

---

## Pattern 4: Storage Patterns

### Vector Stores for RAG

**Qdrant** (most common):
```json
{
  "type": "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
  "parameters": {
    "qdrantCollection": { "__rl": true, "value": "knowledge_base" }
  }
}
```

**In-Memory** (for demos):
```json
{
  "type": "@n8n/n8n-nodes-langchain.vectorStoreInMemory"
}
```

### Document Sources

| Source | Node Type | Use Case |
|--------|-----------|----------|
| Google Drive | `n8n-nodes-base.googleDrive` | Documents, PDFs |
| Google Sheets | `n8n-nodes-base.googleSheets` | Structured data, logs |
| Binary Files | `n8n-nodes-base.readWriteFile` | Local audio files |

### Embeddings

**OpenAI Embeddings** (standard):
```json
{
  "type": "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
  "parameters": {
    "model": "text-embedding-3-small"
  }
}
```

---

## Pattern 5: Orchestration Patterns

### A. Single AI Agent with Tools

Most common pattern. AI Agent decides which tools to use:

```json
{
  "type": "@n8n/n8n-nodes-langchain.agent",
  "parameters": {
    "systemMessage": "You are a helpful assistant..."
  },
  "connections": {
    "ai_tool": [/* tools connected here */],
    "ai_languageModel": [/* LLM connected here */],
    "ai_memory": [/* memory connected here */]
  }
}
```

### B. MCP Server Exposure (Template 4672)

Expose ElevenLabs as MCP tools for external AI clients:

```
MCP Server Trigger ──▶ HTTP Request Tool (TTS)
                  ├──▶ HTTP Request Tool (List Voices)
                  ├──▶ HTTP Request Tool (Isolate Audio)
                  └──▶ HTTP Request Tool (Sound Effects)
```

### C. Subworkflow-as-Tool

Complex operations encapsulated as separate workflows:

```json
{
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "parameters": {
    "workflowId": "{{ $vars.blog_post_workflow_id }}",
    "description": "Creates a blog post on a given topic"
  }
}
```

---

## Pattern 6: Phone/Voice Call Integration

### Twilio Integration

**Via HTTP Request** (common in templates):
```json
{
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "url": "https://api.twilio.com/2010-04-01/Accounts/{{ $credentials.twilioAccountSid }}/Calls.json",
    "method": "POST",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "twilioApi"
  }
}
```

**Via Native Node** (simpler):
```json
{
  "type": "n8n-nodes-base.twilio",
  "parameters": {
    "resource": "call",
    "operation": "make"
  }
}
```

### Retell AI Integration (Template 3563)

Alternative voice agent provider with phone capabilities:
- Purchase phone numbers via API
- Link numbers to Retell agents
- Capture call events via webhook
- Access transcripts and analytics

---

## Pattern 7: Memory Management

### Window Buffer Memory

Maintains last N messages in conversation:
```json
{
  "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  "parameters": {
    "sessionIdType": "customKey",
    "sessionKey": "={{ $json.sessionId }}",
    "contextWindowLength": 10
  }
}
```

### Redis Memory (Persistent)

For production deployments with session persistence:
```json
{
  "type": "@n8n/n8n-nodes-langchain.memoryRedisChat",
  "parameters": {
    "sessionKey": "={{ $json.sessionId }}",
    "sessionTTL": 3600
  }
}
```

---

## Pattern 8: Error Handling

### Webhook Response Timeout

ElevenLabs expects response within ~10 seconds:
```json
{
  "type": "n8n-nodes-base.respondToWebhook",
  "parameters": {
    "respondWith": "json",
    "responseBody": "={{ { response: $json.output } }}"
  }
}
```

### Fallback Responses

Graceful degradation when AI fails:
```json
{
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "string": [{ "value1": "={{ $json.output }}", "operation": "isEmpty" }]
    }
  }
}
```

---

## ElevenLabs Webhook Tool Setup

To connect ElevenLabs Conversational AI to n8n:

1. **Create n8n Webhook**:
   - Path: `/elevenlabs-agent`
   - Method: POST
   - Response Mode: "Respond to Webhook" node

2. **Create ElevenLabs Custom Tool**:
   - In ElevenLabs Agent settings → Tools
   - Type: Webhook
   - URL: `https://your-n8n.com/webhook/elevenlabs-agent`
   - Description: "Use this tool to [action description]"

3. **Map Data**:
   - ElevenLabs sends: `{ "prompt": "...", "sessionId": "..." }`
   - n8n returns: `{ "response": "..." }`

---

## Recommended Stack

| Component | Recommended | Alternative |
|-----------|-------------|-------------|
| Voice Agent | ElevenLabs Conversational AI | Retell AI, Vapi |
| TTS | ElevenLabs API | OpenAI TTS |
| Phone | Twilio | Retell (bundled) |
| Vector Store | Qdrant | Pinecone, Supabase |
| LLM | OpenAI GPT-4 | Anthropic Claude |
| Memory | Window Buffer | Redis Chat |
| Embeddings | OpenAI text-embedding-3-small | Cohere |

---

## Key Insights

1. **No Native Node**: ElevenLabs requires HTTP Request nodes everywhere
2. **Session Tracking**: `sessionId` is critical for conversation continuity
3. **Webhook Pattern**: ElevenLabs calls n8n, not vice versa (for agents)
4. **Multi-Tool Architecture**: AI Agents with multiple tools is the dominant pattern
5. **RAG is Common**: Most voice agents use vector stores for knowledge
6. **Twilio for Calling**: Phone capabilities added via Twilio integration
7. **Subworkflows for Complexity**: Complex operations wrapped as tool workflows

---

*Generated from n8n Template Database Analysis*

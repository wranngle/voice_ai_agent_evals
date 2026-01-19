# Design: Bulletproof Post-Call Webhook

## Architecture Overview

```
ElevenLabs Webhook ──► Immediate ACK (200) ──► Async Processing Zone
                              │
                              ▼
                      Schema Validation
                              │
                              ▼
                      Event Type Router
                      ┌───────┼───────┐
                      ▼       ▼       ▼
               [transcription] [failure] [invalid]
                      │
                      ▼
              ┌───────────────────────────────────┐
              │      Fan-Out (Parallel)           │
              │  ┌────────┐ ┌────────┐ ┌────────┐│
              │  │DataTbl │ │ Slack  │ │  CRM   ││
              │  │ Logger │ │Notifier│ │Graceful││
              │  └────┬───┘ └────────┘ └────┬───┘│
              └───────┼─────────────────────┼────┘
                      │                     │
                      ▼                     ▼
               Qdrant Vector          CRM
               Embeddings          Note + Update
                      │
                      ▼
               Error Aggregator
                      │
                      ▼
               Status Update
```

## Data Layer Architecture

### 1. n8n Data Table: `post_call_logs`

Replaces Google Sheets for structured call logging. Native to n8n - no external API dependencies, no rate limits.

**Schema:**
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Auto-generated primary key |
| processing_id | string | Unique trace ID for this execution |
| conversation_id | string | ElevenLabs conversation ID |
| event_type | string | post_call_transcription / call_initiation_failure |
| agent_id | string | ElevenLabs agent ID |
| customer_name | string | From dynamic_variables |
| customer_phone | string | Caller phone number |
| call_duration_secs | integer | Call duration |
| call_successful | string | success / failure / unknown |
| transcript_summary | string | AI-generated summary |
| budget | string | BANT: Budget |
| timeline | string | BANT: Timeline |
| authority | string | BANT: Authority |
| need | string | BANT: Need |
| crm_person_id | integer | CRM person ID (nullable) |
| crm_updated | boolean | Whether CRM was updated |
| vector_stored | boolean | Whether transcript was vectorized |
| slack_notified | boolean | Whether Slack was notified |
| errors | json | Array of error objects |
| created_at | datetime | When record was created |
| completed_at | datetime | When processing finished |

### 2. Qdrant Vector Database: `call_transcripts`

Stores transcript embeddings for semantic search across all calls.

**Collection Config:**
```json
{
  "collection_name": "call_transcripts",
  "vectors": {
    "size": 1536,
    "distance": "Cosine"
  }
}
```

**Point Payload:**
```json
{
  "conversation_id": "conv_xxx",
  "agent_id": "agent_xxx",
  "customer_name": "John Doe",
  "customer_phone": "+15551234567",
  "call_successful": "success",
  "call_duration_secs": 180,
  "transcript_summary": "...",
  "transcript_text": "agent: Hello... user: Hi...",
  "budget": "50k-100k",
  "timeline": "Q2 2026",
  "created_at": "2026-01-15T..."
}
```

**Use Cases:**
- "Find calls where customer mentioned budget concerns"
- "Show similar conversations to this one"
- "What objections did customers raise last week?"

## Error Handling Strategy

### Retry Policies

| Service | Max Retries | Backoff | On Failure |
|---------|-------------|---------|------------|
| Data Table | 3 | 1s exponential | Queue to dead-letter |
| Qdrant | 2 | 2s linear | Log warning, continue |
| CRM | 3 | 2s linear | Log warning, continue |
| Slack | 0 | N/A | Fire-and-forget |

### Graceful Degradation Matrix

| Component | Fails | Action |
|-----------|-------|--------|
| Data Table | YES | **CRITICAL** - Queue to dead-letter, alert |
| Qdrant | YES | Continue - log warning, mark vector_stored=false |
| CRM | YES | Continue - log warning, mark crm_updated=false |
| Slack | YES | Continue - silent failure |
| Transcript Extract | YES | Continue - skip vectorization |

## Node Specifications

### Core Nodes

1. **Webhook Receiver**
   - Path: `/post-call-bulletproof`
   - Method: POST
   - Response Mode: responseNode
   - webhookId: `elevenlabs-post-call-bulletproof`

2. **Immediate ACK**
   - Type: respondToWebhook
   - Response: `{ received: true, processing_id: "...", timestamp: "..." }`
   - Target: <500ms

3. **Schema Validator**
   - Type: code
   - Validates: type, data.conversation_id, data.agent_id
   - Generates: processing_id, normalized payload

4. **Event Router**
   - Type: switch
   - Outputs: transcription, failure, invalid, fallback

### Data Layer Nodes

5. **Data Table Insert**
   - Type: n8n-nodes-base.n8nTables
   - Operation: insert
   - Table: post_call_logs
   - Retry: 3x, 1s exponential

6. **Generate Embeddings**
   - Type: httpRequest (OpenAI embeddings API)
   - Model: text-embedding-3-small
   - Input: transcript_text + transcript_summary
   - Timeout: 10s

7. **Qdrant Upsert**
   - Type: httpRequest
   - Endpoint: POST /collections/call_transcripts/points
   - Retry: 2x, 2s linear

### Integration Nodes

8. **Slack Notifier**
   - Type: httpRequest
   - Method: POST to webhook URL
   - Timeout: 5s
   - On Error: continue

9. **CRM Prep**
   - Type: code
   - Logic: Build note content, determine label
   - Skip if: crm_person_id is null/0

10. **CRM Note**
    - Type: crm
    - Operation: create note
    - Retry: 3x, 2s

11. **CRM Update**
    - Type: crm
    - Operation: update person
    - Retry: 3x, 2s

### Finalization Nodes

12. **Error Aggregator**
    - Type: code
    - Collects: All branch results
    - Calculates: overall_success, error array

13. **Status Update**
    - Type: n8n-nodes-base.n8nTables
    - Operation: update
    - Updates: completed_at, errors, status flags

## Qdrant Setup

### Prerequisites
```bash
# Docker compose for local Qdrant
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

### Collection Creation
```bash
curl -X PUT 'http://localhost:6333/collections/call_transcripts' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    }
  }'
```

### n8n Integration
- Use HTTP Request node to Qdrant REST API
- Or install `n8n-nodes-qdrant` community node

## Security Considerations

1. **API Keys**: Store in n8n credentials, never in workflow JSON
2. **PII in Vectors**: Qdrant payload contains customer data - secure access
3. **Webhook Auth**: Consider adding HMAC signature verification for ElevenLabs
4. **Rate Limiting**: Qdrant and CRM have rate limits - respect backoff

## Migration Path

1. **Phase 1**: Deploy new workflow alongside existing
2. **Phase 2**: Update ElevenLabs agent to use new webhook URL
3. **Phase 3**: Monitor for 48h, verify data integrity
4. **Phase 4**: Deactivate old workflow
5. **Phase 5**: Archive old workflow to `old/` directory

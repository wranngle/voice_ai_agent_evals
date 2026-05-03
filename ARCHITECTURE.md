# Voice AI Agents - System Architecture

## Overview

This system powers conversational AI voice agents using ElevenLabs, with n8n orchestrating data enrichment, CRM integration, and post-call processing.

## System Diagram

```
                                    +------------------+
                                    |   Twilio/Phone   |
                                    +--------+---------+
                                             |
                                             v
+------------------------------------------+-------------------------------------------+
|                              ElevenLabs Conversational AI                           |
|  +-------------+    +------------------+    +----------------+    +--------------+  |
|  | Voice Agent |    | Client Initiation|    | Tool Execution |    | Post-Call    |  |
|  | (Sarah)     |<-->| Data Webhook     |<-->| (SMS, etc.)    |<-->| Webhook      |  |
|  +-------------+    +--------+---------+    +-------+--------+    +------+-------+  |
+------------------------------------------+-------------------------------------------+
                               |                      |                    |
                               v                      v                    v
+------------------------------------------+-------------------------------------------+
|                              n8n Workflow Engine                                    |
|  +------------------+    +------------------+    +------------------+               |
|  | Client Initiation|    | Sarah SMS Tool   |    | Post-Call        |               |
|  | Workflow         |    | Workflow         |    | Workflow         |               |
|  | ID: 81W6PAGZfSi8 |    |                  |    |                  |               |
|  +--------+---------+    +--------+---------+    +--------+---------+               |
+------------------------------------------+-------------------------------------------+
            |                      |                    |
            v                      v                    v
+------------------------------------------+-------------------------------------------+
|                              External Services                                      |
|  +----------+  +---------+  +----------+  +---------+  +----------+                |
|  | CRM|  | Google  |  | Twilio   |  | Cal.com |  | SMTP2GO  |                |
|  | CRM      |  | Sheets  |  | SMS      |  | Booking |  | Email    |                |
|  +----------+  +---------+  +----------+  +---------+  +----------+                |
+------------------------------------------------------------------------------------|
```

## Call Lifecycle

### 1. Incoming Call (Client Initiation)

```
Phone Call → Twilio → ElevenLabs Agent
                          ↓
              client_initiation_data webhook
                          ↓
              n8n: Client Initiation Workflow
                          ↓
         ┌────────────────┴────────────────┐
         ↓                                 ↓
   CRM Lookup              Google Sheets Lookup
   (CRM customer data)           (Call history)
         ↓                                 ↓
         └────────────────┬────────────────┘
                          ↓
                   Merge & Transform
                          ↓
              Return dynamic_variables to ElevenLabs
              - customer_name
              - account_tier (New/Bronze/Silver/Gold)
              - call_history
              - interaction_count
```

### 2. During Call (Tool Execution)

```
User Request → Sarah Agent → Tool Call
                               ↓
                    n8n: Tool Webhook (e.g., SMS)
                               ↓
                    Validate Parameters
                               ↓
                    Execute Action (Twilio)
                               ↓
                    Return Result to Agent
```

### 3. Post-Call Processing

```
Call Ends → ElevenLabs → post_call_webhook
                              ↓
              n8n: Post-Call Workflow
                              ↓
         ┌────────────────────┼────────────────────┐
         ↓                    ↓                    ↓
   Update CRM         Send Follow-up        Log Analytics
   (call outcome)     (email/SMS)          (duration, outcome)
```

## Workflow Details

### Client Initiation Data Workflow

**Webhook:** `POST /webhook/client-initiation-data`
**Workflow ID:** `81W6PAGZfSi81ZQ9`
**Timeout:** 500ms (hard limit from ElevenLabs)

#### Nodes

| Node | Type | Purpose |
|------|------|---------|
| Webhook: Client Lookup | webhook | Entry point, receives caller_id, agent_id |
| Extract & Validate Call Metadata | set | Parse body, set start_time |
| Validate Agent ID | if | Ensure correct agent |
| CRM: Lookup Person | httpRequest | CRM customer lookup by phone |
| Google Sheets: Lookup Call History | googleSheets | Historical interaction data |
| Merge & Transform Data | code | Combine sources, calculate tier |
| Log Execution Metrics | set | Performance tracking |
| Check Performance Threshold | if | Alert if >500ms |
| Respond: Client Initiation Data | respondToWebhook | Return ElevenLabs format |

#### Response Format

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "customer_name": "John Smith",
    "customer_first_name": "John",
    "company": "Acme Corp",
    "industry": "Technology",
    "account_tier": "Gold",
    "call_history": "Last call: 2026-01-15",
    "interaction_count": 12,
    "last_topic": "Pricing discussion",
    "notes": "Interested in enterprise plan",
    "lookup_success": true,
    "data_source": "crm",
    "secret__crm_person_id": 12345,
    "secret__crm_org_id": 67890,
    "secret__google_sheet_row": 42
  },
  "conversation_config_override": {
    "agent": {
      "first_message": "Hi John, this is Sarah from ExampleCo. I see you're one of our premium clients - how can I help you today?"
    }
  }
}
```

### Account Tier Logic

| Tier | Condition | Greeting Style |
|------|-----------|----------------|
| Gold | CRM account_tier = Gold | VIP personalized |
| Silver | 6-15 past interactions | Returning customer |
| Bronze | 1-5 past interactions | Familiar |
| New | 0 past interactions | Generic welcome |

## Data Flow

### Incoming Request

```json
{
  "caller_id": "+15551234567",
  "agent_id": "agent_xxxx_demo",
  "called_number": "+15550100",
  "call_sid": "CA1234567890"
}
```

### Data Sources Priority

1. **CRM** (highest priority) - Real-time CRM data
2. **Google Sheets** - Historical call logs
3. **Defaults** - Fallback for unknown callers

### Merge Strategy

- Customer name: CRM > Sheets > "there"
- Company: CRM only
- Interaction count: Sheets only
- Account tier: CRM > Calculated from interaction count

## Error Handling

### Graceful Degradation

| Failure | Behavior |
|---------|----------|
| CRM timeout | Continue with Sheets data |
| Sheets timeout | Continue with CRM data |
| Both fail | Return default response |
| Invalid agent_id | Return 400 error |

### Fallback Response

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "customer_name": "there",
    "customer_first_name": "there",
    "account_tier": "New",
    "call_history": "First-time caller",
    "lookup_success": false,
    "data_source": "none"
  }
}
```

## Performance Requirements

| Metric | Target | Critical |
|--------|--------|----------|
| Response time | <200ms | <500ms |
| Success rate | >99% | >95% |
| Data enrichment rate | >80% | >50% |

## Credentials Required

| Service | Credential Type | n8n Credential ID |
|---------|-----------------|-------------------|
| CRM | API Token | crmApi |
| Google Sheets | OAuth2 | googleSheetsOAuth2 |
| Twilio | API Key + Secret | twilioApi |
| ElevenLabs | API Key | (env var) |

## Monitoring

### Key Metrics

- `execution_time_ms` - Webhook response latency
- `enrichment_success` - Whether customer data was found
- `data_source` - Which source provided data
- `account_tier` - Customer tier distribution

### Alerts

- Response time >500ms sustained
- Error rate >5%
- Credential failures

## Troubleshooting

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Empty response | Data flow broken | Check includeOtherFields |
| "Credentials not found" | Missing n8n credentials | Configure in n8n UI |
| Timeout errors | External API slow | Check CRM/Sheets status |
| Wrong routing | If node misconfigured | Verify connections |

### Debug Steps

1. Check n8n execution history for the workflow
2. Verify webhook URL is correct
3. Test with curl: `curl -X POST https://your-n8n-host.example.com/webhook/client-initiation-data -H "Content-Type: application/json" -d '{"caller_id":"+15551234567","agent_id":"agent_xxxx_demo"}'`
4. Check credential status in n8n

## File Structure

```
voice_ai_agent_evals/
├── ARCHITECTURE.md          # This file
├── CLAUDE.md                # AI assistant instructions
├── README.md                # Project overview
├── supersystem/
│   ├── client-initiation-data-prod.json  # Main workflow
│   ├── tools/               # Tool configurations
│   └── monitoring/          # Dashboards
└── tests/                   # Test scripts
```

## Related Documentation

- [ElevenLabs Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai)
- [n8n Workflow Documentation](https://docs.n8n.io)
- [CRM API Reference](https://developers.crm.com/docs/api/v1)

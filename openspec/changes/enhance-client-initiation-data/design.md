# Design: Client Initiation Data Webhook Architecture

**Change ID:** `enhance-client-initiation-data`
**Status:** DRAFT
**Created:** 2026-01-19

## Architecture Overview

```
┌─────────────┐
│   Twilio    │ Inbound call from customer
│  (Phone)    │
└──────┬──────┘
       │ 1. Call received
       ▼
┌─────────────────────┐
│   ElevenLabs Agent  │
│   (Sarah Wrangle)   │
│                     │
│ Security Settings:  │
│ ✓ Fetch client data │
│ ✓ Webhook enabled   │
└──────┬──────────────┘
       │ 2. Before agent answers,
       │    POST to webhook with:
       │    - caller_id
       │    - agent_id
       │    - called_number
       │    - call_sid
       ▼
┌──────────────────────────────────────────────┐
│         n8n Client Lookup Webhook            │
│  URL: https://your-n8n-host.example.com/webhook/      │
│       client-initiation-data                 │
└──────┬───────────────────────────────────────┘
       │
       │ 3. Parallel Lookups (race condition)
       │
       ├──────────────────┬──────────────────────┐
       ▼                  ▼                      ▼
┌─────────────┐    ┌─────────────┐      ┌─────────────┐
│  CRM  │    │   Google    │      │    Cache    │
│  CRM API    │    │   Sheets    │      │   (Redis)   │
│             │    │  Call Logs  │      │  Optional   │
└─────────────┘    └─────────────┘      └─────────────┘
       │                  │                      │
       │ 4. Merge data (CRM > Sheets > Cache)
       │                  │                      │
       └──────────────────┴──────────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  Transform   │
                   │  to Client   │
                   │ Initiation   │
                   │     Data     │
                   └──────┬───────┘
                          │ 5. Return JSON response
                          ▼
       ┌──────────────────────────────────────┐
       │ conversation_initiation_client_data  │
       │ {                                    │
       │   "dynamic_variables": {...},        │
       │   "conversation_config_override": {} │
       │ }                                    │
       └──────────────────────────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │  ElevenLabs     │
                │  Injects vars   │
                │  into agent     │
                └─────────────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │  Agent responds     │
                │  "Welcome back,     │
                │   {{customer_name}} │
                │   from {{company}}" │
                └─────────────────────┘
```

## Component Details

### 1. n8n Webhook: Client Initiation Data Orchestrator

**Workflow Name:** `[PROD] Client Initiation Data - Sarah`
**Webhook Path:** `/client-initiation-data`
**Method:** POST
**Timeout:** 500ms (hard limit)

**Node Flow:**

```
1. Webhook Trigger (n8n-nodes-base.webhook)
   ├─ webhookId: "client-initiation-data-example-agent"
   ├─ responseMode: "responseNode"
   └─ timeout: 500ms

2. Extract Call Metadata (n8n-nodes-base.set)
   ├─ caller_id (phone number)
   ├─ agent_id (validate = example-agent's ID)
   ├─ called_number (Twilio number)
   └─ call_sid (Twilio unique ID)

3. Cache Lookup (n8n-nodes-base.redis) [OPTIONAL]
   ├─ Key: `caller:{phone}:enriched`
   ├─ TTL check: <24 hours?
   └─ If HIT: Skip to Transform

4A. CRM Lookup (n8n-nodes-base.httpRequest)
    ├─ Endpoint: /persons/search
    ├─ Query: phone = caller_id
    ├─ Timeout: 300ms
    └─ Extract: name, company, custom_fields

4B. Google Sheets Lookup (n8n-nodes-base.googleSheets)
    ├─ Sheet: "Call History"
    ├─ Filter: phone = caller_id
    ├─ Timeout: 300ms
    └─ Extract: last_interaction, notes, call_count

5. Merge & Transform (n8n-nodes-base.code)
   ├─ Merge strategy: Combine all sources with conflict resolution (most recent or CRM > Sheets)
   ├─ Build dynamic_variables object
   ├─ Build conversation_config_override (if VIP)
   └─ Apply variable naming conventions

6. Cache Write (n8n-nodes-base.redis) [OPTIONAL]
   ├─ Key: `caller:{phone}:enriched`
   ├─ TTL: 24 hours
   └─ Value: Merged data JSON

7. Respond Success (n8n-nodes-base.respondToWebhook)
   └─ Return conversation_initiation_client_data JSON

ERROR PATH:
└─ Respond Fallback (n8n-nodes-base.respondToWebhook)
   └─ Return minimal data (no enrichment)
```

### 2. Data Schema: conversation_initiation_client_data

**Response Structure:**

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    // Personalization (visible to LLM)
    "customer_name": "string",
    "customer_first_name": "string",
    "company": "string",
    "industry": "string",
    "account_tier": "string",  // "Bronze" | "Silver" | "Gold" | "New"
    "call_history": "string",  // "First-time caller" | "Called 3 days ago..."
    "interaction_count": "number",
    "last_topic": "string",
    "notes": "string",

    // Secret variables (hidden from LLM, available in tools)
    "secret__crm_person_id": "number",
    "secret__crm_org_id": "number",
    "secret__google_sheet_row": "number",

    // System context
    "lookup_success": "boolean",
    "data_source": "string"  // "crm" | "sheets" | "cache" | "none"
  },
  "conversation_config_override": {
    "agent": {
      "first_message": "string",  // VIP/returning customer override
      "prompt": {
        "prompt": "string"  // Emergency: prepend priority handling
      }
    }
  }
}
```

**Variable Naming Conventions:**

- **Regular variables**: `customer_name`, `company`, `account_tier`
  - Lowercase, underscores
  - Generic names (reusable across agents)
  - Used in prompts: `{{customer_name}}`

- **Secret variables**: `secret__crm_person_id`
  - Prefix: `secret__`
  - Never sent to LLM
  - Available in tool parameters

- **System variables**: `system__caller_id`, `system__conversation_id`
  - Auto-provided by ElevenLabs
  - Read-only

### 3. Dynamic Variable Usage in Agent

**System Prompt Enhancement:**

```markdown
# IDENTITY
You are Sarah, a lead specialist for ExampleCo's "the AI hotline"...

# CONTEXT AWARENESS
You have access to caller context through variables:
- Customer name: {{customer_name}} (use for personalization)
- Company: {{company}} (reference in value prop)
- Account tier: {{account_tier}} (affects priority)
- Call history: {{call_history}} (avoid re-asking)

If {{account_tier}} = "Gold", prioritize their needs.
If {{interaction_count}} > 0, acknowledge: "Good to hear from you again"
If {{call_history}} contains recent demo, ask about follow-up.

# GUARDRAILS
- Never mention variable names ({{...}}) verbatim
- If variable is empty, proceed with generic approach
- Never fabricate data - only use provided variables
```

**First Message Override Logic:**

```javascript
// In n8n Transform node
if (data.crm?.is_vip) {
  return {
    first_message: `Hi {{customer_first_name}}, this is Sarah from ExampleCo. I see you're one of our premium clients - how can I help you today?`
  };
} else if (data.sheets?.call_count > 2) {
  return {
    first_message: `Hi {{customer_first_name}}, great to hear from you again! This is Sarah from ExampleCo.`
  };
} else {
  return null; // Use default first_message from agent config
}
```

### 4. Tool Integration: SMS with Secret Variables

**Tool Configuration (in ElevenLabs):**

```json
{
  "name": "send_sms",
  "description": "Send SMS booking link",
  "parameters": {
    "type": "object",
    "properties": {
      "phone": {
        "type": "string",
        "description": "Phone number"
      },
      "crm_id": {
        "type": "number",
        "description": "CRM person ID for tracking",
        "default": "{{secret__crm_person_id}}"
      }
    }
  },
  "url": "https://your-n8n-host.example.com/webhook/send-sms"
}
```

**Benefits:**
- ✅ SMS webhook receives `crm_id` automatically
- ✅ No need to re-lookup caller in CRM
- ✅ Secure (LLM never sees the ID)
- ✅ Enables automatic CRM note creation

### 5. Error Handling & Graceful Degradation

**Timeout Strategy:**

| Scenario | Timeout | Fallback |
|----------|---------|----------|
| **Cache hit** | 50ms | Continue |
| **CRM lookup** | 300ms | Try Sheets |
| **Sheets lookup** | 300ms | Return generic |
| **Total webhook** | 500ms | Return minimal data |

**Fallback Response (No Data):**

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "customer_name": "there",
    "account_tier": "New",
    "call_history": "First-time caller",
    "interaction_count": 0,
    "lookup_success": false,
    "data_source": "none"
  }
}
```

Agent still functions normally, just without personalization.

### 6. Security Considerations

**PII Protection:**

1. **Secret variables** for all IDs (CRM, Sheet row numbers)
2. **No sensitive data** in regular variables (SSN, payment info)
3. **Audit logging** of all enriched data
4. **Webhook authentication** via n8n API keys
5. **HTTPS only** for all webhooks

**Variable Sanitization:**

```javascript
// In n8n Transform node
function sanitizeForLLM(value) {
  if (!value) return "";

  // Remove PII patterns
  value = value.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED]"); // SSN
  value = value.replace(/\b\d{16}\b/g, "[REDACTED]"); // CC numbers

  // Truncate long strings
  if (value.length > 200) {
    value = value.substring(0, 197) + "...";
  }

  return value;
}
```

## Performance Targets

| Metric | Target | Monitoring |
|--------|--------|------------|
| **Webhook response time** | P50: <200ms, P95: <500ms | n8n execution logs |
| **Cache hit rate** | >80% (after 1 week) | Redis stats |
| **CRM API latency** | P95: <250ms | n8n node timing |
| **Sheets API latency** | P95: <300ms | n8n node timing |
| **Enrichment success rate** | >90% | Custom metric in n8n |

## Alternative Approaches Considered

### Option A: Client-side SDK integration
❌ **Rejected** - Requires JS/iOS/Android SDKs, not applicable to Twilio inbound calls

### Option B: Custom LLM server with elevenlabs_extra_body
❌ **Rejected** - Over-engineered for this use case, adds hosting complexity

### Option C: Tool-based data fetching (during call)
❌ **Rejected** - Adds latency, interrupts conversation flow, poor UX

### Option D: Webhook-based pre-call enrichment ✅
✅ **SELECTED** - Native ElevenLabs feature, clean architecture, optimal UX

## Testing Strategy

**Unit Tests (n8n workflow):**
1. Mock ElevenLabs webhook call → verify response structure
2. CRM API failure → verify fallback to Sheets
3. All APIs timeout → verify generic response
4. Cache hit → verify no external API calls

**Integration Tests:**
1. Real call from known number → verify personalized greeting
2. Real call from unknown number → verify generic greeting
3. Real call from VIP → verify first_message override
4. SMS tool call → verify crm_id passed correctly

**Load Tests:**
1. 100 concurrent webhook calls → verify <500ms P95
2. Cache warm → verify <100ms P50

## Rollout Plan

**Phase 1: Development (Week 1)**
- Build n8n workflow in DEV environment
- Test with mock data
- Validate response schema

**Phase 2: Staging (Week 2)**
- Deploy to n8n production
- Configure Sarah agent's webhook URL (Security tab)
- Test with real calls to Agent's dev number
- Monitor for 3 days

**Phase 3: Production Rollout (Week 3)**
- Enable for 10% of calls (A/B test)
- Monitor latency, success rate
- Gradually increase to 100%
- Document lessons learned

**Rollback Plan:**
- Disable webhook in ElevenLabs Security tab (instant)
- Agent reverts to generic behavior
- No data loss, no service interruption

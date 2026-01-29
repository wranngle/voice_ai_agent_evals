# Design: Universal LLM Extraction Engine

## Architecture Overview

```
Execute Workflow Trigger
  └→ Validate Inputs (Code)
       ├→ [invalid] Error Response
       └→ [valid] Split by Category (SplitInBatches)
            └→ Per category:
                 Build 5-Component Prompt (Code)
                   └→ Call Gemini 3 Pro (httpRequest, JSON mode)
                        └→ Parse & Validate Response (Code)
                             └→ Transform to Standard Envelope (Code)
  Merge All Results (Aggregate)
    └→ Post-Processing / Dedup (Code)
         └→ Return to Caller
```

## Subworkflow Interface

### Input (from Execute Workflow caller)

```json
{
  "transcript": "agent: Hello... user: Hi...",
  "agent_system_prompt": "You are Sarah, an SDR...",
  "extraction_config": { "categories": [...], "global_context": {...} },
  "metadata": { "conversation_id": "conv_xxx", "agent_id": "agent_xxx" }
}
```

### Output (returned to caller)

```json
{
  "extraction_id": "ext_uuid",
  "timestamp": "2026-01-29T...",
  "model": "gemini-3-pro",
  "categories_processed": 3,
  "fields": [
    {
      "category": "sales",
      "field_id": "deal_stage",
      "value": "qualification",
      "rationale": "Caller asked about pricing and features...",
      "original_prompt": "What stage of the sales process is this call at?",
      "confidence": 0.87,
      "strictness_applied": "high",
      "validation_passed": true
    }
  ],
  "errors": []
}
```

## 5-Component Prompt Architecture

Generalized from archived `transcript-field-extractor-v2` (10 nodes, 22 fields, 4 sections).

| Component | Content | Source |
|-----------|---------|--------|
| A | Raw transcript formatted as `ROLE: message` lines | `transcript` input |
| B | Agent system prompt (provides business context) | `agent_system_prompt` input |
| C | Response JSON schema for this category's fields | Generated from `extraction_config.categories[n].fields` |
| D | Field-level extraction instructions (per-field micro-prompts, types, constraints) | `extraction_config.categories[n].fields[].prompt` + type info |
| E | Extraction rules: strictness level, rationale requirements, null handling, confidence scoring | `extraction_config.categories[n].context_rules` + global rules |

### Prompt Assembly (Code Node)

```
You are a structured data extraction engine.

== TRANSCRIPT ==
{Component A}

== CONTEXT ==
{Component B}

== RESPONSE SCHEMA ==
Return JSON matching this structure:
{Component C}

== FIELD INSTRUCTIONS ==
{Component D}

== EXTRACTION RULES ==
{Component E}
```

## Extraction Config Schema

```json
{
  "categories": [{
    "category_id": "sales",
    "description": "Sales-related fields from BANT methodology",
    "context_rules": {
      "default_strictness": "medium",
      "require_rationale": true,
      "null_behavior": "return_null_with_rationale"
    },
    "fields": [{
      "field_id": "deal_stage",
      "type": "enum",
      "values": ["discovery", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"],
      "prompt": "What stage of the sales process is this call at? Consider: Did the caller express a specific need? Did they mention budget or timeline? Are they evaluating options?",
      "strictness": "high",
      "required": true,
      "default_value": "discovery"
    }, {
      "field_id": "budget_mentioned",
      "type": "string",
      "prompt": "Extract any budget, price range, or financial constraints mentioned. Include exact figures if stated.",
      "strictness": "medium",
      "required": false,
      "default_value": null
    }]
  }],
  "global_context": {
    "agent_identity": "SDR for a B2B company",
    "business_domain": "sales",
    "language": "en"
  }
}
```

## Dynamic Strictness Inference

When a field does not explicitly set `strictness`, the engine infers it:

| Inferred Level | Conditions |
|----------------|------------|
| **high** | `type` is `boolean`, `phone`, `email`; enum with ≤5 values; field has `validation.pattern` |
| **medium** | `type` is `enum` with >5 values; `type` is `string` with `required: true` |
| **low** | `type` is `string` with `required: false`; field_id contains "summary", "notes", "description" |

### Strictness Behavior

| Level | Enum Handling | Null Handling | Confidence Threshold |
|-------|---------------|---------------|---------------------|
| **high** | Exact match only, reject near-misses | Return null + rationale if ambiguous | ≥0.8 required |
| **medium** | Best match, allow "other" | Return "unknown" fallback | ≥0.5 required |
| **low** | Flexible interpretation | Return null silently | No minimum |

## Standard Output Envelope (Per Field)

```json
{
  "category": "sales",
  "field_id": "deal_stage",
  "value": "qualification",
  "rationale": "Caller asked about pricing and features, indicating they've moved past discovery",
  "original_prompt": "What stage of the sales process is this call at?",
  "confidence": 0.87,
  "strictness_applied": "high",
  "validation_passed": true
}
```

**Validation rules per type:**
- `enum`: value must be in `values` array
- `boolean`: must be `true`, `false`, or `null`
- `phone`: must match E.164 pattern or null
- `email`: must match email regex or null
- `string`: any non-empty string or null (if not required)

## 6 Default Categories

### 1. sales
| Field | Type | Strictness |
|-------|------|-----------|
| deal_stage | enum(6) | high |
| budget_mentioned | string | medium |
| decision_authority | enum(caller/other/unknown) | medium |
| timeline | string | medium |
| next_steps | string | low |

### 2. support
| Field | Type | Strictness |
|-------|------|-----------|
| issue_type | string | medium |
| urgency | enum(low/medium/high/critical) | high |
| resolution_status | enum(resolved/unresolved/escalated) | high |
| escalation_needed | boolean | high |

### 3. external_contacts
| Field | Type | Strictness |
|-------|------|-----------|
| contact_name | string | high |
| contact_phone | phone | high |
| contact_email | email | high |
| company_name | string | medium |

### 4. internal_contacts
| Field | Type | Strictness |
|-------|------|-----------|
| requested_person | string | high |
| department | string | medium |
| transfer_reason | string | low |

### 5. external_company
| Field | Type | Strictness |
|-------|------|-----------|
| company_industry | string | medium |
| company_size | string | medium |
| company_location | string | medium |

### 6. internal_company
| Field | Type | Strictness |
|-------|------|-----------|
| site_location | string | medium |
| service_area | string | medium |
| account_status | enum(active/inactive/prospect/churned) | high |

## Node Specifications (~12 nodes)

### 1. Execute Workflow Trigger
- Type: `n8n-nodes-base.executeWorkflowTrigger`
- Receives: transcript, agent_system_prompt, extraction_config, metadata

### 2. Validate Inputs (Code)
- Checks: transcript is non-empty string, extraction_config has ≥1 category, each category has ≥1 field
- Generates: `extraction_id` (UUID)
- Outputs: 2 branches (valid / invalid)

### 3. Error Response
- Returns: `{ extraction_id, error: "...", fields: [], errors: [{ type: "validation", message: "..." }] }`

### 4. Split by Category (SplitInBatches)
- Input: `extraction_config.categories` array
- Batch size: 1 (sequential to avoid Gemini rate limits)

### 5. Build 5-Component Prompt (Code)
- Assembles components A-E from current category + shared inputs
- Generates JSON schema from field definitions
- Applies strictness inference for fields missing explicit strictness

### 6. Call Gemini 3 Pro (httpRequest)
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent`
- Auth: API key from n8n credential
- Body: `{ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }`
- Timeout: 30s
- On Error: continueErrorOutput

### 7. Parse & Validate Response (Code)
- Parses JSON response from Gemini
- Validates each field against its type constraints
- Sets `validation_passed` flag per field
- Repairs common issues (trim whitespace, normalize enums to lowercase)

### 8. Transform to Standard Envelope (Code)
- Maps parsed fields to standard envelope format
- Adds: category, original_prompt, strictness_applied, confidence

### 9. Merge All Results (Aggregate)
- Type: `n8n-nodes-base.aggregate`
- Collects all category results into single array

### 10. Post-Processing / Dedup (Code)
- Deduplicates fields if same field_id appears in multiple categories
- Sorts by category → field_id
- Builds top-level response envelope with extraction_id, timestamp, model, fields, errors

### 11. Return to Caller
- Passes final envelope back via Execute Workflow return

## Integration with harden-post-call-webhook

### Fan-Out Addition

```
Fan-Out (Parallel)
├── DataTbl Logger (existing)
├── Slack Notifier (existing)
├── CRM Graceful (existing)
├── LLM Extraction Engine (NEW) ← Execute Workflow node
└── Qdrant Embeddings (existing)
```

### Execute Workflow Node Config

```json
{
  "type": "n8n-nodes-base.executeWorkflow",
  "parameters": {
    "source": "database",
    "workflowId": "<extraction-engine-workflow-id>",
    "workflowInputs": {
      "mappingMode": "defineBelow",
      "value": {
        "transcript": "={{ $json.transcript_text }}",
        "agent_system_prompt": "={{ $json.agent_system_prompt }}",
        "extraction_config": "={{ $json.extraction_config }}",
        "metadata": {
          "conversation_id": "={{ $json.conversation_id }}",
          "agent_id": "={{ $json.agent_id }}"
        }
      }
    }
  },
  "onError": "continueErrorOutput"
}
```

### Data Table Integration

Extraction results map to existing `post_call_logs` BANT columns:
- `budget` ← `fields.find(f => f.field_id === 'budget_mentioned').value`
- `timeline` ← `fields.find(f => f.field_id === 'timeline').value`
- `authority` ← `fields.find(f => f.field_id === 'decision_authority').value`
- `need` ← `fields.find(f => f.field_id === 'deal_stage').value`

## Governance Compliance

- **Name**: `[DEV] LLM Extraction Engine` (phase tag, no version numbers)
- **Webhook nodes**: All get explicit `webhookId` (Layer 9 enforced)
- **LLM model**: `gemini-3-pro` (Layer 3 enforced default for n8n text nodes)
- **Creation**: Via `mcp__n8n-mcp__n8n_create_workflow` (triggers Layer 9 + 10 + 10.1 validation)
- **Credentials**: Referenced by n8n credential ID, never hardcoded

## Precedent: Archived v2 Differences

| Aspect | Archived v2 | New Engine |
|--------|-------------|------------|
| Fields | 22 fixed across 4 sections | Dynamic per extraction_config |
| Categories | Implicit (requestor/contact/request/routing) | Explicit, user-defined |
| Prompt | Single monolithic prompt | 5-component, category-scoped |
| Output | Flat JSON object | Standard envelope with rationale + confidence |
| Strictness | Uniform | 3-tier dynamic |
| Reusability | None (hardcoded) | Full (subworkflow + config) |
| Credentials | Hardcoded API key | n8n credential reference |

# Implementation Tasks: Client Initiation Data Webhook

**Change ID:** `enhance-client-initiation-data`
**Status:** DRAFT
**Created:** 2026-01-19

## Task Breakdown

### Phase 1: Setup & Configuration (1-2 hours)

#### Task 1.1: Define Dynamic Variables in Agent Registry
- **File:** `agent-registry.yaml`
- **Action:** Add `dynamic_variables` and `client_lookup_webhook` fields to Sarah agent entry
- **Verification:** YAML validates, all variables documented
- **Dependencies:** None

```yaml
example-agent:
  # ... existing fields ...
  dynamic_variables:
    - name: customer_name
      type: string
      description: "Full name of the caller"
    - name: customer_first_name
      type: string
      description: "First name only"
    - name: company
      type: string
      description: "Company name"
    - name: account_tier
      type: string
      description: "Bronze|Silver|Gold|New"
    - name: call_history
      type: string
      description: "Previous interaction summary"
    - name: secret__crm_person_id
      type: number
      description: "CRM person ID (hidden from LLM)"
  client_lookup_webhook: "https://your-n8n-host.example.com/webhook/client-initiation-data"
```

#### Task 1.2: Research ElevenLabs Agent Security Settings
- **Action:** Document how to enable "Fetch conversation initiation data for inbound Twilio calls"
- **Deliverable:** Create `docs/elevenlabs-client-initiation-setup.md` with screenshots
- **Verification:** Can locate the setting in ElevenLabs UI
- **Dependencies:** None

#### Task 1.3: Create OpenSpec Spec for Client Data Enrichment
- **File:** `openspec/changes/enhance-client-initiation-data/specs/client-data-enrichment/spec.md`
- **Action:** Define requirements for webhook behavior, response format, error handling
- **Verification:** `openspec validate` passes
- **Dependencies:** Task 1.1 complete

---

### Phase 2: n8n Workflow Development (3-4 hours)

#### Task 2.1: Create Webhook Trigger Node
- **Workflow:** `[PROD] Client Initiation Data - Sarah`
- **Action:**
  1. Create new workflow in n8n
  2. Add webhook trigger node
  3. Configure path: `/client-initiation-data`
  4. Set webhookId: `client-initiation-data-example-agent`
  5. Set responseMode: `responseNode`
- **Verification:** Webhook URL accessible, returns 200 on test POST
- **Dependencies:** None
- **Parallel with:** Task 2.2-2.7 (build sequentially but can plan in parallel)

#### Task 2.2: Extract & Validate Call Metadata
- **Node Type:** `n8n-nodes-base.set`
- **Action:**
  1. Extract: `caller_id`, `agent_id`, `called_number`, `call_sid`
  2. Validate: `agent_id` matches Agent's ID
  3. Normalize phone number format (+1XXXXXXXXXX)
- **Verification:**
  - Test with mock payload → correct extraction
  - Invalid agent_id → returns error response
- **Dependencies:** Task 2.1

#### Task 2.3: Implement CRM Lookup
- **Node Type:** `n8n-nodes-base.httpRequest`
- **Action:**
  1. Configure CRM API credentials
  2. Endpoint: `GET /persons/search?term={{caller_id}}&fields=phone`
  3. Timeout: 300ms
  4. Error handling: Continue on failure
- **Data to Extract:**
  - Person name (first + last)
  - Organization name
  - Custom fields: `account_tier`, `industry`
  - Person ID (for secret variable)
- **Verification:**
  - Known number → returns person data
  - Unknown number → returns null (no error)
  - Timeout → continues to next node
- **Dependencies:** Task 2.2

#### Task 2.4: Implement Google Sheets Lookup
- **Node Type:** `n8n-nodes-base.googleSheets`
- **Action:**
  1. Configure Google Sheets credentials
  2. Sheet: "Call History" (identify actual sheet name)
  3. Operation: Lookup row where `phone = caller_id`
  4. Timeout: 300ms
- **Data to Extract:**
  - Last interaction date/summary
  - Call count
  - Notes
  - Row number (for secret variable)
- **Verification:**
  - Known caller → returns history
  - New caller → returns null
  - Timeout → continues to next node
- **Dependencies:** Task 2.2
- **Parallel with:** Task 2.3

#### Task 2.5: Merge & Transform Data
- **Node Type:** `n8n-nodes-base.code`
- **Action:**
  1. Implement merge logic: CRM > Sheets > Defaults
  2. Build `dynamic_variables` object per schema
  3. Sanitize strings (remove PII, truncate)
  4. Build `conversation_config_override` for VIP/returning customers
  5. Calculate `account_tier` if missing (based on call_count)
- **Logic:**
  ```javascript
  const crm = $node["CRM Lookup"].json;
  const sheets = $node["Google Sheets Lookup"].json;

  const dynamicVars = {
    customer_name: crm?.name || sheets?.name || "there",
    customer_first_name: crm?.name?.split(' ')[0] || "there",
    company: crm?.org_name || "",
    account_tier: crm?.account_tier || (sheets?.call_count > 5 ? "Silver" : "New"),
    call_history: sheets?.last_interaction || "First-time caller",
    interaction_count: sheets?.call_count || 0,
    notes: sanitize(sheets?.notes || ""),
    secret__crm_person_id: crm?.id || 0,
    secret__google_sheet_row: sheets?.row || 0,
    lookup_success: !!(crm || sheets),
    data_source: crm ? "crm" : (sheets ? "sheets" : "none")
  };

  const override = buildOverride(dynamicVars);

  return {
    json: {
      type: "conversation_initiation_client_data",
      dynamic_variables: dynamicVars,
      conversation_config_override: override
    }
  };
  ```
- **Verification:**
  - Test with CRM data → correct mapping
  - Test with Sheets data only → correct fallback
  - Test with no data → generic values
  - VIP account → first_message override present
- **Dependencies:** Task 2.3, 2.4

#### Task 2.6: Implement Response Node
- **Node Type:** `n8n-nodes-base.respondToWebhook`
- **Action:**
  1. Connect from Task 2.5 (success path)
  2. Set response body: `{{ $json }}`
  3. Set content-type: `application/json`
- **Verification:** Returns valid conversation_initiation_client_data JSON
- **Dependencies:** Task 2.5

#### Task 2.7: Implement Error Fallback Response
- **Node Type:** `n8n-nodes-base.respondToWebhook`
- **Action:**
  1. Add error handler on previous nodes
  2. Return minimal data (generic greeting)
  3. Include error flag for debugging
- **Response:**
  ```json
  {
    "type": "conversation_initiation_client_data",
    "dynamic_variables": {
      "customer_name": "there",
      "account_tier": "New",
      "lookup_success": false,
      "error": "Webhook timeout or API failure"
    }
  }
  ```
- **Verification:** Simulated API failures → returns fallback
- **Dependencies:** Task 2.1-2.6

#### Task 2.8: Add Workflow Monitoring & Logging
- **Node Type:** `n8n-nodes-base.set` (optional logging node)
- **Action:**
  1. Log execution time for each node
  2. Log enrichment success/failure
  3. Log data source used
  4. Optionally send to Slack if P95 > 500ms
- **Verification:** n8n execution log shows timing breakdowns
- **Dependencies:** Task 2.6, 2.7

---

### Phase 3: Agent Configuration (1 hour)

#### Task 3.1: Update Sarah Agent System Prompt
- **Action:**
  1. Use MCP tool: `mcp__elevenlabs-mcp__get_agent` to fetch current prompt
  2. Add "CONTEXT AWARENESS" section with variable usage instructions
  3. Add guardrails for empty variables
  4. Update using `mcp__elevenlabs-mcp__update_agent`
- **Prompt Addition:**
  ```markdown
  # CONTEXT AWARENESS
  You have access to caller context:
  - Customer name: {{customer_name}}
  - Company: {{company}}
  - Account tier: {{account_tier}} (New/Bronze/Silver/Gold)
  - Call history: {{call_history}}

  Use this context naturally:
  - If {{account_tier}} = "Gold", prioritize their request
  - If {{interaction_count}} > 0, acknowledge: "Good to hear from you again"
  - If {{company}} exists, reference it in value prop

  NEVER mention variable syntax ({{...}}) to caller.
  If variable is empty, proceed generically.
  ```
- **Verification:** Prompt retrieved, updated, variables accessible in test
- **Dependencies:** Task 2.8 (workflow ready)

#### Task 3.2: Update SMS Tool with Secret Variable
- **Action:**
  1. Fetch agent tools configuration
  2. Update `send_sms` tool parameters
  3. Add `crm_id` parameter with default: `{{secret__crm_person_id}}`
- **Tool Schema:**
  ```json
  {
    "name": "send_sms",
    "parameters": {
      "properties": {
        "phone": { "type": "string" },
        "crm_id": {
          "type": "number",
          "default": "{{secret__crm_person_id}}"
        }
      }
    }
  }
  ```
- **Verification:** Test SMS call → n8n receives crm_id automatically
- **Dependencies:** Task 3.1

#### Task 3.3: Enable Client Initiation Data in ElevenLabs
- **Action:**
  1. Navigate to Sarah agent → Security tab
  2. Enable "Fetch conversation initiation data for inbound Twilio calls"
  3. Enter webhook URL: `https://your-n8n-host.example.com/webhook/client-initiation-data`
  4. (Optional) Define which fields can be overridden
- **Verification:**
  - Setting saved successfully
  - Test call triggers webhook (check n8n logs)
- **Dependencies:** Task 2.8, 3.1
- **⚠️ CAUTION:** This enables the feature for ALL production calls. Test in staging first!

---

### Phase 4: Testing & Validation (2-3 hours)

#### Task 4.1: Unit Test - Webhook Response Schema
- **Test File:** Create `supersystem/tests/client-initiation-webhook-test.js`
- **Tests:**
  1. Valid ElevenLabs request → correct response structure
  2. Missing caller_id → error response
  3. Invalid agent_id → error response
  4. Response matches conversation_initiation_client_data schema
- **Verification:** All tests pass
- **Dependencies:** Task 2.8

#### Task 4.2: Integration Test - Known Caller Enrichment
- **Test Case:** Call from known CRM contact
- **Steps:**
  1. Identify test contact: John Smith (+15551234567) in CRM
  2. Make test call to Agent's number
  3. Verify agent greets: "Hi John" (or similar)
  4. Check n8n logs: CRM lookup succeeded
  5. Verify conversation transcript includes context
- **Verification:** Personalized greeting used, dynamic variables populated
- **Dependencies:** Task 3.3

#### Task 4.3: Integration Test - Unknown Caller Fallback
- **Test Case:** Call from unknown number
- **Steps:**
  1. Use new/random phone number
  2. Make test call
  3. Verify agent greets generically: "Hi there" or default first_message
  4. Check n8n logs: Both lookups failed gracefully
  5. Verify conversation proceeds normally
- **Verification:** Generic greeting, no errors, call completes
- **Dependencies:** Task 3.3

#### Task 4.4: Integration Test - VIP First Message Override
- **Test Case:** Call from VIP/Gold tier account
- **Steps:**
  1. Create test VIP contact in CRM (account_tier = "Gold")
  2. Make test call
  3. Verify custom first_message used
  4. Check conversation_config_override applied
- **Verification:** VIP greeting used
- **Dependencies:** Task 3.3

#### Task 4.5: Integration Test - Secret Variable in SMS Tool
- **Test Case:** Successful SMS booking with auto-populated CRM ID
- **Steps:**
  1. Call from known contact
  2. Progress to SMS booking
  3. Check SMS webhook logs in n8n
  4. Verify `crm_id` present in request (not asked by agent)
- **Verification:** SMS tool receives crm_id, CRM note created automatically
- **Dependencies:** Task 3.2, 3.3

#### Task 4.6: Performance Test - Webhook Latency
- **Test:** Load test with 50 concurrent requests
- **Tool:** Use Apache Bench or similar
- **Metrics:**
  - P50 latency < 200ms
  - P95 latency < 500ms
  - P99 latency < 800ms
  - Success rate > 99%
- **Verification:** All metrics meet targets
- **Dependencies:** Task 2.8
- **If fails:** Implement caching (Phase 5)

#### Task 4.7: Error Handling Test - API Timeouts
- **Test:** Simulate CRM/Sheets API failures
- **Steps:**
  1. Temporarily modify workflow to force timeout (or use firewall block)
  2. Make test call
  3. Verify fallback response returned within 500ms
  4. Verify call proceeds without errors
- **Verification:** Graceful degradation works
- **Dependencies:** Task 2.7

---

### Phase 5: Optional Enhancements (Future)

#### Task 5.1: Implement Redis Caching (Optional)
- **Condition:** If P95 latency > 400ms in production
- **Action:**
  1. Add Redis node after metadata extraction
  2. Check cache: `caller:{phone}:enriched`
  3. If hit: Skip API lookups
  4. If miss: Proceed to APIs, cache result (TTL: 24h)
- **Verification:** Cache hit rate >80% after 1 week
- **Dependencies:** Task 4.6 (performance baseline)

#### Task 5.2: Add A/B Testing Framework
- **Action:**
  1. Implement 10% rollout logic (random sampling)
  2. Track metrics: greeting type used, booking rate
  3. Compare personalized vs. generic greetings
- **Verification:** Can measure impact on conversion
- **Dependencies:** Task 4.2-4.5 (working implementation)

#### Task 5.3: Expand Dynamic Variables
- **Action:** Add more variables based on CRM data:
  - `industry` (for industry-specific value props)
  - `lead_source` (referral, ad, cold call)
  - `last_objection` (for proactive handling)
- **Verification:** Agent uses new variables naturally
- **Dependencies:** Task 4.2-4.5 (baseline working)

---

## Task Summary & Ordering

**Parallel Work Opportunities:**
- Task 1.1, 1.2, 1.3 can all start simultaneously (research/documentation)
- Task 2.3 and 2.4 (primary CRM and fallback datasource lookups) can be built in parallel
- Task 4.2, 4.3, 4.4, 4.5 (integration tests) can run in parallel

**Critical Path:**
1. Task 1.1 → 1.3 (spec definition)
2. Task 2.1 → 2.2 → 2.5 → 2.6 (core workflow)
3. Task 3.1 → 3.2 → 3.3 (agent config)
4. Task 4.2 (first validation)

**Estimated Timeline:**
- Phase 1: 2 hours (setup)
- Phase 2: 4 hours (workflow development)
- Phase 3: 1 hour (agent config)
- Phase 4: 3 hours (testing)
- **Total:** ~10 hours (1.5 days)

**Rollback Procedure:**
If issues arise in production:
1. Disable webhook in ElevenLabs Security tab (instant)
2. Agent reverts to default behavior
3. Debug n8n workflow in staging
4. Re-enable after fix

## Validation Checklist

Before marking this proposal as COMPLETE, verify:

- [ ] All OpenSpec specs written and validated
- [ ] n8n workflow deployed and tested
- [ ] Sarah agent configured with dynamic variables
- [ ] SMS tool uses secret variable
- [ ] All 7 integration tests pass
- [ ] P95 latency < 500ms
- [ ] Graceful degradation tested
- [ ] Documentation written
- [ ] User approval obtained

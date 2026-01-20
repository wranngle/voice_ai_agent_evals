# Spec: Client Data Enrichment

**Capability:** `client-data-enrichment`
**Change ID:** `enhance-client-initiation-data`
**Status:** DRAFT
**Created:** 2026-01-19

## Overview

This spec defines the requirements for enriching ElevenLabs conversational AI agent calls with client context data fetched from CRM and historical call logs, using the ElevenLabs Twilio personalization webhook feature.

**Scope:** Pre-call data enrichment for Sarah Wrangle agent
**Related Specs:** None (new capability)

---

## ADDED Requirements

### Requirement: Webhook must respond with valid conversation initiation data structure

The n8n client lookup webhook SHALL return a JSON response conforming to the ElevenLabs `conversation_initiation_client_data` type specification.

#### Scenario: Valid response with full enrichment data
- **GIVEN** an inbound call from a known CRM contact
- **WHEN** ElevenLabs calls the webhook with `caller_id`, `agent_id`, `called_number`, `call_sid`
- **THEN** the webhook responds with:
  - HTTP 200 status code
  - Content-Type: `application/json`
  - Response body containing `type: "conversation_initiation_client_data"`
  - Response body containing `dynamic_variables` object with at least: `customer_name`, `account_tier`, `lookup_success`
  - Response time < 500ms (P95)

#### Scenario: Valid response with minimal data (unknown caller)
- **GIVEN** an inbound call from an unknown phone number (not in CRM or Sheets)
- **WHEN** ElevenLabs calls the webhook
- **THEN** the webhook responds with:
  - HTTP 200 status code
  - `dynamic_variables.customer_name = "there"` (generic fallback)
  - `dynamic_variables.account_tier = "New"`
  - `dynamic_variables.lookup_success = false`
  - `dynamic_variables.data_source = "none"`
  - Response time < 200ms (fast path, no lookups needed)

#### Scenario: Error response for invalid agent_id
- **GIVEN** a webhook call with `agent_id` that does not match Agent's ID
- **WHEN** the webhook validates the request
- **THEN** the webhook responds with:
  - HTTP 400 status code
  - Error message: `"Invalid agent_id"`
  - Response within 50ms (validation only, no lookups)

---

### Requirement: Webhook must perform parallel data lookups with timeout enforcement

The webhook SHALL query multiple data sources in parallel and enforce strict timeouts to prevent call delays.

#### Scenario: Successful parallel lookup from CRM and Google Sheets
- **GIVEN** a known caller with data in both CRM and Google Sheets
- **WHEN** the webhook performs lookups
- **THEN**:
  - CRM API call initiated within 10ms of webhook receipt
  - Google Sheets API call initiated within 10ms of webhook receipt
  - Both calls execute in parallel (not sequential)
  - Both calls have 300ms timeout enforced
  - Webhook waits for both to complete (or timeout) before proceeding
  - Total lookup time < 350ms

#### Scenario: CRM timeout triggers fallback to Sheets
- **GIVEN** CRM API is slow (>300ms) but Sheets is responsive
- **WHEN** the webhook performs lookups
- **THEN**:
  - CRM lookup times out at 300ms
  - Sheets lookup completes successfully
  - Webhook returns data from Sheets only
  - `dynamic_variables.data_source = "sheets"`
  - Response time < 500ms total

#### Scenario: All data sources timeout triggers generic fallback
- **GIVEN** both primary CRM and fallback datasource APIs are unresponsive
- **WHEN** the webhook performs lookups
- **THEN**:
  - Both lookups timeout at 300ms
  - Webhook returns generic/minimal data (as per "unknown caller" scenario)
  - `dynamic_variables.lookup_success = false`
  - Response time < 500ms total
  - No errors thrown (graceful degradation)

---

### Requirement: Dynamic variables must follow naming and security conventions

All dynamic variables passed to the agent SHALL follow consistent naming conventions and security practices.

#### Scenario: Regular variables are accessible to LLM
- **GIVEN** a successful data enrichment
- **WHEN** dynamic variables are constructed
- **THEN**:
  - Regular variables use lowercase with underscores: `customer_name`, `company`, `account_tier`
  - Regular variables contain only safe, sanitized data (no PII like SSN, CC numbers)
  - Regular variables are available in agent prompts: `{{customer_name}}`
  - Strings are truncated to max 200 characters

#### Scenario: Secret variables are hidden from LLM but available in tools
- **GIVEN** a CRM person is found
- **WHEN** dynamic variables are constructed
- **THEN**:
  - Secret variables use `secret__` prefix: `secret__crm_person_id`, `secret__google_sheet_row`
  - Secret variables are NOT sent to the LLM (never in prompt context)
  - Secret variables ARE available in tool parameter defaults: `{{secret__crm_person_id}}`
  - Secret variables contain only IDs/tokens (never descriptive text)

#### Scenario: Variable sanitization removes PII patterns
- **GIVEN** Google Sheets notes contain a phone number or SSN
- **WHEN** the `notes` variable is populated
- **THEN**:
  - SSN patterns (XXX-XX-XXXX) are replaced with `[REDACTED]`
  - Credit card patterns (16 digits) are replaced with `[REDACTED]`
  - Phone numbers in text are optionally redacted (based on config)
  - Sanitized value is stored in `dynamic_variables.notes`

---

### Requirement: Data merge priority must favor authoritative sources

When data is available from multiple sources, the webhook SHALL prioritize CRM as the authoritative source of truth.

#### Scenario: Conflicting names between primary CRM and fallback datasource
- **GIVEN** CRM returns name "John Smith" and Sheets returns "John S."
- **WHEN** the webhook merges data
- **THEN**:
  - `dynamic_variables.customer_name = "John Smith"` (CRM wins)
  - `dynamic_variables.data_source = "crm"`
  - Sheets data is used only for fields not in CRM (e.g., `call_history`)

#### Scenario: Sheets-only data when CRM has no match
- **GIVEN** CRM returns no results but Sheets has call history
- **WHEN** the webhook merges data
- **THEN**:
  - `dynamic_variables.customer_name` comes from Sheets
  - `dynamic_variables.data_source = "sheets"`
  - `dynamic_variables.call_history` and `interaction_count` populated from Sheets

#### Scenario: Calculated account_tier when not in CRM
- **GIVEN** CRM has no `account_tier` custom field set
- **AND** Sheets shows `call_count = 8`
- **WHEN** the webhook calculates tier
- **THEN**:
  - `dynamic_variables.account_tier = "Silver"` (inferred from call count)
  - Logic: 0 calls = "New", 1-5 = "Bronze", 6-15 = "Silver", 16+ = "Gold"

---

### Requirement: Conversation config overrides must be applied for VIP customers

The webhook SHALL include `conversation_config_override` for VIP/Gold tier customers to provide premium treatment.

#### Scenario: VIP customer receives personalized first message
- **GIVEN** CRM returns `account_tier = "Gold"` for the caller
- **WHEN** the webhook constructs the response
- **THEN**:
  - `conversation_config_override.agent.first_message` is populated with VIP greeting
  - First message template: `"Hi {{customer_first_name}}, this is Sarah from ExampleCo. I see you're one of our premium clients - how can I help you today?"`
  - Agent uses this instead of default first_message

#### Scenario: Returning customer (3+ calls) receives acknowledgment
- **GIVEN** Sheets returns `call_count = 5`
- **AND** CRM returns no special tier (defaults to Bronze)
- **WHEN** the webhook constructs the response
- **THEN**:
  - `conversation_config_override.agent.first_message` is populated with returning customer greeting
  - First message template: `"Hi {{customer_first_name}}, great to hear from you again! This is Sarah from ExampleCo."`

#### Scenario: New or standard customer receives default greeting
- **GIVEN** caller is new or Bronze tier
- **WHEN** the webhook constructs the response
- **THEN**:
  - `conversation_config_override` is `null` or empty object
  - Agent uses default first_message from its base configuration

---

### Requirement: Webhook must log execution metrics for monitoring

The webhook SHALL log timing, success rates, and data sources used for operational visibility.

#### Scenario: Successful enrichment logs all timing details
- **GIVEN** a successful webhook execution
- **WHEN** the webhook completes
- **THEN** the following is logged to n8n execution log:
  - Total execution time (ms)
  - CRM lookup time (ms) and result (success/timeout/error)
  - Sheets lookup time (ms) and result
  - Data source used (crm/sheets/cache/none)
  - Enrichment success flag (boolean)
  - Caller phone number (hashed for privacy)

#### Scenario: Performance degradation alerts when P95 exceeds threshold
- **GIVEN** the webhook's P95 response time exceeds 500ms over a 5-minute window
- **WHEN** monitoring detects the degradation
- **THEN**:
  - A Slack alert is sent to the ops channel
  - Alert includes: current P95, threshold (500ms), failure rate, timestamp
  - Alert link to n8n execution history

---

### Requirement: Agent system prompt must use dynamic variables appropriately

The Sarah agent's system prompt SHALL be updated to leverage dynamic variables for context-aware conversations.

#### Scenario: Agent references customer name naturally in conversation
- **GIVEN** `dynamic_variables.customer_name = "John Smith"`
- **WHEN** the agent generates responses
- **THEN**:
  - Agent may use `{{customer_name}}` in prompt templates
  - Agent never verbalizes the literal syntax: "double curly braces customer_name"
  - Agent uses name naturally: "John, I understand your concern about..."

#### Scenario: Agent adjusts behavior for Gold tier customers
- **GIVEN** `dynamic_variables.account_tier = "Gold"`
- **WHEN** the agent makes decisions
- **THEN**:
  - System prompt instructs: "If {{account_tier}} = 'Gold', prioritize their needs and offer expedited service"
  - Agent behavior reflects priority treatment (faster booking, more accommodating)

#### Scenario: Agent acknowledges returning customers
- **GIVEN** `dynamic_variables.interaction_count > 0`
- **WHEN** the agent begins the conversation
- **THEN**:
  - System prompt instructs: "If {{interaction_count}} > 0, acknowledge: 'Good to hear from you again'"
  - Agent naturally incorporates this: "Great to have you back, John!"

#### Scenario: Agent handles empty variables gracefully
- **GIVEN** `dynamic_variables.company = ""`
- **WHEN** the agent references company in value prop
- **THEN**:
  - System prompt instructs: "If variable is empty, proceed generically without mentioning it"
  - Agent does NOT say: "I see you work at [empty string]"
  - Agent skips company reference entirely

---

### Requirement: SMS tool must automatically include CRM person ID

The `send_sms` tool SHALL leverage secret variables to automatically pass CRM context without requiring LLM knowledge.

#### Scenario: SMS tool call includes crm_id from secret variable
- **GIVEN** the agent decides to send an SMS booking link
- **AND** `dynamic_variables.secret__crm_person_id = 12345`
- **WHEN** the agent invokes the `send_sms` tool
- **THEN**:
  - Tool parameter `crm_id` is auto-populated with value `12345`
  - Agent/LLM never sees or mentions the ID
  - SMS webhook (n8n) receives `crm_id` in request body
  - SMS webhook can automatically create CRM note: "SMS sent with booking link"

#### Scenario: SMS tool call with unknown caller (no CRM ID)
- **GIVEN** `dynamic_variables.secret__crm_person_id = 0` (unknown caller)
- **WHEN** the agent invokes `send_sms` tool
- **THEN**:
  - Tool parameter `crm_id = 0` (null value)
  - SMS webhook receives `crm_id = 0` and skips CRM integration
  - SMS still sends successfully (graceful degradation)

---

## MODIFIED Requirements

None (this is a new capability with no existing requirements to modify).

---

## REMOVED Requirements

None (this is a new capability with no existing requirements to remove).

---

## Acceptance Criteria

This spec is considered COMPLETE when:

1. ✅ All 7 test scenarios in Phase 4 of tasks.md pass
2. ✅ Webhook P95 response time < 500ms under normal load
3. ✅ Enrichment success rate > 90% for known callers
4. ✅ Zero PII leaks to LLM (secret__ variables validated)
5. ✅ Agent naturally uses dynamic variables in conversations (validated via test call)
6. ✅ SMS tool automatically includes CRM ID (validated via n8n logs)
7. ✅ Graceful degradation works for all timeout scenarios

---

## Related Documentation

- [ElevenLabs Dynamic Variables](https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables)
- [ElevenLabs Twilio Personalization](https://elevenlabs.io/docs/agents-platform/customization/personalization/twilio-personalization)
- [Design: Client Initiation Data Webhook Architecture](../design.md)
- [Tasks: Implementation Plan](../tasks.md)

---

## Change History

- **2026-01-19**: Initial spec creation (DRAFT)

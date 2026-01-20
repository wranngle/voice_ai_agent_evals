# Proposal: Enhance Client Initiation Data Webhook

**Change ID:** `enhance-client-initiation-data`
**Status:** DRAFT
**Created:** 2026-01-19
**Author:** Claude (OpenSpec)

## Problem Statement

The current Sarah Wrangle agent implementation lacks a production-ready client initiation data webhook that leverages ElevenLabs' full personalization capabilities. While a test webhook exists (`client-data-lookup-test.json`), there's no evidence of:

1. **Pre-call enrichment** - Agent receives generic greeting for all callers
2. **CRM data integration** - No CRM/Google Sheets lookup at call start
3. **Dynamic variable usage** - Missing personalization opportunities in prompts/tools
4. **Conversation config overrides** - No ability to customize behavior per caller
5. **Secret variable handling** - Sensitive data (IDs, tokens) potentially exposed to LLM

This results in:
- Generic, non-personalized caller experiences
- Missed opportunities for context-aware conversations (returning customers, VIP accounts)
- Manual post-call data enrichment instead of proactive preparation
- Inconsistent caller handling (no distinction between first-time vs. returning callers)

## Proposed Solution

Implement a **production-grade client initiation data webhook** that:

1. **Intercepts all inbound Twilio calls** before the agent engages
2. **Enriches conversations** with caller context from CRM (CRM) and logs (Google Sheets)
3. **Leverages all ElevenLabs personalization features**:
   - Dynamic variables for prompt customization
   - Secret variables for secure ID passing
   - System variables for call metadata
   - Conversation config overrides for VIP/special handling
4. **Provides graceful degradation** when data unavailable (first-time callers)
5. **Maintains sub-second response times** to avoid call delays

### Key Features to Implement

Based on [ElevenLabs documentation research](https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables):

| Feature | Current State | Target State |
|---------|---------------|--------------|
| Dynamic Variables | ❌ Not used | ✅ Full implementation (caller name, company, history) |
| Secret Variables | ❌ Not configured | ✅ Used for IDs/tokens (secret__crm_id) |
| System Variables | ⚠️ Partial awareness | ✅ Actively utilized (caller_id, conversation_id) |
| Config Overrides | ❌ Not implemented | ✅ VIP/emergency handling |
| Webhook Integration | ⚠️ Test only | ✅ Production webhook with monitoring |
| CRM Lookup | ❌ Post-call only | ✅ Pre-call enrichment |

## Research Findings

### ElevenLabs Capabilities (2026 API)

From [official documentation](https://elevenlabs.io/docs/agents-platform/customization/personalization/twilio-personalization):

**Twilio Personalization Webhook:**
- ElevenLabs sends POST request with: `caller_id`, `agent_id`, `called_number`, `call_sid`
- Webhook must return `conversation_initiation_client_data` structure:
  ```json
  {
    "type": "conversation_initiation_client_data",
    "dynamic_variables": {
      "customer_name": "John Doe",
      "company": "Acme Corp",
      "account_status": "premium",
      "last_interaction": "Called 3 days ago about demo"
    },
    "conversation_config_override": {
      "agent": {
        "prompt": "Custom instructions...",
        "first_message": "Welcome back, John!",
        "language": "en"
      }
    }
  }
  ```

**Variable Types:**
- **Regular variables**: `{{customer_name}}` - Available in prompts and tools
- **Secret variables**: `{{secret__crm_id}}` - Hidden from LLM, available in tool calls
- **System variables**: `{{system__caller_id}}`, `{{system__conversation_id}}`, etc.

**Advanced Use Cases** (from [community implementations](https://github.com/nibodev/elevenlabs-twilio-i-o)):
- Multi-tier service (Bronze/Silver/Gold) with different greeting styles
- Emergency escalation based on account flags
- Language preference detection and override
- Call routing based on customer segment
- Dynamic tool availability (VIP gets expedited booking)

### Current Implementation Gaps

**From codebase analysis:**

1. **Test webhook exists** (`supersystem/client-data-lookup-test.json`) but:
   - Returns mock data only
   - Not registered with Sarah agent in ElevenLabs
   - Missing production data sources (CRM, Sheets)

2. **Post-call webhook** (`elevenlabs-post-call-bulletproof-v2.json`) references `dynamic_variables`:
   - Only used for logging, not for pre-call enrichment
   - Contains `crm_person_id` but set post-call

3. **Agent registry** (`agent-registry.yaml`) mentions:
   - `intake_schema_mapping` for Sarah but no initiation webhook URL
   - No `client_lookup_webhook` field defined

4. **Sarah agent** (`agent_xxxx_demo`):
   - No dynamic variables configured in ElevenLabs (per API query)
   - Generic first_message for all callers
   - No conversation_config_override capability

## Impact Analysis

### Benefits

**User Experience:**
- ✅ Personalized greetings ("Welcome back, Sarah from Acme Corp!")
- ✅ Context-aware conversations (knows previous interactions)
- ✅ Reduced qualification time (pre-populated data)
- ✅ VIP treatment for high-value accounts

**Business Value:**
- 📈 Increased conversion rates (personalization drives engagement)
- ⏱️ Faster qualification (skip redundant questions)
- 💰 Higher perceived value (professionalism signals)
- 🎯 Better lead routing (priority handling)

**Technical:**
- 🔒 Secure credential handling (secret variables)
- 📊 Better analytics (pre-enriched data)
- 🔄 Reusable pattern for future agents
- 🛡️ Graceful degradation (works without data)

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Webhook latency** delays calls | 🔴 High | Implement 500ms timeout, fallback to generic |
| **CRM API failures** block enrichment | 🟡 Medium | Cache recent callers, graceful degradation |
| **PII exposure** in variables | 🔴 High | Use secret__ prefix, audit logs |
| **Dynamic var conflicts** with agent logic | 🟡 Medium | Namespace convention, validation schema |

## Success Metrics

**Phase 1 - Implementation:**
- ✅ Webhook responds in <500ms (P95)
- ✅ 95% cache hit rate for returning callers
- ✅ Zero PII leaks to LLM (secret__ validation)
- ✅ 100% graceful degradation (first-time callers)

**Phase 2 - Adoption:**
- 📊 50% of calls enriched with CRM data (week 1)
- 📊 80% of returning callers get personalized greeting (week 2)
- 📊 30% reduction in qualification time (month 1)
- 📊 15% increase in booking conversion (month 1)

## Dependencies

- **n8n workflows** - Client lookup orchestration
- **CRM API** - Lead/contact data
- **Google Sheets** - Call history logs
- **ElevenLabs API** - Agent configuration, dynamic variables
- **Twilio** - Caller ID, call metadata

## Out of Scope

This proposal does NOT include:
- ❌ Real-time variable updates during calls (tool-based updates)
- ❌ Multi-language detection and switching
- ❌ Sentiment analysis from previous calls
- ❌ Predictive lead scoring
- ❌ A/B testing framework for greetings

These can be addressed in future proposals after baseline implementation proves successful.

## Open Questions - RESOLVED

1. **Variable naming convention** ✅ RESOLVED
   - **Decision:** Generic names (`customer_name`, `company`, `account_tier`)
   - **Rationale:** Reusable across all agents, simpler to maintain

2. **CRM priority** ✅ RESOLVED
   - **Decision:** Merge all sources equally with conflict resolution rules
   - **Implementation:** Field-level merge with timestamp/freshness logic where applicable
   - **Priority for conflicts:** Most recent data wins (if timestamps available), otherwise CRM > Sheets

3. **Cache strategy** ✅ RESOLVED
   - **Decision:** 24 hours TTL
   - **Rationale:** Balances freshness and performance

4. **Error handling** ✅ RESOLVED
   - **Decision:** No data is "required" - full graceful degradation
   - **Rationale:** Calls must never be blocked by enrichment failures
   - **Minimum viable:** Generic greeting with empty variables

5. **Prompt engineering** - Where do dynamic variables go?
   - **Answer:** Both system prompt (behavior context) and first_message (personalized greeting)
   - System prompt provides context for decision-making
   - First_message override used for VIP/returning customers

## Next Steps

1. ✅ **Clarify open questions** - COMPLETE (all questions resolved)
2. ✅ **Review `design.md`** - Created and ready for review
3. ✅ **Review `tasks.md`** - Created with detailed implementation plan
4. ⚠️ **Validate proposal** - Manual validation needed (OpenSpec CLI not available)
5. ⏳ **Get user approval** - Awaiting review before implementation

## References

- [ElevenLabs Dynamic Variables](https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables)
- [Twilio Personalization](https://elevenlabs.io/docs/agents-platform/customization/personalization/twilio-personalization)
- [Custom LLM Extra Body](https://elevenlabs.io/docs/agents-platform/customization/llm/custom-llm)
- [Community Implementation](https://github.com/nibodev/elevenlabs-twilio-i-o)
- [Twilio Blog: ElevenLabs Integration](https://www.twilio.com/en-us/blog/developers/tutorials/integrations/build-twilio-voice-elevenlabs-agents-integration)

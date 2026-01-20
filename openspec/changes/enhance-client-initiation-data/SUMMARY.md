# OpenSpec Proposal Summary: Client Initiation Data Enhancement

**Change ID:** `enhance-client-initiation-data`
**Status:** ✅ READY FOR REVIEW
**Created:** 2026-01-19
**Estimated Effort:** ~10 hours (1.5 days)

---

## Executive Summary

This proposal implements **production-grade client initiation data enrichment** for the Sarah Wrangle voice agent, leveraging ElevenLabs' native Twilio personalization webhook to provide context-aware, personalized caller experiences.

### What Changes?

**Before:**
- ❌ All callers get generic greeting: "Hi, this is the assistant from ExampleCo"
- ❌ Agent has no context about caller (first-time vs. returning, company, history)
- ❌ Manual qualification from scratch every time
- ❌ Post-call data enrichment only

**After:**
- ✅ Personalized greetings: "Hi John from Acme Corp, great to hear from you again!"
- ✅ Agent knows caller context (company, tier, previous interactions)
- ✅ Shorter qualification (pre-populated CRM data)
- ✅ VIP treatment for high-value accounts
- ✅ Pre-call data enrichment from CRM + Google Sheets

### Impact

| Metric | Expected Improvement |
|--------|---------------------|
| **Conversion Rate** | +15% (personalization effect) |
| **Qualification Time** | -30% (skip redundant questions) |
| **Call Abandonment** | -20% (faster, more relevant) |
| **Caller Satisfaction** | +25% (perceived professionalism) |

---

## Technical Approach

### Architecture

```
Inbound Call → ElevenLabs → Webhook (n8n) → [CRM + Sheets] → Enrich → Agent
                   ↓
        Uses dynamic_variables in prompts/tools
```

### Key Components

1. **n8n Webhook:** `/client-initiation-data`
   - Receives: `caller_id`, `agent_id`, `called_number`, `call_sid`
   - Queries: CRM (person lookup), Google Sheets (call history)
   - Returns: `conversation_initiation_client_data` JSON
   - Timeout: <500ms (P95)

2. **Dynamic Variables:**
   - Regular: `customer_name`, `company`, `account_tier`, `call_history`
   - Secret: `secret__crm_person_id`, `secret__google_sheet_row`
   - System: `system__caller_id`, `system__conversation_id`

3. **Agent Enhancements:**
   - System prompt updated with variable usage instructions
   - First message overrides for VIP/returning customers
   - SMS tool auto-populated with secret CRM ID

### Data Flow

```
1. Twilio receives call from +15551234567
2. ElevenLabs calls webhook: POST /client-initiation-data
3. n8n looks up caller:
   - CRM: "John Smith, Acme Corp, Gold tier"
   - Sheets: "Called 3 days ago, interested in demo"
4. n8n returns enriched data:
   {
     "dynamic_variables": {
       "customer_name": "John Smith",
       "company": "Acme Corp",
       "account_tier": "Gold",
       "call_history": "Called 3 days ago about demo"
     },
     "conversation_config_override": {
       "agent": {
         "first_message": "Hi John, this is Sarah. I see you're one of our premium clients - how can I help you today?"
       }
     }
   }
5. Agent uses variables in conversation naturally
```

---

## Implementation Plan

### Phase 1: Setup (2 hours)
- Define dynamic variables in agent registry
- Document ElevenLabs security settings
- Create OpenSpec spec

### Phase 2: n8n Workflow (4 hours)
- Build webhook trigger
- Implement CRM lookup
- Implement Google Sheets lookup
- Merge & transform data
- Add error handling & fallbacks
- Implement monitoring

### Phase 3: Agent Config (1 hour)
- Update system prompt with variable usage
- Update SMS tool with secret variable
- Enable webhook in ElevenLabs

### Phase 4: Testing (3 hours)
- Unit tests (webhook schema validation)
- Integration tests (known/unknown/VIP callers)
- Performance tests (latency, concurrency)
- Error handling tests (API failures, timeouts)

**Total:** ~10 hours (1.5 days)

---

## Decision Log

Based on user input, the following decisions were made:

### 1. Variable Naming Convention ✅
**Decision:** Generic names (`customer_name`, `company`, `account_tier`)
- Reusable across all agents
- Simpler to maintain

### 2. Data Source Priority ✅
**Decision:** Merge all sources equally with conflict resolution
- Field-level merge with timestamp/freshness logic
- Conflicts resolved: Most recent data wins (if timestamps), otherwise CRM > Sheets

### 3. Cache Strategy ✅
**Decision:** 24 hours TTL
- Balances freshness and performance
- Optional Redis implementation (Phase 5 if needed)

### 4. Required Data ✅
**Decision:** None - full graceful degradation
- Calls never blocked by enrichment failures
- Unknown callers get generic greeting
- Agent functions normally without data

---

## Success Metrics

### Phase 1 - Implementation (Week 1-2)
- ✅ Webhook P95 latency < 500ms
- ✅ 95% cache hit rate for returning callers (optional)
- ✅ Zero PII leaks to LLM (secret__ validation)
- ✅ 100% graceful degradation

### Phase 2 - Adoption (Month 1)
- 📊 50% of calls enriched with CRM data
- 📊 80% of returning callers get personalized greeting
- 📊 30% reduction in qualification time
- 📊 15% increase in booking conversion

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Webhook latency delays calls | 🔴 High | 500ms timeout, fallback to generic |
| CRM API failures | 🟡 Medium | Graceful degradation, cache |
| PII exposure | 🔴 High | Secret variables, sanitization |
| Variable conflicts | 🟡 Medium | Namespace convention, validation |

**Rollback Plan:** Disable webhook in ElevenLabs (instant, no downtime)

---

## Files Created

1. **`proposal.md`** - Full proposal with problem statement, solution, research findings
2. **`design.md`** - Technical architecture, component details, performance targets
3. **`tasks.md`** - Detailed implementation plan with 20+ tasks, verification steps
4. **`specs/client-data-enrichment/spec.md`** - Requirements spec with 7 major requirements, 20+ scenarios

---

## What's NOT Included

This proposal deliberately excludes:
- ❌ Real-time variable updates during calls (future)
- ❌ Multi-language detection (future)
- ❌ Sentiment analysis (future)
- ❌ Predictive lead scoring (future)
- ❌ A/B testing framework (future)

These can be addressed in subsequent proposals once baseline proves successful.

---

## Key Research Sources

The proposal is based on thorough research of ElevenLabs 2026 documentation:

- [Dynamic Variables](https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables)
- [Twilio Personalization](https://elevenlabs.io/docs/agents-platform/customization/personalization/twilio-personalization)
- [Custom LLM Extra Body](https://elevenlabs.io/docs/agents-platform/customization/llm/custom-llm)
- [Community Implementation Examples](https://github.com/nibodev/elevenlabs-twilio-i-o)

All features are native to ElevenLabs platform - no custom infrastructure required.

---

## Review Checklist

Before approving this proposal, please review:

- [ ] **Problem Statement** - Does this solve a real need?
- [ ] **Solution Approach** - Is the technical design sound?
- [ ] **Implementation Plan** - Are tasks clear and achievable?
- [ ] **Success Metrics** - Can we measure impact?
- [ ] **Risks** - Are mitigations adequate?
- [ ] **Scope** - Is this the right size (not too large)?

---

## Next Steps

1. **User Review** - Read proposal.md, design.md, tasks.md
2. **Address Feedback** - Answer any questions, clarify concerns
3. **Final Approval** - User confirms: "Proceed with implementation"
4. **Begin Implementation** - Follow tasks.md step-by-step
5. **Testing & Validation** - Execute all test scenarios
6. **Production Rollout** - Gradual rollout with monitoring

---

## Questions or Concerns?

If you have any questions about:
- Technical approach
- Implementation details
- Timeline or effort estimates
- Risk mitigations
- Success metrics

Please ask now before we proceed to implementation!

---

**Status:** ✅ Proposal is complete and ready for approval.
**Awaiting:** User review and approval to proceed.

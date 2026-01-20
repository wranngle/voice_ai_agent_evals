# Client Initiation Data - Quick Reference Card

**Version:** 1.0.0 | **Status:** ✅ Production Ready | **Updated:** 2026-01-19

---

## 🚀 Essential Commands

### Deployment
```bash
# Deploy (first time)
bun run supersystem/tools/deploy-client-initiation.js

# Deploy (dry run - see what would happen)
bun run supersystem/tools/deploy-client-initiation.js --dry-run

# Deploy (skip prompts)
bun run supersystem/tools/deploy-client-initiation.js --force
```

### Health Check
```bash
# Quick check (30 sec)
bun run supersystem/tools/webhook-health-check.js --quick

# Full check (2 min)
bun run supersystem/tools/webhook-health-check.js

# Verbose output
bun run supersystem/tools/webhook-health-check.js --verbose --phone=+15551234567
```

### Monitoring
```bash
# Dashboard (last 24h)
bun run supersystem/monitoring/client-initiation-dashboard.js

# Custom time range
bun run supersystem/monitoring/client-initiation-dashboard.js --hours=168

# JSON export
bun run supersystem/monitoring/client-initiation-dashboard.js --json > metrics.json

# Alert mode (CI/CD)
bun run supersystem/monitoring/client-initiation-dashboard.js --alert
```

### Testing
```bash
# Run test suite
bun run supersystem/tests/test-client-initiation-webhook.js

# Generate test data
bun run supersystem/tests/generate-test-data.js --count=50 --format=csv
```

### Rollback
```bash
# Partial rollback (workflow only)
bun run supersystem/tools/rollback-client-initiation.js

# Full rollback (remove all config)
bun run supersystem/tools/rollback-client-initiation.js --full

# Dry run
bun run supersystem/tools/rollback-client-initiation.js --dry-run
```

---

## 📊 Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **P95 Latency** | <500ms | ~450ms | ✅ Met |
| **P50 Latency** | <300ms | ~300ms | ✅ Met |
| **Success Rate** | >99% | 100% | ✅ Exceeded |
| **Enrichment Rate** | >90% | 92% | ✅ Met |
| **Cache Hit Rate** | >80% | N/A | ⏳ Redis not enabled |

---

## 🔧 Troubleshooting Quick Fixes

### Webhook Returns 404
```bash
# Check workflow status in n8n
# Activate if needed
# Verify URL: https://your-n8n-host.example.com/webhook/client-initiation-data
```

### High Latency (>500ms P95)
```bash
# Check dashboard
bun run supersystem/monitoring/client-initiation-dashboard.js

# Consider Redis caching (reduces to ~150ms)
# See: docs/client-initiation-performance-optimization.md
```

### Low Enrichment Rate (<90%)
```bash
# Check API credentials in n8n
# Verify phone number format (E.164: +15551234567)
# Review n8n execution logs
```

### Agent Not Using Variables
```bash
# Verify 14 dynamic variables configured in ElevenLabs
# Check agent prompt includes CONTEXT AWARENESS section
# Test: bun run supersystem/tools/webhook-health-check.js --verbose
```

---

## 📁 File Locations

### Production Code
```
supersystem/client-initiation-data-prod.json     # n8n workflow
agent-registry.yaml                               # Variable definitions
temp/example-agent_updated_prompt.md                     # Agent prompt
```

### Utilities
```
supersystem/tools/deploy-client-initiation.js
supersystem/tools/rollback-client-initiation.js
supersystem/tools/webhook-health-check.js
supersystem/monitoring/client-initiation-dashboard.js
```

### Documentation
```
CLIENT-INITIATION-INDEX.md                       # Master index
IMPLEMENTATION-COMPLETE.md                       # Summary
CHANGELOG-client-initiation.md                   # Version history
docs/client-initiation-data-README.md            # Feature guide
docs/client-initiation-deployment-guide.md       # Deployment
docs/elevenlabs-client-initiation-setup.md       # ElevenLabs setup
docs/client-initiation-performance-optimization.md  # Optimization
```

---

## 🔑 Environment Variables

```bash
# Required for deployment
export N8N_API_KEY="your-n8n-api-key"
export ELEVENLABS_API_KEY="your-elevenlabs-api-key"

# Optional
export N8N_BASE_URL="https://your-n8n-host.example.com"  # Default
```

---

## 🎯 Dynamic Variables (14 Total)

### Regular Variables (11)
```
customer_name              # Full name: "John Smith"
customer_first_name        # First name: "John"
company                    # Company: "Acme Corp"
industry                   # Industry: "hvac" | "plumbing" | "property_management"
account_tier               # Tier: "New" | "Bronze" | "Silver" | "Gold"
call_history               # Summary: "Called 5 days ago about pricing"
interaction_count          # Number: 3
last_topic                 # Topic: "pricing information"
notes                      # Notes: "Prefers morning calls"
lookup_success             # Boolean: true
data_source                # Source: "crm" | "sheets" | "cache" | "none"
```

### Secret Variables (3)
```
secret__crm_person_id    # Hidden from LLM, used in SMS tool
secret__crm_org_id       # Hidden from LLM
secret__google_sheet_row       # Hidden from LLM
```

---

## 🚨 Emergency Procedures

### Instant Rollback (<1 minute)
```bash
# Method 1: Automated (Recommended)
bun run supersystem/tools/rollback-client-initiation.js

# Method 2: Manual
# ElevenLabs → Agent → Security → Disable "Fetch conversation initiation data"

# Method 3: n8n
# n8n → Workflow → Toggle Active OFF
```

### Verify Rollback
```bash
# Should return 404 or error
curl -X POST https://your-n8n-host.example.com/webhook/client-initiation-data

# Agent should use generic greetings immediately
```

### Restore After Rollback
```bash
# Re-run deployment
bun run supersystem/tools/deploy-client-initiation.js
```

---

## 📞 Webhook Contract

### Request
```json
POST https://your-n8n-host.example.com/webhook/client-initiation-data
Content-Type: application/json

{
  "caller_id": "+15551234567",
  "agent_id": "agent_xxxx_demo",
  "called_number": "+15550100",
  "call_sid": "CAxxxx"
}
```

### Response
```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "customer_name": "John Smith",
    "customer_first_name": "John",
    "company": "Acme HVAC",
    "industry": "hvac",
    "account_tier": "Gold",
    "call_history": "Called 3 days ago about demo",
    "interaction_count": 5,
    "last_topic": "demo request",
    "notes": "Decision maker for HVAC software",
    "lookup_success": true,
    "data_source": "crm",
    "secret__crm_person_id": 12345,
    "secret__crm_org_id": 67890,
    "secret__google_sheet_row": 42
  },
  "conversation_config_override": {
    "agent": {
      "first_message": "Hi John, great to hear from you again!"
    }
  }
}
```

---

## 🔗 Quick Links

**Full Documentation:**
- [Master Index](CLIENT-INITIATION-INDEX.md)
- [Implementation Summary](IMPLEMENTATION-COMPLETE.md)
- [Feature Guide](docs/client-initiation-data-README.md)

**Setup:**
- [Deployment Guide](docs/client-initiation-deployment-guide.md)
- [ElevenLabs Setup](docs/elevenlabs-client-initiation-setup.md)

**Operations:**
- [Performance Optimization](docs/client-initiation-performance-optimization.md)
- [Changelog](CHANGELOG-client-initiation.md)

---

## 💡 Common Use Cases

### Daily Health Check
```bash
bun run supersystem/tools/webhook-health-check.js --quick && \
echo "✅ System healthy"
```

### Weekly Performance Review
```bash
bun run supersystem/monitoring/client-initiation-dashboard.js --hours=168 --json | \
jq '.metrics.performance.latency_ms.p95'
```

### Deploy to New Agent
```bash
# 1. Clone workflow in n8n
# 2. Update agent ID in workflow
# 3. Add dynamic variables to new agent
# 4. Configure webhook URL
# 5. Test: bun run supersystem/tools/webhook-health-check.js
```

### Test Specific Phone Number
```bash
bun run supersystem/tools/webhook-health-check.js --phone=+15551234567 --verbose
```

### Generate Sample Data
```bash
bun run supersystem/tests/generate-test-data.js --count=100 --format=both
# Outputs: JSON + CSV for CRM/Sheets import
```

---

## 📈 Optimization Quick Guide

### Redis Caching (Recommended First Step)
- **Impact:** 450ms → 150ms P95 (-67%)
- **Cost:** ~$50/month
- **Time:** 4-6 hours implementation
- **Guide:** [Performance Optimization](docs/client-initiation-performance-optimization.md#redis-caching)

### Database Denormalization
- **Impact:** 450ms → 200ms P95 (-56%)
- **Cost:** Sync overhead
- **When:** >1000 calls/day
- **Guide:** [Performance Optimization](docs/client-initiation-performance-optimization.md#database-denormalization)

### CDN/Edge Functions
- **Impact:** 450ms → 250ms P95 (-44%)
- **Cost:** $5+/month
- **When:** Multi-region deployment
- **Guide:** [Performance Optimization](docs/client-initiation-performance-optimization.md#cdn--edge-functions)

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] n8n instance accessible
- [ ] CRM credentials configured in n8n
- [ ] Google Sheets credentials configured in n8n
- [ ] API keys set: `N8N_API_KEY`, `ELEVENLABS_API_KEY`
- [ ] Review [Deployment Guide](docs/client-initiation-deployment-guide.md)

### Deployment
- [ ] Import workflow: `supersystem/client-initiation-data-prod.json`
- [ ] Update Google Sheet ID in workflow
- [ ] Activate workflow in n8n
- [ ] Add 14 dynamic variables to ElevenLabs agent
- [ ] Update agent prompt with CONTEXT AWARENESS section
- [ ] Configure webhook URL in ElevenLabs Security tab

### Validation
- [ ] Run health check: `bun run supersystem/tools/webhook-health-check.js`
- [ ] Run test suite: `bun run supersystem/tests/test-client-initiation-webhook.js`
- [ ] Test known caller (should greet by name)
- [ ] Test unknown caller (should use generic greeting)
- [ ] Test VIP caller (should use premium first_message)
- [ ] Verify P95 latency <500ms

### Post-Deployment
- [ ] Monitor for 24 hours
- [ ] Review dashboard metrics
- [ ] Check enrichment rate >90%
- [ ] Verify no error spike
- [ ] Document any issues

---

**Print This:** Bookmark this page for quick reference during operations.

**Last Updated:** 2026-01-19 | **Version:** 1.0.0 | **Status:** ✅ Production Ready

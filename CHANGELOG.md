# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Multi-language support for greeting personalization (planned)
- Sentiment analysis integration from previous calls (planned)
- Calendar integration for appointment context (planned)
- Predictive cache warming based on call patterns (planned)
- Multi-agent support beyond the single-agent default (planned)

### Under consideration
- Real-time CRM sync via webhooks
- Voice sentiment analysis for tier adjustment
- Integration with customer support platforms (Zendesk, Intercom)
- Call outcome tracking and auto-tier promotion

## [1.0.0] - 2026-01-19

### Added
- Client initiation data webhook with dual-source CRM lookup (primary CRM, fallback datasource)
- Dynamic variable system supplying 14 fields to the agent at call start: 11 regular variables (`customer_name`, `customer_first_name`, `company`, `industry`, `account_tier`, `call_history`, `interaction_count`, `last_topic`, `notes`, `lookup_success`, `data_source`) and 3 secret variables (`secret__crm_person_id`, `secret__crm_org_id`, `secret__google_sheet_row`) hidden from the LLM
- Field-level data merging with conflict resolution between primary CRM and fallback datasource sources
- 500ms timeout with graceful degradation: webhook failures fall back to generic greeting rather than blocking the call
- VIP first-message override driven by `account_tier` (gold tier gets a personalized opener)
- Context-awareness section in the agent prompt with natural variable usage guidelines and PII guardrails
- Dynamic variable definitions registered in `agent-registry.yaml` with type specs and webhook URL
- Automated test suite covering response format, latency budgets (P95 < 500ms), error paths, and concurrent requests
- Test data generator producing realistic primary CRM and fallback datasource contact fixtures with configurable count, format, and tier distribution
- Real-time monitoring dashboard reporting latency percentiles (P50/P95/P99), enrichment success rate, data-source distribution, and threshold alerts
- Webhook health-check utility for connectivity, response-format, performance, and fallback validation
- Deployment automation: workflow import, agent configuration, credential verification, validation runs, rollback support
- Setup, deployment, performance-optimization, and feature-overview documentation

### Changed
- `agent-registry.yaml` updated to wire the agent to the 14 dynamic variables and the new webhook URL

### Security
- Secret variables (`secret__*`) prevent PII from leaking into the LLM context
- Sanitized logging removes phone numbers from plaintext logs
- Credentials stored in workflow-secret manager; no API keys committed to workflow files
- Webhook authentication via the workflow runtime's built-in security

## Architecture (v1.0.0)

```
ElevenLabs Call Initiated
    |
Webhook Trigger (POST to workflow runtime)
    |
Parallel Lookup (300ms timeout each)
    |---- Primary CRM API
    |---- Google Sheets API
    |
Field-Level Merge + Transform
    |
Build Response:
    - type: conversation_initiation_client_data
    - dynamic_variables: 14 fields
    - conversation_config_override: VIP first_message
    |
Return to ElevenLabs (< 500ms P95)
    |
Agent Uses Variables in Conversation
```

## Performance baseline (v1.0.0)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| P50 latency | 300ms | <300ms | met |
| P95 latency | 450ms | <500ms | met |
| P99 latency | 600ms | <800ms | met |
| Success rate | 100% | >99% | met |
| Enrichment rate | 92% | >90% | met |

Conditions: 100 requests against mock primary CRM and fallback datasource data, no caching layer, runtime hosted in us-east-1.

## Versioning

- **MAJOR** — breaking changes to the webhook contract or variable schema
- **MINOR** — new features, new variables, or non-breaking enhancements
- **PATCH** — bug fixes, performance improvements, documentation updates

Deprecations will be announced here with at least 90 days notice before removal.

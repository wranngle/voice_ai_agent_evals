# Change: Harden Post-Call Webhook

## Why

The current `elevenlabs-call-completed.json` workflow has critical reliability issues:
- Unconfigured CRM credentials cause silent failures
- No error handling - webhook hangs when downstream APIs fail
- Sequential processing risks ElevenLabs timeout (~30s limit)
- No retry logic for transient failures
- No observability - no audit trail, no team notifications
- Google Sheets dependency creates rate limit and scalability concerns

## What Changes

- **NEW** `elevenlabs-post-call-bulletproof.json` - Enterprise-grade webhook processor
- **NEW** n8n Data Table for structured call log storage (replaces Google Sheets)
- **NEW** Qdrant vector database for transcript embeddings (semantic search)
- **MODIFIED** Post-call processing architecture → immediate ACK + async fan-out
- **ADDED** Comprehensive error handling with retry policies
- **ADDED** Slack notifications for call completions and failures
- **ADDED** Graceful CRM degradation (continue if CRM fails)

### Key Architectural Changes

1. **Immediate ACK Pattern** - Respond 200 within 500ms, process async
2. **Data Table Storage** - Native n8n data tables for call logs (no external API deps)
3. **Qdrant Vectors** - Transcript embeddings for semantic search across calls
4. **Graceful Degradation** - CRM/Slack failures don't block core processing
5. **Full Observability** - Processing IDs, status tracking, error aggregation

## Impact

- **Affected specs**: post-call-processing (NEW)
- **Affected code**:
  - `pipelines/elevenlabs-call-completed.json` (REPLACE)
  - `pipelines/elevenlabs-post-call-bulletproof.json` (NEW)
- **Affected systems**: n8n, Qdrant, CRM, Slack, ElevenLabs
- **Breaking changes**: None - new webhook path, old remains active during transition

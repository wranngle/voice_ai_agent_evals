# Change: Add Universal LLM Extraction Engine

## Why

Post-call processing needs structured field extraction from transcripts (BANT, contacts, sentiment), but the only precedent — archived `transcript-field-extractor-v2` — is hardcoded to 22 fixed fields with no category flexibility. The `harden-post-call-webhook` fan-out has a slot for extraction but no engine to fill it. A reusable, category-driven subworkflow eliminates per-use-case rewiring.

## What Changes

- **NEW** `[DEV] LLM Extraction Engine` — n8n subworkflow (~12 nodes)
- **NEW** Extraction config schema: categories → fields → per-field prompts + strictness
- **NEW** Standard output envelope: per-field value + rationale + confidence + validation
- **NEW** 5-component prompt architecture (generalized from archived v2)
- **NEW** Dynamic strictness inference (high/medium/low auto-selected per field type)
- **NEW** 6 default category configs (sales, support, external_contacts, internal_contacts, external_company, internal_company)
- **MODIFIED** `harden-post-call-webhook` fan-out gains an `Execute Workflow` branch calling this engine

## Impact

- **Affected specs**: llm-extraction-engine (NEW), post-call-processing (MODIFIED — new fan-out branch)
- **Affected code**:
  - `[DEV] LLM Extraction Engine` subworkflow (NEW — created via MCP)
  - `[DEV] Post-Call Bulletproof` workflow (MODIFIED — new Execute Workflow node in fan-out)
- **Affected systems**: n8n, Gemini 3 Pro API, Supabase Postgres (`extraction_results` table)
- **Breaking changes**: None — additive subworkflow + optional fan-out branch
- **Depends on**: `harden-post-call-webhook` (fan-out architecture must exist)

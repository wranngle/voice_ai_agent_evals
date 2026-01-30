# Tasks: Add LLM Extraction Engine

## 1. Schema & Config Design

- [x] 1.1 Define extraction config JSON schema (categories + fields + context_rules) ✅ `lib/extraction/types.ts`
- [x] 1.2 Define standard output envelope schema (per-field + top-level wrapper) ✅ `lib/extraction/types.ts`
- [x] 1.3 Define 6 default category configs with all field definitions ✅ `lib/extraction/categories.ts`
- [x] 1.4 Design dynamic strictness inference logic (type → level mapping) ✅ `lib/extraction/strictness.ts`

## 2. Prompt Architecture

- [x] 2.1 Design 5-component prompt template generalized from archived v2 ✅ `lib/extraction/prompt-builder.ts`
- [x] 2.2 Design schema generation logic (field defs → JSON schema for Component C) ✅ `lib/extraction/prompt-builder.ts`
- [x] 2.3 Design extraction rules template (Component E) with strictness-aware instructions ✅ `lib/extraction/prompt-builder.ts`

## 3. Validation & Repair

- [x] 3.1 Design schema validation layer (type-specific: enum, boolean, phone, email, string) ✅ `lib/extraction/validation.ts`
- [x] 3.2 Design repair logic (whitespace trim, enum normalization, type coercion) ✅ `lib/extraction/validation.ts`

## 4. n8n Subworkflow Implementation

- [x] 4.1 Create `[DEV] LLM Extraction Engine` workflow via MCP ✅ (ID: 2Z4wykQk0x1Y67Sr, 11 nodes)
- [x] 4.2 Implement Execute Workflow Trigger node ✅
- [x] 4.3 Implement input validation code node (transcript + config checks) ✅
- [x] 4.4 Implement error response node ✅
- [x] 4.5 Implement category splitter (SplitInBatches) ✅
- [x] 4.6 Implement 5-component prompt builder (Code node) ✅
- [x] 4.7 Implement Gemini 3 Pro httpRequest call (JSON mode, temperature 0.1) ✅
- [x] 4.8 Implement response parser + validator (Code node) ✅
- [x] 4.9 Implement envelope transformer (Code node) ✅ (merged into 4.8)
- [x] 4.10 Implement result aggregator (Aggregate node) ✅ (Code-based aggregator)
- [x] 4.11 Implement post-processor / dedup (Code node) ✅ (merged into 4.10)
- [x] 4.12 Wire all node connections per architecture diagram ✅

## 5. Fan-Out Integration

- [x] 5.1 Add Execute Workflow node to post-call webhook fan-out ✅ Parallel branch from Check Call Status case 0
- [x] 5.2 Persist extraction results to Supabase Postgres ✅ `extraction_results` table (45 columns), HTTP Request node via REST API, pgvector 0.8.0 enabled
- [x] 5.3 Configure onError: continueRegularOutput for graceful degradation ✅

## 6. Testing

- [x] 6.1 Write vitest tests: extraction config schema validation ✅ (26/26 pass)
- [x] 6.2 Write vitest tests: output envelope schema validation ✅
- [x] 6.3 Write vitest tests: strictness inference logic ✅
- [x] 6.4 Test live extraction with sample transcript + sales category config ✅ 6 fields, all correct
- [x] 6.5 Test multi-category extraction (sales + external_contacts) ✅ 2 categories, 11 fields, 0 errors
- [x] 6.6 Test error handling: invalid config, empty transcript, Gemini failure ✅ Validation errors returned correctly
- [x] 6.7 Run full webhook test suite to verify no regression ✅ Failed/abandoned/invalid-agent paths all pass

## 7. Deployment

- [x] 7.1 Activate `[DEV] LLM Extraction Engine` on n8n ✅ Active (workflow 2Z4wykQk0x1Y67Sr)
- [x] 7.2 Test via n8n API with curl (sample transcript + config → verify envelope) ✅ Via test harness webhook
- [x] 7.3 Enable fan-out branch in post-call webhook ✅ Live in [DEV] Post-Call Webhook - Sarah (GZsLwzpsTvl9jIEs)
- [x] 7.4 End-to-end test: real call → extraction fields in Supabase ✅ Execution 21330+21332 — full pipeline success, 6 categories, 31 fields populated, row verified in Supabase Postgres

## Dependencies

- **1.x blocks 2.x**: Schema design informs prompt design
- **1.x + 2.x + 3.x block 4.x**: All design work before implementation
- **4.x blocks 5.x**: Subworkflow must exist before fan-out integration
- **4.x blocks 6.x**: Tests need working workflow
- **6.x blocks 7.x**: Tests pass before deployment
- **Depends on**: `harden-post-call-webhook` fan-out architecture (already deployed)

## Parallelizable Work

- 1.1-1.2 (schemas) || 2.1-2.3 (prompt design) — can proceed in parallel
- 4.3-4.4 (validation) || 4.6 (prompt builder) — independent code nodes
- 6.1-6.3 (unit tests) || 6.4-6.6 (integration tests) — different test levels

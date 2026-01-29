# Tasks: Add LLM Extraction Engine

## 1. Schema & Config Design

- [ ] 1.1 Define extraction config JSON schema (categories + fields + context_rules)
- [ ] 1.2 Define standard output envelope schema (per-field + top-level wrapper)
- [ ] 1.3 Define 6 default category configs with all field definitions
- [ ] 1.4 Design dynamic strictness inference logic (type → level mapping)

## 2. Prompt Architecture

- [ ] 2.1 Design 5-component prompt template generalized from archived v2
- [ ] 2.2 Design schema generation logic (field defs → JSON schema for Component C)
- [ ] 2.3 Design extraction rules template (Component E) with strictness-aware instructions

## 3. Validation & Repair

- [ ] 3.1 Design schema validation layer (type-specific: enum, boolean, phone, email, string)
- [ ] 3.2 Design repair logic (whitespace trim, enum normalization, type coercion)

## 4. n8n Subworkflow Implementation

- [ ] 4.1 Create `[DEV] LLM Extraction Engine` workflow via MCP
- [ ] 4.2 Implement Execute Workflow Trigger node
- [ ] 4.3 Implement input validation code node (transcript + config checks)
- [ ] 4.4 Implement error response node
- [ ] 4.5 Implement category splitter (SplitInBatches)
- [ ] 4.6 Implement 5-component prompt builder (Code node)
- [ ] 4.7 Implement Gemini 3 Pro httpRequest call (JSON mode, temperature 0.1)
- [ ] 4.8 Implement response parser + validator (Code node)
- [ ] 4.9 Implement envelope transformer (Code node)
- [ ] 4.10 Implement result aggregator (Aggregate node)
- [ ] 4.11 Implement post-processor / dedup (Code node)
- [ ] 4.12 Wire all node connections per architecture diagram

## 5. Fan-Out Integration

- [ ] 5.1 Add Execute Workflow node to post-call webhook fan-out
- [ ] 5.2 Map extraction results to post_call_logs BANT columns
- [ ] 5.3 Configure onError: continueErrorOutput for graceful degradation

## 6. Testing

- [ ] 6.1 Write vitest tests: extraction config schema validation
- [ ] 6.2 Write vitest tests: output envelope schema validation
- [ ] 6.3 Write vitest tests: strictness inference logic
- [ ] 6.4 Test live extraction with sample transcript + sales category config
- [ ] 6.5 Test multi-category extraction (sales + external_contacts)
- [ ] 6.6 Test error handling: invalid config, empty transcript, Gemini failure
- [ ] 6.7 Run full webhook test suite to verify no regression

## 7. Deployment

- [ ] 7.1 Activate `[DEV] LLM Extraction Engine` on n8n
- [ ] 7.2 Test via n8n API with curl (sample transcript + config → verify envelope)
- [ ] 7.3 Enable fan-out branch in post-call webhook
- [ ] 7.4 End-to-end test: real call → extraction fields in Data Table

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

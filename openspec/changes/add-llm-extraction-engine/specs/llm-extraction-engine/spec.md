# Capability: LLM Extraction Engine

## Overview

A reusable n8n subworkflow that takes arbitrary input (transcripts, context) plus extraction config (category schemas with per-field prompts) and outputs normalized structured JSON. Uses Gemini 3 Pro with JSON mode and a 5-component prompt architecture.

---

## ADDED Requirements

### Requirement: Subworkflow Input Validation

The system SHALL validate all inputs before attempting extraction.

#### Scenario: Valid inputs
- **WHEN** the caller provides a non-empty transcript, agent_system_prompt, and extraction_config with ≥1 category each containing ≥1 field
- **THEN** the system generates an extraction_id (UUID)
- **AND** proceeds to category splitting

#### Scenario: Empty transcript
- **WHEN** the transcript is empty or missing
- **THEN** the system returns an error envelope with `errors: [{ type: "validation", message: "transcript is required" }]`
- **AND** does not call the LLM

#### Scenario: Invalid extraction config
- **WHEN** extraction_config has no categories or a category has no fields
- **THEN** the system returns an error envelope with `errors: [{ type: "validation", message: "..." }]`
- **AND** does not call the LLM

---

### Requirement: Category-Scoped Extraction

The system SHALL process each category independently via the LLM.

#### Scenario: Single category extraction
- **WHEN** extraction_config contains 1 category with N fields
- **THEN** the system builds one 5-component prompt and makes one Gemini API call
- **AND** returns N field envelopes in the output

#### Scenario: Multi-category extraction
- **WHEN** extraction_config contains M categories
- **THEN** the system makes M sequential Gemini API calls (one per category)
- **AND** aggregates all field envelopes into a single response

#### Scenario: Category extraction failure
- **WHEN** the Gemini API call fails for one category
- **THEN** the system records the error in the `errors` array
- **AND** continues processing remaining categories
- **AND** the failed category's fields are absent from the output

---

### Requirement: 5-Component Prompt Assembly

The system SHALL construct prompts from 5 components for each category.

#### Scenario: Prompt built from config
- **WHEN** a category is processed
- **THEN** the prompt contains: (A) formatted transcript, (B) agent system prompt, (C) JSON response schema derived from field definitions, (D) per-field extraction instructions with types and constraints, (E) extraction rules with strictness and null handling
- **AND** the prompt instructs the LLM to return JSON matching the schema

#### Scenario: Field with explicit prompt
- **WHEN** a field has a `prompt` property
- **THEN** Component D includes that prompt verbatim as the extraction instruction for that field

#### Scenario: Field without explicit prompt
- **WHEN** a field has no `prompt` property
- **THEN** Component D generates a default instruction: "Extract the {field_id} from the transcript"

---

### Requirement: Dynamic Strictness Inference

The system SHALL infer strictness level when not explicitly set on a field.

#### Scenario: High strictness inferred
- **WHEN** a field has type `boolean`, `phone`, or `email`, OR is an enum with ≤5 values, OR has `validation.pattern`
- **THEN** strictness is set to `high`

#### Scenario: Medium strictness inferred
- **WHEN** a field has type `enum` with >5 values, OR type `string` with `required: true`
- **THEN** strictness is set to `medium`

#### Scenario: Low strictness inferred
- **WHEN** a field has type `string` with `required: false`, OR field_id contains "summary", "notes", or "description"
- **THEN** strictness is set to `low`

#### Scenario: Explicit strictness preserved
- **WHEN** a field has an explicit `strictness` property
- **THEN** that value is used regardless of inference rules

---

### Requirement: LLM Call with JSON Mode

The system SHALL call Gemini 3 Pro with structured JSON output.

#### Scenario: Successful extraction
- **WHEN** the Gemini API returns valid JSON
- **THEN** the system parses the response and validates each field
- **AND** sets `validation_passed` per field based on type constraints

#### Scenario: Gemini returns invalid JSON
- **WHEN** the Gemini API returns non-JSON or malformed JSON
- **THEN** the system records an error for that category
- **AND** continues processing remaining categories

#### Scenario: Gemini timeout or failure
- **WHEN** the Gemini API call times out (>30s) or returns HTTP error
- **THEN** the system records the error with status code and message
- **AND** continues processing remaining categories

---

### Requirement: Field-Level Validation

The system SHALL validate extracted values against field type constraints.

#### Scenario: Enum field validation
- **WHEN** a field has type `enum` and strictness `high`
- **THEN** the value must exactly match one of the `values` array entries
- **AND** if no match, `validation_passed` is set to `false`

#### Scenario: Boolean field validation
- **WHEN** a field has type `boolean`
- **THEN** the value must be `true`, `false`, or `null`

#### Scenario: Phone field validation
- **WHEN** a field has type `phone`
- **THEN** the value must match E.164 pattern or be `null`

#### Scenario: Email field validation
- **WHEN** a field has type `email`
- **THEN** the value must match standard email regex or be `null`

#### Scenario: Required field is null
- **WHEN** a field has `required: true` and the extracted value is `null`
- **THEN** `validation_passed` is set to `false`
- **AND** the `default_value` is used if defined

---

### Requirement: Standard Output Envelope

The system SHALL return results in a standard envelope format.

#### Scenario: Successful extraction response
- **WHEN** extraction completes (with or without partial failures)
- **THEN** the response contains `extraction_id`, `timestamp`, `model`, `categories_processed` count, `fields` array, and `errors` array

#### Scenario: Per-field envelope
- **WHEN** a field is extracted
- **THEN** the field envelope contains `category`, `field_id`, `value`, `rationale`, `original_prompt`, `confidence`, `strictness_applied`, and `validation_passed`

#### Scenario: Rationale included when required
- **WHEN** the category's `context_rules.require_rationale` is `true`
- **THEN** each field's `rationale` is a non-empty string explaining the extraction reasoning

#### Scenario: Rationale omitted when not required
- **WHEN** the category's `context_rules.require_rationale` is `false`
- **THEN** each field's `rationale` may be `null`

---

### Requirement: Response Repair

The system SHALL attempt to repair common LLM response issues before validation.

#### Scenario: Whitespace in enum values
- **WHEN** an enum value has leading/trailing whitespace
- **THEN** the system trims it before validation

#### Scenario: Case mismatch in enums
- **WHEN** an enum value matches case-insensitively but not exactly
- **THEN** the system normalizes to the canonical case from the `values` array

#### Scenario: String "true"/"false" for booleans
- **WHEN** a boolean field receives string `"true"` or `"false"`
- **THEN** the system coerces to actual boolean `true` or `false`

---

### Requirement: Post-Call Webhook Integration

The system SHALL integrate as a fan-out branch in the post-call webhook.

#### Scenario: Extraction called during post-call processing
- **WHEN** a post_call_transcription event is processed
- **THEN** the extraction engine is called via Execute Workflow node
- **AND** runs in parallel with DataTbl Logger, Slack Notifier, CRM Graceful, and Qdrant Embeddings

#### Scenario: Extraction results written to Supabase
- **WHEN** extraction completes successfully
- **THEN** all extracted fields are written to the `extraction_results` table in Supabase Postgres via REST API
- **AND** the `raw_envelope` JSONB column contains the full extraction output

#### Scenario: Extraction failure does not block other branches
- **WHEN** the extraction engine fails or times out
- **THEN** other fan-out branches (Slack, CRM, Qdrant) continue unaffected
- **AND** the error is logged via onError: continueRegularOutput

---

## Acceptance Criteria Summary

| Requirement | Critical | Acceptance Test |
|-------------|----------|-----------------|
| Input Validation | YES | Invalid inputs return error envelope, no LLM call |
| Category-Scoped Extraction | YES | Each category produces field envelopes independently |
| 5-Component Prompt | YES | Prompt contains all 5 components from config |
| Dynamic Strictness | NO | Fields without explicit strictness get inferred level |
| LLM JSON Mode | YES | Gemini returns parseable JSON for valid prompts |
| Field Validation | YES | Type constraints enforced, validation_passed accurate |
| Standard Envelope | YES | Output matches envelope schema |
| Response Repair | NO | Common issues auto-corrected before validation |
| Webhook Integration | YES | Fan-out branch calls engine, results in data table |

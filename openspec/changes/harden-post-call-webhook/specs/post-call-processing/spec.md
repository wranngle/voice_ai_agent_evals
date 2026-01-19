# Capability: Post-Call Processing

## Overview

The post-call processing system handles ElevenLabs webhook events after voice calls complete, storing call data, vectorizing transcripts, updating CRM, and notifying the team.

---

## ADDED Requirements

### Requirement: Immediate Webhook Acknowledgment

The system SHALL acknowledge incoming webhooks within 500ms to prevent ElevenLabs timeout.

#### Scenario: Successful webhook receipt
- **WHEN** ElevenLabs sends a POST request to `/webhook/post-call-bulletproof`
- **THEN** the system responds with HTTP 200 within 500ms
- **AND** the response contains `{ received: true, processing_id: "<uuid>", timestamp: "<iso>" }`

#### Scenario: Malformed request body
- **WHEN** the webhook payload is missing required fields (type, data.conversation_id)
- **THEN** the system responds with HTTP 200 (ACK first)
- **AND** logs the validation error to the data table
- **AND** does not proceed with downstream processing

---

### Requirement: Schema Validation

The system SHALL validate incoming webhook payloads against the expected schema before processing.

#### Scenario: Valid post_call_transcription event
- **WHEN** payload contains `type: "post_call_transcription"` and valid `data` object
- **THEN** the system extracts and normalizes all fields
- **AND** generates a unique `processing_id` for tracing
- **AND** routes to the transcription processing branch

#### Scenario: Valid call_initiation_failure event
- **WHEN** payload contains `type: "call_initiation_failure"`
- **THEN** the system extracts failure_reason
- **AND** routes to the failure processing branch

#### Scenario: Unknown event type
- **WHEN** payload contains an unrecognized `type` value
- **THEN** the system logs the event with type "unknown"
- **AND** does not attempt CRM or vector operations

---

### Requirement: Data Table Storage

The system SHALL persist all call events to an n8n data table for audit and querying.

#### Scenario: Successful call logged
- **WHEN** a valid post_call_transcription event is received
- **THEN** a record is inserted into `post_call_logs` table
- **AND** the record includes conversation_id, agent_id, customer info, BANT data
- **AND** crm_updated, vector_stored, slack_notified are initially false

#### Scenario: Failed call logged
- **WHEN** a call_initiation_failure event is received
- **THEN** a record is inserted with event_type "call_initiation_failure"
- **AND** failure_reason is stored in the errors field

#### Scenario: Data table write failure
- **WHEN** the data table insert fails after 3 retries
- **THEN** the system queues the event to a dead-letter mechanism
- **AND** sends a priority Slack alert

---

### Requirement: Transcript Vectorization

The system SHALL generate embeddings for call transcripts and store them in Qdrant for semantic search.

#### Scenario: Transcript available and vectorized
- **WHEN** a call has transcript data (transcript array length > 0)
- **THEN** the system concatenates transcript messages into text
- **AND** generates embeddings via OpenAI text-embedding-3-small
- **AND** upserts the vector to Qdrant collection `call_transcripts`
- **AND** updates the data table record with vector_stored=true

#### Scenario: No transcript available
- **WHEN** a call has empty or missing transcript array
- **THEN** the system skips vectorization
- **AND** sets vector_stored=false in the data table

#### Scenario: Qdrant upsert failure
- **WHEN** Qdrant upsert fails after 2 retries
- **THEN** the system continues processing other branches
- **AND** logs the error and sets vector_stored=false

---

### Requirement: CRM Integration (Graceful)

The system SHALL update CRM CRM when a valid person ID is available, gracefully degrading on failure.

#### Scenario: CRM update with valid person ID
- **WHEN** dynamic_variables contains crm_person_id > 0
- **THEN** the system creates a note on the CRM person
- **AND** updates the person's label based on qualification status
- **AND** sets crm_updated=true in the data table

#### Scenario: No CRM person ID available
- **WHEN** crm_person_id is null, 0, or missing
- **THEN** the system skips CRM operations
- **AND** logs "No CRM ID - skipped" as a warning
- **AND** sets crm_updated=false

#### Scenario: CRM API failure
- **WHEN** CRM note creation or person update fails after 3 retries
- **THEN** the system continues processing other branches
- **AND** logs the error and sets crm_updated=false

---

### Requirement: Slack Notifications

The system SHALL send Slack notifications for call completions and failures.

#### Scenario: Successful call notification
- **WHEN** a post_call_transcription event with call_successful="success" is processed
- **THEN** a Slack message is sent with green checkmark emoji
- **AND** includes customer name, duration, outcome, and conversation ID

#### Scenario: Failed call notification
- **WHEN** a call_initiation_failure event is processed
- **THEN** a Slack message is sent to the alerts channel
- **AND** includes failure reason and conversation ID

#### Scenario: Slack webhook failure
- **WHEN** Slack webhook POST fails
- **THEN** the system continues without retry (fire-and-forget)
- **AND** sets slack_notified=false

---

### Requirement: Error Aggregation

The system SHALL aggregate results from all processing branches and update the final status.

#### Scenario: All branches succeed
- **WHEN** data table, Qdrant, CRM, and Slack all succeed
- **THEN** the data table record is updated with all flags=true
- **AND** completed_at timestamp is set
- **AND** errors array is empty

#### Scenario: Partial failure
- **WHEN** some branches fail but data table succeeds
- **THEN** the data table record reflects which branches succeeded/failed
- **AND** errors array contains details of each failure
- **AND** processing continues to completion

---

### Requirement: Idempotency

The system SHALL handle duplicate webhook deliveries gracefully.

#### Scenario: Duplicate conversation_id received
- **WHEN** a webhook with an already-processed conversation_id arrives
- **THEN** the system checks the data table for existing record
- **AND** if found within last 5 minutes, skips processing
- **AND** responds with HTTP 200 and `{ deduplicated: true }`

---

## Acceptance Criteria Summary

| Requirement | Critical | Acceptance Test |
|-------------|----------|-----------------|
| Immediate ACK | YES | Response time < 500ms |
| Schema Validation | YES | Invalid payloads logged, not processed |
| Data Table Storage | YES | 100% of events persisted |
| Transcript Vectorization | NO | Transcripts searchable in Qdrant |
| CRM Integration | NO | Notes created when person_id provided |
| Slack Notifications | NO | Team notified of completions/failures |
| Error Aggregation | YES | Final status accurately reflects results |
| Idempotency | YES | Duplicates detected and skipped |

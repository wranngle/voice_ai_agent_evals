# Tasks: Harden Post-Call Webhook

## 1. Infrastructure Setup

- [ ] 1.1 Set up Qdrant instance (Docker or cloud)
- [ ] 1.2 Create `call_transcripts` collection with 1536-dim vectors
- [ ] 1.3 Create n8n data table `post_call_logs` with schema from design.md
- [ ] 1.4 Configure n8n variables for Qdrant URL, Slack webhook, OpenAI key

## 2. Core Workflow Implementation

- [ ] 2.1 Create `elevenlabs-post-call-bulletproof.json` workflow shell
- [ ] 2.2 Add webhook receiver node with stable webhookId
- [ ] 2.3 Add immediate ACK response node (respondToWebhook)
- [ ] 2.4 Add schema validation code node with processing_id generation
- [ ] 2.5 Add event type router (switch node) with 4 outputs

## 3. Data Layer Nodes

- [ ] 3.1 Add data table insert node for `post_call_logs`
- [ ] 3.2 Configure retry policy (3x, 1s exponential backoff)
- [ ] 3.3 Add OpenAI embeddings HTTP request node
- [ ] 3.4 Add Qdrant upsert HTTP request node
- [ ] 3.5 Configure Qdrant retry policy (2x, 2s linear)

## 4. Integration Nodes

- [ ] 4.1 Add Slack notification HTTP request node
- [ ] 4.2 Configure Slack message blocks with call details
- [ ] 4.3 Add CRM prep code node (build note content, determine skip)
- [ ] 4.4 Add CRM create note node with retry
- [ ] 4.5 Add CRM update person node with retry

## 5. Finalization Nodes

- [ ] 5.1 Add error aggregator code node
- [ ] 5.2 Add data table update node for final status
- [ ] 5.3 Wire all node connections per architecture diagram

## 6. Error Handling

- [ ] 6.1 Add `onError: continueErrorOutput` to all external nodes
- [ ] 6.2 Add dead-letter queue workflow for critical failures
- [ ] 6.3 Add priority Slack alert for data table failures

## 7. Testing

- [ ] 7.1 Test happy path with qualified lead payload
- [ ] 7.2 Test no-CRM-ID path (should skip CRM, still log)
- [ ] 7.3 Test call failure event path
- [ ] 7.4 Test invalid payload handling
- [ ] 7.5 Test idempotency with duplicate conversation_id
- [ ] 7.6 Verify Qdrant vectors are searchable
- [ ] 7.7 Verify Slack notifications appear correctly

## 8. Deployment

- [x] 8.1 Deploy workflow to n8n as `[DEV] Post-Call Bulletproof` ✅ (ID: FGjUvywqh09XKlYJ, active)
- [x] 8.2 Test with manual curl requests ✅ (200 OK, processing_id generated)
- [x] 8.3 Update ElevenLabs agent webhook URL to new path ✅ (webhook_id: 2c4f042463864b7580f38a2fd5d14114)
- [ ] 8.4 Monitor for 48h in parallel with old workflow
- [ ] 8.5 Promote to `[PROD]` after validation
- [ ] 8.6 Deactivate old `elevenlabs-call-completed` workflow
- [ ] 8.7 Archive old workflow to `old/` directory

## Dependencies

- **1.x blocks 2.x**: Infrastructure must be ready before workflow
- **2.x blocks 3.x-5.x**: Core nodes needed before data/integration layers
- **6.x parallel with 3.x-5.x**: Error handling can be added alongside
- **7.x after 5.x**: Testing requires complete workflow
- **8.x after 7.x**: Deployment after testing passes

## Parallelizable Work

- 3.1-3.2 (Data Table) || 3.3-3.5 (Qdrant) - can build simultaneously
- 4.1-4.2 (Slack) || 4.3-4.5 (CRM) - can build simultaneously
- 6.1-6.3 (Error handling) - can be added to nodes as they're built

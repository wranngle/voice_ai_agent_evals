import {type} from 'arktype';

export const WebhookEventTypeSchema = type('\'conversation.started\' | \'conversation.ended\' | \'transcript.ready\' | \'analysis.complete\'');

const ConversationMetadataSchema = type({
  conversationId: 'string > 0',
  agentId: 'string > 0',
  startedAtMs: 'number.integer >= 0',
  'endedAtMs?': 'number.integer >= 0',
});

const TranscriptDataSchema = type({
  conversationId: 'string > 0',
  turns: type({
    role: '\'agent\' | \'caller\'',
    text: 'string > 0',
    startedAtMs: 'number.integer >= 0',
    durationMs: 'number.integer > 0',
  })
    .array()
    .atLeastLength(1),
  completedAtMs: 'number.integer > 0',
});

export const AnalysisDataSchema = type({
  conversationId: 'string > 0',
  sentiment: '\'positive\' | \'neutral\' | \'negative\'',
  resolved: 'boolean',
  summaryText: 'string > 0',
});
export type AnalysisData = typeof AnalysisDataSchema.infer;

export const WebhookPayloadSchema = type({
  type: WebhookEventTypeSchema,
  timestamp: 'string.date.iso',
  'conversationMetadata?': ConversationMetadataSchema,
  'transcriptData?': TranscriptDataSchema,
  'analysisData?': AnalysisDataSchema,
});
export type WebhookPayload = typeof WebhookPayloadSchema.infer;

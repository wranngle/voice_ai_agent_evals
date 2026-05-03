import { z } from "zod";

export const WebhookEventTypeSchema = z.enum([
  "conversation.started",
  "conversation.ended",
  "transcript.ready",
  "analysis.complete",
]);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

export const ConversationMetadataSchema = z.object({
  conversationId: z.string().min(1),
  agentId: z.string().min(1),
  startedAtMs: z.number().int().nonnegative(),
  endedAtMs: z.number().int().nonnegative().optional(),
});
export type ConversationMetadata = z.infer<typeof ConversationMetadataSchema>;

export const TranscriptDataSchema = z.object({
  conversationId: z.string().min(1),
  turns: z.array(
    z.object({
      role: z.enum(["agent", "caller"]),
      text: z.string().min(1),
      startedAtMs: z.number().int().nonnegative(),
      durationMs: z.number().int().positive(),
    })
  ).min(1),
  completedAtMs: z.number().int().positive(),
});
export type TranscriptData = z.infer<typeof TranscriptDataSchema>;

export const AnalysisDataSchema = z.object({
  conversationId: z.string().min(1),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  resolved: z.boolean(),
  summaryText: z.string().min(1),
});
export type AnalysisData = z.infer<typeof AnalysisDataSchema>;

export const WebhookPayloadSchema = z.object({
  type: WebhookEventTypeSchema,
  timestamp: z.string().datetime(),
  conversationMetadata: ConversationMetadataSchema.optional(),
  transcriptData: TranscriptDataSchema.optional(),
  analysisData: AnalysisDataSchema.optional(),
});
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export const WebhookRequestSchema = z.object({
  headers: z.record(z.string(), z.string()),
  body: WebhookPayloadSchema,
});
export type WebhookRequest = z.infer<typeof WebhookRequestSchema>;

import { z } from "zod";

export const TurnRoleSchema = z.enum(["agent", "caller"]);
export type TurnRole = z.infer<typeof TurnRoleSchema>;

export const TurnSchema = z.object({
  role: TurnRoleSchema,
  text: z.string().min(1),
  startedAtMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const ConversationSchema = z.object({
  id: z.string().min(1),
  agentName: z.string().min(1),
  turns: z.array(TurnSchema).min(1),
  closedAtMs: z.number().int().positive(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const EvaluationFindingSchema = z.object({
  rule: z.string().min(1),
  passed: z.boolean(),
  detail: z.string(),
});
export type EvaluationFinding = z.infer<typeof EvaluationFindingSchema>;

export const EvaluationResultSchema = z.object({
  conversationId: z.string().min(1),
  evaluatedAt: z.string().min(1),
  findings: z.array(EvaluationFindingSchema),
  passed: z.boolean(),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

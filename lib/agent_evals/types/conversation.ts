import {type} from 'arktype';

const TurnRoleSchema = type('\'agent\' | \'caller\'');

const TurnSchema = type({
  role: TurnRoleSchema,
  text: 'string > 0',
  startedAtMs: 'number.integer >= 0',
  durationMs: 'number.integer > 0',
});
export type Turn = typeof TurnSchema.infer;

export const ConversationSchema = type({
  id: 'string > 0',
  agentName: 'string > 0',
  turns: TurnSchema.array().atLeastLength(1),
  closedAtMs: 'number.integer > 0',
});
export type Conversation = typeof ConversationSchema.infer;

const EvaluationFindingSchema = type({
  rule: 'string > 0',
  passed: 'boolean',
  detail: 'string',
});
export type EvaluationFinding = typeof EvaluationFindingSchema.infer;

const EvaluationResultSchema = type({
  conversationId: 'string > 0',
  evaluatedAt: 'string > 0',
  findings: EvaluationFindingSchema.array(),
  passed: 'boolean',
});
export type EvaluationResult = typeof EvaluationResultSchema.infer;

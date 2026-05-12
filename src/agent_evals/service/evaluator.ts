import type {
  Conversation,
  EvaluationFinding,
  EvaluationResult,
} from '../types';
import type {ConversationRepository} from '../repo';
import {
  type Clock, type Logger, type MetricsSink, NoopMetricsSink,
} from '../providers';

export type EvaluationRules = {
  maxTurnDurationMs: number;
  minAgentTurnRatio: number;
};

export type Evaluator = {
  evaluateAll(): EvaluationResult[];
};

export type EvaluatorDeps = {
  repository: ConversationRepository;
  rules: EvaluationRules;
  clock: Clock;
  logger: Logger;
  metrics?: MetricsSink;
};

export function createEvaluator(deps: EvaluatorDeps): Evaluator {
  const {repository, rules, clock, logger, metrics = NoopMetricsSink} = deps;
  return {
    evaluateAll(): EvaluationResult[] {
      const conversations = repository.loadAll();
      logger.info('evaluator.start', {count: conversations.length});
      const results = conversations.map(conversation =>
        evaluateOne(conversation, rules, clock));
      const failed = results.filter(r => !r.passed).length;

      metrics.incrementCounter('agent_evals_evaluations_total', results.length);
      if (failed > 0) {
        metrics.incrementCounter(
          'agent_evals_evaluations_failed_total',
          failed,
        );
      }

      for (const result of results) {
        for (const finding of result.findings) {
          if (!finding.passed) {
            metrics.incrementCounter('agent_evals_findings_failed_total', 1, {
              rule: finding.rule,
            });
          }
        }
      }

      logger.info('evaluator.done', {failed, total: results.length});
      return results;
    },
  };
}

function evaluateOne(
  conversation: Conversation,
  rules: EvaluationRules,
  clock: Clock,
): EvaluationResult {
  const findings: EvaluationFinding[] = [
    checkTurnDurations(conversation, rules.maxTurnDurationMs),
    checkAgentTurnRatio(conversation, rules.minAgentTurnRatio),
    checkMonotonicTimestamps(conversation),
  ];
  return {
    conversationId: conversation.id,
    evaluatedAt: clock.nowIso(),
    findings,
    passed: findings.every(f => f.passed),
  };
}

function checkTurnDurations(
  conversation: Conversation,
  maxMs: number,
): EvaluationFinding {
  const offending = conversation.turns.find(t => t.durationMs > maxMs);
  if (offending) {
    return {
      rule: 'turn-duration-cap',
      passed: false,
      detail: `turn at ${offending.startedAtMs}ms ran ${offending.durationMs}ms (cap ${maxMs}ms)`,
    };
  }

  return {rule: 'turn-duration-cap', passed: true, detail: 'all turns within cap'};
}

function checkAgentTurnRatio(
  conversation: Conversation,
  minRatio: number,
): EvaluationFinding {
  const total = conversation.turns.length;
  const agentTurns = conversation.turns.filter(t => t.role === 'agent').length;
  const ratio = total === 0 ? 0 : agentTurns / total;
  if (ratio < minRatio) {
    return {
      rule: 'agent-turn-ratio',
      passed: false,
      detail: `agent share ${ratio.toFixed(2)} below minimum ${minRatio.toFixed(2)}`,
    };
  }

  return {
    rule: 'agent-turn-ratio',
    passed: true,
    detail: `agent share ${ratio.toFixed(2)}`,
  };
}

function checkMonotonicTimestamps(conversation: Conversation): EvaluationFinding {
  let last = -1;
  for (const turn of conversation.turns) {
    if (turn.startedAtMs <= last) {
      return {
        rule: 'monotonic-timestamps',
        passed: false,
        detail: `turn started at ${turn.startedAtMs}ms regresses past ${last}ms`,
      };
    }

    last = turn.startedAtMs;
  }

  return {rule: 'monotonic-timestamps', passed: true, detail: 'ordered'};
}

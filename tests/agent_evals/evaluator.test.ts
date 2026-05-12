import {describe, expect, test} from 'vitest';
import {createEvaluator} from '../../src/agent_evals/service';
import type {ConversationRepository} from '../../src/agent_evals/repo';
import type {Conversation} from '../../src/agent_evals/types';
import {createFixedClock} from '../../src/agent_evals/providers/clock';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {};

const silentLogger = {
  info: noop,
  warn: noop,
};

function repo(conversations: Conversation[]): ConversationRepository {
  return {loadAll: () => conversations};
}

const goodConversation: Conversation = {
  id: 'good',
  agentName: 'Aria',
  closedAtMs: 10_000,
  turns: [
    {
      role: 'agent', text: 'Hi', startedAtMs: 0, durationMs: 1000,
    },
    {
      role: 'caller', text: 'Hi back', startedAtMs: 1500, durationMs: 1000,
    },
    {
      role: 'agent', text: 'How can I help?', startedAtMs: 3000, durationMs: 1500,
    },
  ],
};

describe('evaluator', () => {
  test('passes a balanced, well-ordered conversation', () => {
    const evaluator = createEvaluator({
      repository: repo([goodConversation]),
      rules: {maxTurnDurationMs: 30_000, minAgentTurnRatio: 0.3},
      clock: createFixedClock('2026-04-30T00:00:00Z'),
      logger: silentLogger,
    });
    const [result] = evaluator.evaluateAll();
    expect(result?.passed).toBe(true);
    expect(result?.evaluatedAt).toBe('2026-04-30T00:00:00Z');
  });

  test('flags an over-long agent turn', () => {
    const conversation: Conversation = {
      ...goodConversation,
      id: 'long-turn',
      turns: [
        {
          role: 'agent', text: 'Hi', startedAtMs: 0, durationMs: 60_000,
        },
        {
          role: 'caller', text: 'ok', startedAtMs: 61_000, durationMs: 500,
        },
      ],
    };
    const evaluator = createEvaluator({
      repository: repo([conversation]),
      rules: {maxTurnDurationMs: 30_000, minAgentTurnRatio: 0.3},
      clock: createFixedClock('2026-04-30T00:00:00Z'),
      logger: silentLogger,
    });
    const [result] = evaluator.evaluateAll();
    expect(result?.passed).toBe(false);
    expect(result?.findings.find(f => f.rule === 'turn-duration-cap')?.passed).toBe(false);
  });

  test('flags a conversation where the agent barely speaks', () => {
    const conversation: Conversation = {
      id: 'agent-silent',
      agentName: 'Aria',
      closedAtMs: 10_000,
      turns: [
        {
          role: 'caller', text: '?', startedAtMs: 0, durationMs: 500,
        },
        {
          role: 'caller', text: '??', startedAtMs: 600, durationMs: 500,
        },
        {
          role: 'caller', text: '???', startedAtMs: 1200, durationMs: 500,
        },
        {
          role: 'agent', text: 'uh', startedAtMs: 1800, durationMs: 200,
        },
      ],
    };
    const evaluator = createEvaluator({
      repository: repo([conversation]),
      rules: {maxTurnDurationMs: 30_000, minAgentTurnRatio: 0.3},
      clock: createFixedClock('2026-04-30T00:00:00Z'),
      logger: silentLogger,
    });
    const [result] = evaluator.evaluateAll();
    expect(result?.passed).toBe(false);
    expect(result?.findings.find(f => f.rule === 'agent-turn-ratio')?.passed).toBe(false);
  });

  test('flags timestamps that go backwards', () => {
    const conversation: Conversation = {
      id: 'regressing',
      agentName: 'Aria',
      closedAtMs: 5000,
      turns: [
        {
          role: 'agent', text: 'first', startedAtMs: 100, durationMs: 200,
        },
        {
          role: 'caller', text: 'regress', startedAtMs: 50, durationMs: 200,
        },
      ],
    };
    const evaluator = createEvaluator({
      repository: repo([conversation]),
      rules: {maxTurnDurationMs: 30_000, minAgentTurnRatio: 0.3},
      clock: createFixedClock('2026-04-30T00:00:00Z'),
      logger: silentLogger,
    });
    const [result] = evaluator.evaluateAll();
    expect(result?.passed).toBe(false);
    expect(result?.findings.find(f => f.rule === 'monotonic-timestamps')?.passed).toBe(false);
  });
});

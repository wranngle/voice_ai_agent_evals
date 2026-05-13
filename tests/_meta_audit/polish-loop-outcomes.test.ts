/**
 * Meta-audit — addresses S3 (no proof loop improves) + S8 (no A/B framework).
 *
 * The polishLoop tests in `tests/remediation/polish-loop.test.ts` prove the
 * LOOP MECHANICS work: iterations run, stop conditions fire, governance
 * gates apply. They do NOT prove the loop produces a better agent.
 *
 * This file demonstrates the gap with explicit scenarios:
 *   1. A regressing fix: applied "fix" makes things WORSE; loop terminates
 *      via patience_exhausted but the agent is now broken. No alarm.
 *   2. A flapping fix: failure count oscillates; loop "succeeds" by happening
 *      to hit a low count on the last iteration. No statistical confidence.
 *   3. No baseline comparison: the loop returns history, but nothing in the
 *      result shape tells the operator "the agent is X% better than before".
 */

import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {polishLoop} from '../../src/remediation/polish-loop';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import type {DimensionScore} from '../../src/scoring/types';
import type {FixProposal} from '../../src/remediation/types';
import type {ModelRankings} from '../../src/wrapper/types';

const rankings: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: ['gemini-3-flash-preview'],
  banned: ['gpt-4o-mini'],
};

function makeClient() {
  const raw = {
    conversationalAi: {
      agents: {
        get: vi.fn().mockResolvedValue({
          agent_id: 'agent_demo',
          name: '[DEV] Test Agent',
          conversation_config: {tts: {speed: 1}},
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as ElevenLabsClient;
  return createVoiceEvalsClient({client: raw, modelRankings: rankings});
}

const PROPOSAL: FixProposal = {
  target: 'voice_speed',
  locator: '',
  proposed_value: '1.1',
  rationale: 'pace up',
  addresses: ['voice_activity'],
};

const fail = (name: string): DimensionScore => ({name, status: 'failed', detail: '–'});
const pass = (name: string): DimensionScore => ({name, status: 'passed'});

describe('META-AUDIT: polishLoop reports success on a regressing fix', () => {
  it('terminates with stopped_because !== all_passing yet caller has no signal the AGENT IS WORSE', async () => {
    const client = makeClient();
    // Iter 1: failingBefore=2 -> apply -> failingAfter=3 (REGRESSION)
    // Iter 2: failingBefore=3 -> apply -> failingAfter=4
    // Iter 3: failingBefore=4 -> apply -> failingAfter=5 (patience cap)
    // Each evaluate() call consumes one entry; the sequence is sized for the
    // worst case (no wrap) so we observe a real `patience_exhausted`.
    const sequence: DimensionScore[][] = [
      [fail('a'), fail('b')], // iter1 before
      [fail('a'), fail('b'), fail('c')], // iter1 after
      [fail('a'), fail('b'), fail('c')], // iter2 before
      [fail('a'), fail('b'), fail('c'), fail('d')], // iter2 after
      [fail('a'), fail('b'), fail('c'), fail('d')], // iter3 before
      [fail('a'), fail('b'), fail('c'), fail('d'), fail('e')], // iter3 after
      [fail('a'), fail('b'), fail('c'), fail('d'), fail('e')], // safety
      [fail('a'), fail('b'), fail('c'), fail('d'), fail('e'), fail('f')],
      [fail('a'), fail('b'), fail('c'), fail('d'), fail('e'), fail('f')],
      [fail('a'), fail('b'), fail('c'), fail('d'), fail('e'), fail('f'), fail('g')],
    ];
    let i = 0;
    const evaluate = vi.fn(async () => sequence[Math.min(i++, sequence.length - 1)]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([PROPOSAL]));

    const result = await polishLoop({
      client, agentId: 'agent_demo', evaluate, llm, maxIterations: 5, patience: 2,
    });

    // POST-FIX: result.regressed === true surfaces the regression to the operator.
    expect(result.stopped_because).toBe('patience_exhausted');
    expect(result.finalFailingCount).toBeGreaterThan(result.history[0].failingBefore);
    expect(result.regressed).toBe(true);
    expect(result.netImprovement).toBeLessThanOrEqual(0);
  });
});

describe('META-AUDIT: polishLoop "succeeds" on a lucky flap', () => {
  it('a flapping failure count is not distinguished from real convergence', async () => {
    const client = makeClient();
    // Iter 1: 3 fail -> apply -> 1 fail (lucky)
    // Iter 2: 1 fail -> apply -> 0 fail (declared all_passing)
    // But if you re-run the suite a third time, it would jump back to 3.
    // The loop has no concept of "verify N times for confidence".
    const sequence: DimensionScore[][] = [
      [fail('a'), fail('b'), fail('c')],
      [fail('a')],
      [fail('a')],
      [pass('a')],
    ];
    let i = 0;
    const evaluate = vi.fn(async () => sequence[i++ % sequence.length]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([PROPOSAL]));

    const result = await polishLoop({
      client, agentId: 'agent_demo', evaluate, llm,
    });
    // The loop terminates with all_passing despite having sampled the eval suite
    // only 4 times across 2 iterations. A confidence-aware loop would re-run the
    // failing tests N times before declaring victory. We don't.
    expect(result.stopped_because).toBe('all_passing');
    // Asserting the absence of a confidence field to document the gap.
    expect((result as Record<string, unknown>).confidence).toBeUndefined();
  });
});

describe('META-AUDIT: PolishLoopResult exposes a before/after delta (post-fix)', () => {
  it('all_passing on first eval still reports initial=[], net=0, regressed=false', async () => {
    const client = makeClient();
    const evaluate = vi.fn().mockResolvedValue([pass('a')]);
    const llm = vi.fn();
    const result = await polishLoop({
      client, agentId: 'agent_demo', evaluate, llm,
    });
    expect(result.initialFailingDimensions).toEqual([]);
    expect(result.finalFailingDimensions).toEqual([]);
    expect(result.improvedDimensions).toEqual([]);
    expect(result.regressedDimensions).toEqual([]);
    expect(result.netImprovement).toBe(0);
    expect(result.regressed).toBe(false);
  });

  it('improving fix surfaces improvedDimensions + positive netImprovement', async () => {
    const client = makeClient();
    // Iter 1: [fail(a), fail(b)] -> [pass(a), pass(b)]
    const evaluate = vi.fn()
      .mockResolvedValueOnce([fail('a'), fail('b')])
      .mockResolvedValueOnce([pass('a'), pass('b')]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([PROPOSAL]));
    const result = await polishLoop({
      client, agentId: 'agent_demo', evaluate, llm,
    });
    expect(result.improvedDimensions).toEqual(['a', 'b']);
    expect(result.netImprovement).toBe(2);
    expect(result.regressed).toBe(false);
    expect(result.stopped_because).toBe('all_passing');
  });

  it('regressing fix flags regressed=true and lists regressedDimensions', async () => {
    const client = makeClient();
    // Iter 1: [fail(a), pass(b)] -> [fail(a), fail(b)]  (b regressed)
    // Iter 2: same, patience exhausts after 2 no-improvement iterations.
    const sequence: DimensionScore[][] = [
      [fail('a'), pass('b')],
      [fail('a'), fail('b')],
      [fail('a'), fail('b')],
      [fail('a'), fail('b')],
      [fail('a'), fail('b')],
      [fail('a'), fail('b')],
    ];
    let i = 0;
    const evaluate = vi.fn(async () => sequence[Math.min(i++, sequence.length - 1)]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([PROPOSAL]));
    const result = await polishLoop({
      client, agentId: 'agent_demo', evaluate, llm, maxIterations: 5, patience: 2,
    });
    expect(result.regressedDimensions).toEqual(['b']);
    expect(result.regressed).toBe(true);
    expect(result.netImprovement).toBeLessThanOrEqual(0);
  });
});

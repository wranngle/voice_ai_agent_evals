import {describe, expect, it} from 'vitest';
import {captureBaseline} from '../../src/regression/baseline';
import {diffAgainstBaseline} from '../../src/regression/diff';
import type {BaselineRun} from '../../src/regression/types';

function makeRun(test_id: string, score: number, status: 'passed' | 'failed' = 'passed'): BaselineRun {
  return {
    test_id,
    outcome: {
      status,
      dimensions: [{name: 'main', status, score}],
      score,
      errors: [],
    },
  };
}

const baselineNow = () => '2026-05-10T00:00:00.000Z';

describe('diffAgainstBaseline', () => {
  it('reports overall scores and per-test deltas', () => {
    const baseline = captureBaseline(
      [makeRun('TC-1', 0.8), makeRun('TC-2', 0.6)],
      {name: 'base', now: baselineNow},
    );
    const current = [makeRun('TC-1', 0.9), makeRun('TC-2', 0.5)];

    const result = diffAgainstBaseline(current, baseline);
    expect(result.scores.baseline).toBeCloseTo(0.7);
    expect(result.scores.current).toBeCloseTo(0.7);
    expect(result.scores.diff).toBeCloseTo(0);

    const tc1 = result.perTest.find(t => t.test_id === 'TC-1')!;
    expect(tc1.diff).toBeCloseTo(0.1);
    expect(tc1.direction).toBe('improved');
    expect(tc1.statusChanged).toBe(false);

    const tc2 = result.perTest.find(t => t.test_id === 'TC-2')!;
    expect(tc2.diff).toBeCloseTo(-0.1);
    expect(tc2.direction).toBe('regressed');
  });

  it('separates improvements / regressions / unchanged by threshold', () => {
    const baseline = captureBaseline(
      [makeRun('a', 0.5), makeRun('b', 0.5), makeRun('c', 0.5)],
      {name: 'base', now: baselineNow},
    );
    const current = [
      makeRun('a', 0.51), // within default 0.02 threshold -> unchanged
      makeRun('b', 0.65), // > threshold -> improved
      makeRun('c', 0.4), // > threshold -> regressed
    ];

    const result = diffAgainstBaseline(current, baseline);
    expect(result.unchanged.map(t => t.test_id)).toEqual(['a']);
    expect(result.improvements.map(t => t.test_id)).toEqual(['b']);
    expect(result.regressions.map(t => t.test_id)).toEqual(['c']);
  });

  it('always classifies status flips as improvements/regressions regardless of magnitude', () => {
    const baseline = captureBaseline(
      [makeRun('flip', 0.55, 'passed')],
      {name: 'base', now: baselineNow},
    );
    const current = [makeRun('flip', 0.5, 'failed')]; // tiny score diff, but status changed
    const result = diffAgainstBaseline(current, baseline);
    expect(result.regressions[0].test_id).toBe('flip');
    expect(result.regressions[0].statusChanged).toBe(true);
  });

  it('reports new and dropped tests', () => {
    const baseline = captureBaseline(
      [makeRun('TC-keep', 0.5), makeRun('TC-dropped', 0.7)],
      {name: 'base', now: baselineNow},
    );
    const current = [makeRun('TC-keep', 0.5), makeRun('TC-new', 0.6)];

    const result = diffAgainstBaseline(current, baseline);
    expect(result.newTests).toEqual(['TC-new']);
    expect(result.droppedTests).toEqual(['TC-dropped']);
    expect(result.improvements.some(t => t.test_id === 'TC-new')).toBe(true);
    expect(result.regressions.some(t => t.test_id === 'TC-dropped')).toBe(true);
  });

  it('emits per-dimension diffs for shared tests', () => {
    const baselineRun: BaselineRun = {
      test_id: 'TC-1',
      outcome: {
        status: 'failed',
        dimensions: [
          {name: 'latency', status: 'passed', score: 1},
          {name: 'tone', status: 'failed', score: 0.3},
        ],
        score: 0.65,
        errors: [],
      },
    };
    const currentRun: BaselineRun = {
      test_id: 'TC-1',
      outcome: {
        status: 'passed',
        dimensions: [
          {name: 'latency', status: 'passed', score: 1},
          {name: 'tone', status: 'passed', score: 0.85},
        ],
        score: 0.925,
        errors: [],
      },
    };
    const baseline = captureBaseline([baselineRun], {name: 'base', now: baselineNow});
    const result = diffAgainstBaseline([currentRun], baseline);

    const tone = result.dimensionDiffs.find(d => d.dimension === 'tone')!;
    expect(tone.delta).toBeCloseTo(0.55);
    expect(tone.direction).toBe('improved');

    const latency = result.dimensionDiffs.find(d => d.dimension === 'latency')!;
    expect(latency.direction).toBe('unchanged');
  });

  it('respects custom unchangedThreshold', () => {
    const baseline = captureBaseline(
      [makeRun('TC-1', 0.5)],
      {name: 'base', now: baselineNow},
    );
    const current = [makeRun('TC-1', 0.55)];

    // With default 0.02 threshold, 0.05 diff > threshold -> improved.
    expect(diffAgainstBaseline(current, baseline).improvements).toHaveLength(1);
    // With a generous 0.1 threshold, same diff is unchanged.
    expect(diffAgainstBaseline(current, baseline, {unchangedThreshold: 0.1}).unchanged).toHaveLength(1);
  });
});

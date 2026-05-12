/**
 * @wranngle/voice-evals/regression/diff — Braintrust-shaped baseline diff.
 *
 * Compares a current run-set against a captured BaselineSnapshot. Output
 * shape mirrors Braintrust's experiment diff:
 *
 *   {
 *     scores: { baseline, current, diff },
 *     perTest:      [{test_id, baselineScore, currentScore, diff, direction, statusChanged}, ...],
 *     improvements: [...],
 *     regressions:  [...],
 *     unchanged:    [...],
 *     newTests:     [...],
 *     droppedTests: [...],
 *     dimensionDiffs: [{test_id, dimension, baseline, current, delta, direction}, ...]
 *   }
 *
 * A non-zero `diff` magnitude greater than `unchangedThreshold` puts the test
 * into either improvements or regressions; everything else lands in
 * unchanged. Tests that flipped pass/fail status (`statusChanged: true`)
 * always land in either improvements or regressions regardless of magnitude.
 *
 * Pure function. No I/O. The caller decides whether to gate CI on the
 * resulting `regressions[]` length.
 */

import type {DimensionScore, RunOutcome} from '../scoring/types';
import type {
  BaselineRun,
  BaselineSnapshot,
  DiffResult,
  DimensionDiff,
  TestDiff,
} from './types';

export type DiffOptions = {
  /** Magnitude below which a non-status-change diff is treated as unchanged. Default 0.02. */
  unchangedThreshold?: number;
};

export function diffAgainstBaseline(
  current: readonly BaselineRun[],
  baseline: BaselineSnapshot,
  options: DiffOptions = {},
): DiffResult {
  const unchangedThreshold = options.unchangedThreshold ?? 0.02;
  const currentByTestId = new Map<string, BaselineRun>();
  for (const run of current) {
    currentByTestId.set(run.test_id, run);
  }

  const baselineKeys = new Set(Object.keys(baseline.runs));
  const currentKeys = new Set(currentByTestId.keys());

  const sharedKeys = [...currentKeys].filter(k => baselineKeys.has(k));
  const newTests = [...currentKeys].filter(k => !baselineKeys.has(k));
  const droppedTests = [...baselineKeys].filter(k => !currentKeys.has(k));

  const perTest: TestDiff[] = [];
  const dimensionDiffs: DimensionDiff[] = [];

  for (const testId of sharedKeys) {
    const baselineRun = baseline.runs[testId];
    const currentRun = currentByTestId.get(testId)!;
    const baselineScore = baselineRun.outcome.score;
    const currentScore = currentRun.outcome.score;
    const diff = currentScore - baselineScore;
    const statusChanged = baselineRun.outcome.status !== currentRun.outcome.status;
    const direction = directionFor(diff, statusChanged, unchangedThreshold);
    perTest.push({
      test_id: testId, baselineScore, currentScore, diff, direction, statusChanged,
    });

    dimensionDiffs.push(...diffDimensions(testId, baselineRun.outcome, currentRun.outcome, unchangedThreshold));
  }

  // Include new and dropped tests in perTest with one-sided diffs so consumers
  // can render a single ledger.
  for (const testId of newTests) {
    const currentScore = currentByTestId.get(testId)!.outcome.score;
    perTest.push({
      test_id: testId,
      baselineScore: undefined,
      currentScore,
      diff: currentScore,
      direction: 'new',
      statusChanged: false,
    });
  }

  for (const testId of droppedTests) {
    const baselineScore = baseline.runs[testId].outcome.score;
    perTest.push({
      test_id: testId,
      baselineScore,
      currentScore: undefined,
      diff: -baselineScore,
      direction: 'dropped',
      statusChanged: false,
    });
  }

  const improvements = perTest.filter(t => t.direction === 'improved' || t.direction === 'new');
  const regressions = perTest.filter(t => t.direction === 'regressed' || t.direction === 'dropped');
  const unchanged = perTest.filter(t => t.direction === 'unchanged');

  const baselineMean = mean(sharedKeys.map(k => baseline.runs[k].outcome.score));
  const currentMean = mean(sharedKeys.map(k => currentByTestId.get(k)!.outcome.score));

  return {
    baselineName: baseline.name,
    scores: {
      baseline: baselineMean,
      current: currentMean,
      diff: currentMean - baselineMean,
    },
    perTest,
    improvements,
    regressions,
    unchanged,
    newTests,
    droppedTests,
    dimensionDiffs,
  };
}

function directionFor(
  diff: number,
  statusChanged: boolean,
  unchangedThreshold: number,
): TestDiff['direction'] {
  if (statusChanged) {
    return diff > 0 ? 'improved' : 'regressed';
  }

  if (Math.abs(diff) <= unchangedThreshold) {
    return 'unchanged';
  }

  return diff > 0 ? 'improved' : 'regressed';
}

function diffDimensions(
  testId: string,
  baseline: RunOutcome,
  current: RunOutcome,
  unchangedThreshold: number,
): DimensionDiff[] {
  const byName = new Map<string, {baseline?: DimensionScore; current?: DimensionScore}>();
  for (const d of baseline.dimensions) {
    byName.set(d.name, {...byName.get(d.name), baseline: d});
  }

  for (const d of current.dimensions) {
    byName.set(d.name, {...byName.get(d.name), current: d});
  }

  const out: DimensionDiff[] = [];
  for (const [name, pair] of byName.entries()) {
    const baselineScore = pair.baseline?.score ?? (pair.baseline?.status === 'passed' ? 1 : 0);
    const currentScore = pair.current?.score ?? (pair.current?.status === 'passed' ? 1 : 0);
    if (!pair.baseline) {
      out.push({
        test_id: testId, dimension: name, baseline: undefined, current: pair.current, delta: currentScore, direction: 'new',
      });
      continue;
    }

    if (!pair.current) {
      out.push({
        test_id: testId, dimension: name, baseline: pair.baseline, current: undefined, delta: -baselineScore, direction: 'dropped',
      });
      continue;
    }

    const delta = currentScore - baselineScore;
    const direction = directionFor(delta, pair.baseline.status !== pair.current.status, unchangedThreshold);
    out.push({
      test_id: testId, dimension: name, baseline: pair.baseline, current: pair.current, delta, direction,
    });
  }

  return out;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((s, v) => s + v, 0) / values.length;
}

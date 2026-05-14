/**
 * @wranngle/voice-evals/remediation/cycle-stats — aggregate a polish-loop run.
 *
 * Mirrors the archive's `data/cycle-stats.json` shape: per-cycle counters
 * for proposals, applies, improvement rate, and pattern occurrences.
 *
 * `aggregateCycleStats` is a pure function — feed it the `history`
 * (PolishLoopStep[]) emitted by `polishLoop`, get back a CycleStats record
 * that's friendly to JSON dashboards / time-series.
 */

import type {PolishLoopResult, PolishLoopStep} from './types';

export type CycleStats = {
  /** Number of polish-loop iterations executed. */
  iterations: number;
  /** Sum of failing dimensions at the start (iteration 1 failingBefore). */
  initialFailing: number;
  /** failing dimensions at the end (last iteration failingAfter). */
  finalFailing: number;
  /** Sum of fixes proposed across iterations. */
  proposals: number;
  /** Sum of fixes actually applied (dry-run iterations don't count). */
  applied: number;
  /** Iterations where failingAfter < failingBefore. */
  improvedIterations: number;
  /** Iterations where failingAfter > failingBefore (rare but possible). */
  regressedIterations: number;
  /** Iterations where failingAfter === failingBefore. */
  flatIterations: number;
  /** improvedIterations / iterations, in [0, 1]. */
  improvementRate: number;
  /** Per-pattern count (if proposals tagged `addresses`). */
  patternsDetected: Record<string, number>;
  /** stopped_because string from the loop result, if available. */
  stoppedBecause?: string;
};

export function aggregateCycleStats(
  history: readonly PolishLoopStep[],
  result?: Pick<PolishLoopResult, 'stopped_because'>,
): CycleStats {
  if (history.length === 0) {
    return emptyStats(result);
  }

  const initialFailing = history[0].failingBefore;
  const lastStep = history.at(-1);
  const finalFailing = lastStep ? lastStep.failingAfter : 0;
  let proposals = 0;
  let applied = 0;
  let improvedIterations = 0;
  let regressedIterations = 0;
  let flatIterations = 0;
  const patternsDetected: Record<string, number> = {};

  for (const step of history) {
    if (step.proposal) {
      proposals++;
      for (const dim of step.proposal.addresses) {
        patternsDetected[dim] = (patternsDetected[dim] ?? 0) + 1;
      }
    }

    if (step.applied) {
      applied++;
    }

    if (step.failingAfter < step.failingBefore) {
      improvedIterations++;
    } else if (step.failingAfter > step.failingBefore) {
      regressedIterations++;
    } else {
      flatIterations++;
    }
  }

  return {
    iterations: history.length,
    initialFailing,
    finalFailing,
    proposals,
    applied,
    improvedIterations,
    regressedIterations,
    flatIterations,
    improvementRate: history.length === 0 ? 0 : improvedIterations / history.length,
    patternsDetected,
    stoppedBecause: result?.stopped_because,
  };
}

function emptyStats(result?: Pick<PolishLoopResult, 'stopped_because'>): CycleStats {
  return {
    iterations: 0,
    initialFailing: 0,
    finalFailing: 0,
    proposals: 0,
    applied: 0,
    improvedIterations: 0,
    regressedIterations: 0,
    flatIterations: 0,
    improvementRate: 0,
    patternsDetected: {},
    stoppedBecause: result?.stopped_because,
  };
}

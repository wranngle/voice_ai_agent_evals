/**
 * @wranngle/voice-evals/scoring/composer — ensemble composition for Scorers.
 *
 * `compose(...scorers)`  — concatenates dimension arrays from every scorer.
 * `weighted(weight, scorer)` — annotates every dimension with `weight`.
 * `aggregate(dimensions)`    — collapses a dimension array into a RunOutcome.
 */

import type {DimensionScore, RunOutcome, Scorer} from './types';

/**
 * Combine multiple scorers into one. The combined scorer flattens every
 * scorer's output into a single dimension array — order is preserved across
 * scorer invocation.
 */
export function compose<R>(...scorers: Array<Scorer<R>>): Scorer<R> {
  return async (run: R) => {
    const all: DimensionScore[] = [];
    for (const scorer of scorers) {
      const out = await scorer(run);
      if (Array.isArray(out)) {
        all.push(...out);
      } else {
        all.push(out);
      }
    }

    return all;
  };
}

/**
 * Annotate every dimension emitted by `scorer` with the given weight.
 * Weights are relative — `aggregate()` normalizes by `sum(weight)`.
 */
export function weighted<R>(weight: number, scorer: Scorer<R>): Scorer<R> {
  return async (run: R) => {
    const out = await scorer(run);
    const dims = Array.isArray(out) ? out : [out];
    return dims.map(d => ({...d, weight}));
  };
}

/**
 * Collapse a list of DimensionScores into a single RunOutcome with a
 * weighted aggregate score.
 */
export function aggregate(dimensions: DimensionScore[]): RunOutcome {
  const errors: string[] = [];
  let totalWeight = 0;
  let weightedScore = 0;
  let anyFailed = false;
  let anyError = false;

  for (const d of dimensions) {
    if (d.status === 'error') {
      anyError = true;
    }

    if (d.status === 'failed') {
      anyFailed = true;
    }

    if (d.status !== 'passed' && d.status !== 'skipped' && d.detail) {
      errors.push(`${d.name}: ${d.detail}`);
    }

    const weight = d.weight ?? 1;
    const score = d.score ?? (d.status === 'passed' ? 1 : 0);
    weightedScore += score * weight;
    totalWeight += weight;
  }

  const status: RunOutcome['status'] = anyError ? 'error' : (anyFailed ? 'failed' : 'passed');
  return {
    status,
    dimensions,
    score: totalWeight > 0 ? weightedScore / totalWeight : 0,
    errors,
  };
}

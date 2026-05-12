/**
 * @wranngle/voice-evals/regression — types for versioned baselines and diff.
 *
 * Shape borrows from Braintrust's experiment-diff API:
 *   { scores: { baseline, current, diff }, improvements, regressions, perTest }
 *
 * A BaselineSnapshot is a serializable JSON object — meant to be committed
 * (under `baselines/<name>.json`) for reproducibility. The pair (baseline,
 * current) is then diffed with `diffAgainstBaseline(current, baseline)`.
 */

import type {DimensionScore, RunOutcome} from '../scoring/types';

export type BaselineRun = {
  test_id: string;
  outcome: RunOutcome;
};

export type BaselineSnapshot = {
  /** Stable name; convention: `<branch-or-tag>-<YYYY-MM-DD>`. */
  name: string;
  /** ISO timestamp when this snapshot was captured. */
  capturedAt: string;
  /** Optional git ref / commit sha for full provenance. */
  ref?: string;
  /** Per-test runs, keyed by test_id. */
  runs: Record<string, BaselineRun>;
};

export type DiffDirection = 'improved' | 'regressed' | 'unchanged' | 'new' | 'dropped';

export type TestDiff = {
  test_id: string;
  baselineScore: number | undefined;
  currentScore: number | undefined;
  diff: number;
  direction: DiffDirection;
  /** Whether the pass/fail status changed (e.g., baseline passed but current failed). */
  statusChanged: boolean;
};

export type DimensionDiff = {
  test_id: string;
  dimension: string;
  baseline: DimensionScore | undefined;
  current: DimensionScore | undefined;
  delta: number;
  direction: DiffDirection;
};

export type DiffResult = {
  baselineName: string;
  scores: {
    /** Mean of baseline outcomes' aggregate scores. */
    baseline: number;
    /** Mean of current outcomes' aggregate scores. */
    current: number;
    /** current - baseline. Positive = improvement. */
    diff: number;
  };
  perTest: TestDiff[];
  improvements: TestDiff[];
  regressions: TestDiff[];
  unchanged: TestDiff[];
  /** Tests present in current but missing from baseline. */
  newTests: string[];
  /** Tests present in baseline but missing from current. */
  droppedTests: string[];
  /** Per-dimension deltas for tests that exist in both. */
  dimensionDiffs: DimensionDiff[];
};

export type CaptureBaselineOptions = {
  name: string;
  ref?: string;
  /** Inject a clock for tests. Default: `Date.now`. */
  now?: () => string;
};

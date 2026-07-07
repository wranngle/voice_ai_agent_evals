/**
 * @wranngle/voice-evals/regression — versioned baselines + Braintrust-shaped diff.
 *
 * Phase 4 (shipped): capture / load / save BaselineSnapshot JSONs, and
 * diff a current run-set against a baseline. The diff output mirrors
 * Braintrust's experiment-diff API so CI gates can branch on
 * `.regressions.length`.
 *
 * Still deferred (per FEATURE-MAP §"Known Gaps"; v1.2+ candidates,
 * NOT bound to a "Phase 4.x" milestone that doesn't exist):
 *   - drift.ts — permutation tests for statistical-significance
 *     regression gates. Today's diffAgainstBaseline does deterministic
 *     per-axis delta, not significance testing.
 *   - LLM "is this worth a regression test?" gate on the trace-to-test
 *     path. The deterministic path is already shipped via
 *     `importPostCallWebhook` in src/ingestion/post-call-import.ts.
 */

export {
  baselineExists, captureBaseline, loadBaseline, saveBaseline,
} from './baseline';
export type {DiffOptions} from './diff';
export {diffAgainstBaseline} from './diff';
export type {
  BaselineRun,
  BaselineSnapshot,
  CaptureBaselineOptions,
  DiffDirection,
  DiffResult,
  DimensionDiff,
  TestDiff,
} from './types';

/**
 * @wranngle/voice-evals/regression — versioned baselines + Braintrust-shaped diff.
 *
 * Phase 4 MVP: capture / load / save BaselineSnapshot JSONs, and diff a
 * current run-set against a baseline. The diff output mirrors Braintrust's
 * experiment-diff API so CI gates can branch on `.regressions.length`.
 *
 * Deferred to Phase 4.x: drift.ts (permutation tests for statistical
 * significance), trace-to-test convenience wrappers (Phase 3's
 * `importPostCallWebhook` already covers the deterministic path; the LLM
 * "is this worth a regression test?" gate ships later).
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

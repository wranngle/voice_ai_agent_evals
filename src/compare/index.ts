/**
 * @wranngle/voice-evals/compare — Side-by-side scorecard across N agents.
 *
 * Given N RunResults (same scenario, different agents), produce a CompareResult
 * with one row per dimension and a Δ column relative to the first (baseline)
 * agent. The HTML renderer in ./render-html.ts turns that into the
 * `<th>Δ</th>` + `data-agent="..."` markup the comparative scorecard ships.
 */

export {compareRuns} from './compare';
export {renderCompareHtml} from './render-html';
export type {
  CompareCellDelta,
  CompareResult,
  CompareRow,
  CompareSummary,
  DimensionScore,
  RunOutcome,
  RunResult,
  Status,
} from './types';

import type {DimensionScore, Status} from '../scoring/types';
import type {
  CompareCellDelta, CompareResult, CompareRow, CompareSummary, RunResult,
} from './types';

function scoreOf(d: DimensionScore): number {
  if (typeof d.score === 'number') {
    return d.score;
  }

  return d.status === 'passed' ? 1 : 0;
}

function statusDeltaLabel(baseline: Status | 'missing', other: Status | 'missing'): string | undefined {
  if (baseline === other) {
    return undefined;
  }

  return `${baseline}→${other}`;
}

/**
 * Build a side-by-side scorecard from N runs of the same scenario. The first
 * run is the baseline; deltas in the Δ columns are computed relative to it.
 *
 * - Dimension row union is preserved in first-seen order, walking runs left-to-right.
 * - Missing dimensions in non-baseline runs surface as `status: 'missing'` cells
 *   (Δ score `undefined`); they appear in the comparative HTML as an em-dash.
 * - Aggregate score is the unweighted mean of dimension scores per run, matching
 *   the simple aggregation the renderer uses (weighted aggregation lives in the
 *   single-agent renderer; cross-agent comparison stays linear by design).
 */
export function compareRuns(runs: readonly RunResult[]): CompareResult {
  if (runs.length === 0) {
    throw new Error('compareRuns: at least one run is required');
  }

  const scenarios = new Set(runs.map(r => r.scenario));
  if (scenarios.size > 1) {
    throw new Error(`compareRuns: all runs must share a scenario; got ${[...scenarios].join(', ')}`);
  }

  const agents = runs.map(r => r.agentId);
  if (new Set(agents).size !== agents.length) {
    throw new Error(`compareRuns: agent ids must be unique; got ${agents.join(', ')}`);
  }

  const dimensionOrder: string[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    for (const d of run.outcome.dimensions) {
      if (!seen.has(d.name)) {
        seen.add(d.name);
        dimensionOrder.push(d.name);
      }
    }
  }

  const baselineRun = runs[0];
  const rows: CompareRow[] = dimensionOrder.map(name => {
    const cells = runs.map(run => {
      const d = run.outcome.dimensions.find(x => x.name === name);
      if (!d) {
        return {
          agentId: run.agentId, status: 'missing' as const, score: 0, detail: undefined,
        };
      }

      return {
        agentId: run.agentId, status: d.status, score: scoreOf(d), detail: d.detail,
      };
    });
    const baselineCell = cells[0];
    const deltas: CompareCellDelta[] = cells.slice(1).map(cell => {
      if (cell.status === 'missing' || baselineCell.status === 'missing') {
        return {score: undefined, statusDelta: statusDeltaLabel(baselineCell.status, cell.status)};
      }

      return {
        score: Number((cell.score - baselineCell.score).toFixed(4)),
        statusDelta: statusDeltaLabel(baselineCell.status, cell.status),
      };
    });
    return {dimension: name, cells, deltas};
  });

  const summaries: CompareSummary[] = runs.map(run => {
    const ds = run.outcome.dimensions;
    const passedCount = ds.filter(d => d.status === 'passed').length;
    const failedCount = ds.filter(d => d.status === 'failed' || d.status === 'error').length;
    return {
      agentId: run.agentId,
      status: run.outcome.status,
      aggregateScore: Number(run.outcome.score.toFixed(4)),
      passedCount,
      failedCount,
    };
  });

  return {
    scenario: baselineRun.scenario,
    agents,
    rows,
    summaries,
  };
}

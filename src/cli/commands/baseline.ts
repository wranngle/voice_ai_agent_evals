/**
 * `voice-evals baseline {capture, diff} <name>` — regression baseline CLI.
 *
 * Phase 6.x. Reads the most recent run's stored results from .test-data/
 * (via the existing src/testing/local-storage adapter), shapes them into
 * BaselineRun[], and either captures a new baseline JSON or diffs the
 * current results against a named one.
 */

import {
  captureBaseline, diffAgainstBaseline, loadBaseline, saveBaseline,
} from '../../regression';
import type {BaselineRun} from '../../regression/types';
import type {Status} from '../../scoring/types';
import {getResultsByRun, listTestRuns} from '../../testing/local-storage';
import type {TestResult, TestRun, TestStatus} from '../../testing/types';
import {createTracer} from '../../internal/jsonl-trace';

const trace = createTracer('cli.baseline');
// JSONL tracing — emit start/end events from dispatch entry points.

void trace;

export type BaselineOptions = {
  /** Stream output here. */
  out?: (line: string) => void;
  /** Override the baselines directory. Default 'baselines'. */
  baselinesDir?: string;
};

const DEFAULT_DIR = 'baselines';

export async function runBaselineCapture(name: string, options: BaselineOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const dir = options.baselinesDir ?? DEFAULT_DIR;

  if (!name) {
    out('error: baseline capture requires a name argument');
    out('usage: voice-evals baseline capture <name>');
    return 1;
  }

  const runs = await loadLatestRunsAsBaselineRuns();
  if (runs.length === 0) {
    out('error: no test results in storage. Run `voice-evals run` first.');
    return 1;
  }

  const snapshot = captureBaseline(runs, {name});
  const path = saveBaseline(snapshot, dir);
  out(`Captured baseline "${name}" with ${runs.length} test(s) -> ${path}`);
  return 0;
}

export async function runBaselineDiff(name: string, options: BaselineOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const dir = options.baselinesDir ?? DEFAULT_DIR;

  if (!name) {
    out('error: baseline diff requires a name argument');
    out('usage: voice-evals baseline diff <name>');
    return 1;
  }

  let baseline;
  try {
    baseline = loadBaseline(name, dir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out(`error: ${message}`);
    return 1;
  }

  const current = await loadLatestRunsAsBaselineRuns();
  if (current.length === 0) {
    out('error: no current test results in storage. Run `voice-evals run` first.');
    return 1;
  }

  const result = diffAgainstBaseline(current, baseline);
  out(`Baseline:        ${result.baselineName}`);
  out(`Baseline score:  ${result.scores.baseline.toFixed(4)}`);
  out(`Current score:   ${result.scores.current.toFixed(4)}`);
  out(`Diff:            ${result.scores.diff >= 0 ? '+' : ''}${result.scores.diff.toFixed(4)}`);
  out(`Improvements:    ${result.improvements.length}`);
  out(`Regressions:     ${result.regressions.length}`);
  out(`Unchanged:       ${result.unchanged.length}`);
  out(`New tests:       ${result.newTests.length}`);
  out(`Dropped tests:   ${result.droppedTests.length}`);

  if (result.regressions.length > 0) {
    out('');
    out('Regressions:');
    for (const r of result.regressions) {
      const before = r.baselineScore?.toFixed(4) ?? '—';
      const after = r.currentScore?.toFixed(4) ?? '—';
      const statusFlag = r.statusChanged ? ' (status changed)' : '';
      out(`  ${r.test_id}  ${before} -> ${after}${statusFlag}`);
    }
  }

  // Exit nonzero if there are regressions — useful for CI gates.
  return result.regressions.length > 0 ? 1 : 0;
}

async function loadLatestRunsAsBaselineRuns(): Promise<BaselineRun[]> {
  const runsResult = await listTestRuns();
  const runs = runsResult.data ?? [];
  if (runs.length === 0) {
    return [];
  }

  const latest = runs.sort((a: TestRun, b: TestRun) =>
    new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];

  const resultsResult = await getResultsByRun(latest.execution_id);
  const results = resultsResult.data ?? [];

  return results.map((r: TestResult): BaselineRun => ({
    test_id: r.test_id,
    outcome: {
      status: toScoringStatus(r.status),
      dimensions: (r.dimensions ?? []).map(d => ({
        name: d.name,
        status: toScoringStatus(d.status),
        score: d.score,
        weight: d.weight,
        detail: d.detail,
      })),
      score: r.status === 'passed' ? 1 : 0,
      errors: r.error_message ? [r.error_message] : [],
    },
  }));
}

function toScoringStatus(status: TestStatus): Status {
  // TestStatus has 'pending' which scoring's Status does not — collapse
  // pending into 'skipped' so baselines never carry an indeterminate value.
  switch (status) {
    case 'passed':
    case 'failed':
    case 'error':
    case 'skipped': {
      return status;
    }

    case 'pending': {
      return 'skipped';
    }
  }
}

import {
  mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, test,
} from 'vitest';
import {compareRuns, renderCompareHtml} from '../../src/compare';
import {runCompareCli} from '../../src/compare/cli';
import type {RunResult} from '../../src/compare/types';

const baselineRun: RunResult = {
  agentId: 'aria-v1',
  scenario: 'refund-flow',
  outcome: {
    status: 'passed',
    score: 0.9,
    errors: [],
    dimensions: [
      {
        name: 'intent_match', status: 'passed', score: 1, detail: 'classified',
      },
      {
        name: 'policy_compliance', status: 'passed', score: 0.9, detail: 'disclosed window',
      },
      {
        name: 'barge_in_handling', status: 'passed', score: 0.85, detail: 'yielded fast',
      },
    ],
  },
};

const otherRun: RunResult = {
  agentId: 'nova-v2',
  scenario: 'refund-flow',
  outcome: {
    status: 'failed',
    score: 0.7,
    errors: ['barge_in_handling slow'],
    dimensions: [
      {
        name: 'intent_match', status: 'passed', score: 1, detail: 'classified',
      },
      {
        name: 'policy_compliance', status: 'passed', score: 0.95, detail: 'disclosed plus exception',
      },
      {
        name: 'barge_in_handling', status: 'failed', score: 0.4, detail: 'yielded slowly',
      },
    ],
  },
};

describe('compareRuns', () => {
  test('preserves agent order with baseline as first column', () => {
    const result = compareRuns([baselineRun, otherRun]);
    expect(result.agents).toEqual(['aria-v1', 'nova-v2']);
    expect(result.scenario).toBe('refund-flow');
  });

  test('emits one row per dimension in first-seen order', () => {
    const result = compareRuns([baselineRun, otherRun]);
    expect(result.rows.map(r => r.dimension)).toEqual([
      'intent_match', 'policy_compliance', 'barge_in_handling',
    ]);
  });

  test('computes delta vs baseline column', () => {
    const result = compareRuns([baselineRun, otherRun]);
    const policy = result.rows.find(r => r.dimension === 'policy_compliance')!;
    expect(policy.deltas[0].score).toBeCloseTo(0.05, 5);
    const bargeIn = result.rows.find(r => r.dimension === 'barge_in_handling')!;
    expect(bargeIn.deltas[0].score).toBeCloseTo(-0.45, 5);
    expect(bargeIn.deltas[0].statusDelta).toBe('passed→failed');
  });

  test('marks dimensions missing in non-baseline runs', () => {
    const partial: RunResult = {
      agentId: 'echo-v3',
      scenario: 'refund-flow',
      outcome: {
        status: 'passed',
        score: 0.8,
        errors: [],
        dimensions: [
          {name: 'intent_match', status: 'passed', score: 1},
          // intentionally missing policy_compliance + barge_in_handling
        ],
      },
    };
    const result = compareRuns([baselineRun, partial]);
    const policy = result.rows.find(r => r.dimension === 'policy_compliance')!;
    expect(policy.cells[1].status).toBe('missing');
    expect(policy.deltas[0].score).toBeUndefined();
  });

  test('emits union of dimensions when later run introduces new ones', () => {
    const extra: RunResult = {
      ...otherRun,
      agentId: 'sigma-v4',
      outcome: {
        ...otherRun.outcome,
        dimensions: [
          ...otherRun.outcome.dimensions,
          {name: 'tool_call_validity', status: 'passed', score: 1},
        ],
      },
    };
    const result = compareRuns([baselineRun, extra]);
    expect(result.rows.map(r => r.dimension)).toContain('tool_call_validity');
    const newRow = result.rows.find(r => r.dimension === 'tool_call_validity')!;
    expect(newRow.cells[0].status).toBe('missing');
    expect(newRow.cells[1].status).toBe('passed');
  });

  test('rejects empty run list', () => {
    expect(() => compareRuns([])).toThrow(/at least one run/);
  });

  test('rejects runs from different scenarios', () => {
    const mismatched: RunResult = {...otherRun, scenario: 'cancellation'};
    expect(() => compareRuns([baselineRun, mismatched])).toThrow(/share a scenario/);
  });

  test('rejects duplicate agent ids', () => {
    expect(() => compareRuns([baselineRun, baselineRun])).toThrow(/unique/);
  });

  test('supports more than two agents', () => {
    const thirdRun: RunResult = {...otherRun, agentId: 'echo-v3'};
    const result = compareRuns([baselineRun, otherRun, thirdRun]);
    expect(result.agents).toHaveLength(3);
    expect(result.rows[0].deltas).toHaveLength(2);
  });
});

describe('renderCompareHtml', () => {
  test('renders a <th>Δ</th> for each non-baseline agent', () => {
    const result = compareRuns([baselineRun, otherRun]);
    const html = renderCompareHtml(result, {now: '2026-05-14T00:00:00Z'});
    expect(html).toContain('<th>Δ</th>');
    // one non-baseline agent → exactly one Δ header
    const deltaMatches = html.match(/<th>Δ<\/th>/g) ?? [];
    expect(deltaMatches.length).toBe(1);
  });

  test('emits at least two data-agent="..." columns', () => {
    const result = compareRuns([baselineRun, otherRun]);
    const html = renderCompareHtml(result, {now: '2026-05-14T00:00:00Z'});
    const agentMatches = html.match(/data-agent="aria-v1"/g) ?? [];
    const novaMatches = html.match(/data-agent="nova-v2"/g) ?? [];
    expect(agentMatches.length).toBeGreaterThanOrEqual(1);
    expect(novaMatches.length).toBeGreaterThanOrEqual(1);
    // total distinct data-agent="..." occurrences should cover both agents
    const distinct = new Set((html.match(/data-agent="[^"]+"/g) ?? []).map(s => s));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  test('escapes agent ids to prevent HTML injection', () => {
    const malicious: RunResult = {
      ...baselineRun,
      agentId: '<img src=x onerror=alert(1)>',
    };
    const result = compareRuns([malicious, otherRun]);
    const html = renderCompareHtml(result, {now: '2026-05-14T00:00:00Z'});
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('renders three Δ columns for four-agent compare', () => {
    const r2: RunResult = {...otherRun, agentId: 'nova-v2'};
    const r3: RunResult = {...otherRun, agentId: 'echo-v3'};
    const r4: RunResult = {...otherRun, agentId: 'sigma-v4'};
    const result = compareRuns([baselineRun, r2, r3, r4]);
    const html = renderCompareHtml(result, {now: '2026-05-14T00:00:00Z'});
    const deltaMatches = html.match(/<th>Δ<\/th>/g) ?? [];
    expect(deltaMatches.length).toBe(3);
  });

  test('renders summary row per agent', () => {
    const result = compareRuns([baselineRun, otherRun]);
    const html = renderCompareHtml(result, {now: '2026-05-14T00:00:00Z'});
    expect(html).toContain('data-testid="compare-summary"');
    expect(html).toMatch(/summary-passed/);
    expect(html).toMatch(/summary-failed/);
  });
});

describe('runCompareCli', () => {
  let tempDir: string;
  let runAPath: string;
  let runBPath: string;
  let outPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'voice-evals-compare-'));
    runAPath = join(tempDir, 'run-a.json');
    runBPath = join(tempDir, 'run-b.json');
    outPath = join(tempDir, 'compare.html');
    writeFileSync(runAPath, JSON.stringify(baselineRun));
    writeFileSync(runBPath, JSON.stringify(otherRun));
  });

  afterEach(() => {
    rmSync(tempDir, {recursive: true, force: true});
  });

  test('writes html to --out path', async () => {
    const exit = await runCompareCli([
      '--runs',
      `${runAPath},${runBPath}`,
      '--out',
      outPath,
    ]);
    expect(exit).toBe(0);
    const html = readFileSync(outPath, 'utf8');
    expect(html).toContain('<th>Δ</th>');
    expect(html).toContain('data-agent="aria-v1"');
    expect(html).toContain('data-agent="nova-v2"');
  });

  test('rejects single --runs path', async () => {
    const exit = await runCompareCli(['--runs', runAPath, '--out', outPath]);
    expect(exit).toBe(2);
  });

  test('rejects missing --runs flag', async () => {
    const exit = await runCompareCli(['--out', outPath]);
    expect(exit).toBe(2);
  });
});

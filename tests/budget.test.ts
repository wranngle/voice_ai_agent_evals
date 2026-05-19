import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import {
  evaluateBudget,
  formatBreachLine,
  loadBudget,
  resolveBudgetPath,
  type BudgetConfig,
  type ScenarioMetrics,
} from '../src/budget';
import {runEval, loadScenarioMetrics} from '../src/eval/run';

const sampleConfig: BudgetConfig = {
  budgets: {
    cost_per_turn_usd: 0.001,
    end_to_first_audio_p95_ms: 1400,
    ttfb_p95_ms: 800,
    total_turn_p95_ms: 3000,
  },
};

describe('budget enforcer — contract', () => {
  it('over-budget cost: emits BUDGET_BREACH with the exact spec wording', () => {
    const results: ScenarioMetrics[] = [
      {scenarioId: '_overbudget', metrics: {cost_per_turn_usd: 0.0042}},
    ];
    const breaches = evaluateBudget(sampleConfig, results);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].line).toBe('BUDGET_BREACH: cost_per_turn_usd 0.0042 > 0.001');
  });

  it('within-budget metrics: no breaches reported', () => {
    const results: ScenarioMetrics[] = [
      {scenarioId: 'ok', metrics: {cost_per_turn_usd: 0.0008, ttfb_p95_ms: 690}},
    ];
    expect(evaluateBudget(sampleConfig, results)).toEqual([]);
  });

  it('extra metrics not in budget: silently ignored', () => {
    const results: ScenarioMetrics[] = [
      {scenarioId: 'unknown', metrics: {totally_unrelated_metric: 999_999}},
    ];
    expect(evaluateBudget(sampleConfig, results)).toEqual([]);
  });

  it('multiple breaches: one line per breach, ordering preserved', () => {
    const results: ScenarioMetrics[] = [
      {scenarioId: 's1', metrics: {cost_per_turn_usd: 0.005, ttfb_p95_ms: 1500}},
    ];
    const breaches = evaluateBudget(sampleConfig, results);
    expect(breaches.length).toBeGreaterThanOrEqual(2);
    expect(breaches.map(b => b.metric)).toContain('cost_per_turn_usd');
    expect(breaches.map(b => b.metric)).toContain('ttfb_p95_ms');
  });

  it('formatBreachLine: trims trailing zeros on float metrics', () => {
    expect(formatBreachLine('cost_per_turn_usd', 0.0042, 0.001))
      .toBe('BUDGET_BREACH: cost_per_turn_usd 0.0042 > 0.001');
    expect(formatBreachLine('ttfb_p95_ms', 850, 800))
      .toBe('BUDGET_BREACH: ttfb_p95_ms 850 > 800');
  });
});

describe('budget enforcer — config loading', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-test-'));
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('loads a valid budget YAML', () => {
    const path = join(dir, 'voice-evals.budget.yaml');
    writeFileSync(path, 'budgets:\n  cost_per_turn_usd: 0.001\n  ttfb_p95_ms: 800\n');
    const cfg = loadBudget(path);
    expect(cfg.budgets.cost_per_turn_usd).toBe(0.001);
    expect(cfg.budgets.ttfb_p95_ms).toBe(800);
  });

  it('rejects a missing budgets key', () => {
    const path = join(dir, 'bad.yaml');
    writeFileSync(path, 'wrongkey:\n  foo: 1\n');
    expect(() => loadBudget(path)).toThrow(/missing required 'budgets' map/);
  });

  it('rejects non-numeric values', () => {
    const path = join(dir, 'bad.yaml');
    writeFileSync(path, 'budgets:\n  cost_per_turn_usd: "expensive"\n');
    expect(() => loadBudget(path)).toThrow(/must be a finite number/);
  });

  it('resolveBudgetPath: prefers explicit, falls back to default name', () => {
    const explicit = join(dir, 'custom.yaml');
    writeFileSync(explicit, 'budgets:\n  ttfb_p95_ms: 800\n');
    expect(resolveBudgetPath(dir, explicit)).toBe(explicit);

    const standard = join(dir, 'voice-evals.budget.yaml');
    writeFileSync(standard, 'budgets:\n  ttfb_p95_ms: 800\n');
    expect(resolveBudgetPath(dir)).toBe(standard);
  });

  it('resolveBudgetPath: returns undefined when no file present', () => {
    expect(resolveBudgetPath(dir)).toBeUndefined();
  });
});

describe('budget enforcer — runEval()', () => {
  let dir: string;
  let scenariosDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-eval-'));
    scenariosDir = join(dir, 'scenarios');
    mkdirSync(scenariosDir);
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('over-budget fixture: exits 1 and prints BUDGET_BREACH', async () => {
    writeFileSync(
      join(scenariosDir, '_overbudget.yaml'),
      'id: _overbudget\nmetrics:\n  cost_per_turn_usd: 0.0042\n',
    );
    writeFileSync(
      join(dir, 'voice-evals.budget.yaml'),
      'budgets:\n  cost_per_turn_usd: 0.001\n',
    );

    const lines: string[] = [];
    const code = await runEval({cwd: dir, scenariosDir, out: l => lines.push(l)});
    expect(code).toBe(1);
    expect(lines).toContain('BUDGET_BREACH: cost_per_turn_usd 0.0042 > 0.001');
  });

  it('within-budget scenario: exits 0 with success line', async () => {
    writeFileSync(
      join(scenariosDir, 'ok.yaml'),
      'id: ok\nmetrics:\n  cost_per_turn_usd: 0.0008\n',
    );
    writeFileSync(
      join(dir, 'voice-evals.budget.yaml'),
      'budgets:\n  cost_per_turn_usd: 0.001\n',
    );

    const lines: string[] = [];
    const code = await runEval({cwd: dir, scenariosDir, out: l => lines.push(l)});
    expect(code).toBe(0);
    expect(lines.some(l => l.includes('within budget'))).toBe(true);
  });

  it('no budget file: skips gate and exits 0', async () => {
    writeFileSync(
      join(scenariosDir, 'ok.yaml'),
      'id: ok\nmetrics:\n  cost_per_turn_usd: 0.0042\n',
    );

    const lines: string[] = [];
    const code = await runEval({cwd: dir, scenariosDir, out: l => lines.push(l)});
    expect(code).toBe(0);
    expect(lines.some(l => l.includes('skipping gate'))).toBe(true);
  });

  it('empty scenarios dir: exits 2 (invalid invocation)', async () => {
    const lines: string[] = [];
    const code = await runEval({cwd: dir, scenariosDir, out: l => lines.push(l)});
    expect(code).toBe(2);
  });

  it('loadScenarioMetrics: extracts numeric metrics, ignores non-numeric', () => {
    const path = join(scenariosDir, 'mixed.yaml');
    writeFileSync(
      path,
      'id: mixed\nmetrics:\n  cost_per_turn_usd: 0.002\n  label: "not a number"\n  ttfb_p95_ms: 700\n',
    );
    const out = loadScenarioMetrics(path);
    expect(out?.metrics).toEqual({cost_per_turn_usd: 0.002, ttfb_p95_ms: 700});
  });
});

describe('budget enforcer — integration via npm run eval', () => {
  it('over-budget fixture in repo: npm run eval exits non-zero with the spec breach line', () => {
    // Repo root is two parents up from this file.
    const repoRoot = join(__dirname, '..');
    const result = spawnSync('npm', ['run', '--silent', 'eval'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    const stdout = result.stdout ?? '';
    expect(stdout).toContain('BUDGET_BREACH: cost_per_turn_usd 0.0042 > 0.001');
  });
});

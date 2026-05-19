/**
 * Cost + latency budget enforcer.
 *
 * Single contract: take a budget config (from YAML) and a list of scenario
 * results (each with a metrics map), and return a list of breaches. Any
 * breach causes the eval run to exit non-zero with a `BUDGET_BREACH: ...`
 * line per breach.
 */

import {readFileSync, existsSync} from 'node:fs';
import {parse as parseYaml} from 'yaml';

export type BudgetConfig = {
  budgets: Record<string, number>;
};

export type ScenarioMetrics = {
  scenarioId: string;
  metrics: Record<string, number>;
};

export type Breach = {
  scenarioId: string;
  metric: string;
  observed: number;
  max: number;
  line: string;
};

export const DEFAULT_BUDGET_FILES = [
  'voice-evals.budget.yaml',
  'voice-evals.budget.yml',
];

export function loadBudget(path: string): BudgetConfig {
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || !('budgets' in parsed)) {
    throw new Error(`budget config at ${path} missing required 'budgets' map`);
  }

  const {budgets} = (parsed);
  if (!budgets || typeof budgets !== 'object') {
    throw new Error(`budget config at ${path} has non-object 'budgets'`);
  }

  const numericBudgets: Record<string, number> = {};
  for (const [metric, value] of Object.entries(budgets as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`budget '${metric}' must be a finite number, got ${typeof value}`);
    }

    numericBudgets[metric] = value;
  }

  return {budgets: numericBudgets};
}

export function resolveBudgetPath(cwd: string, explicit?: string): string | undefined {
  if (explicit) {
    return explicit;
  }

  for (const candidate of DEFAULT_BUDGET_FILES) {
    const full = `${cwd}/${candidate}`;
    if (existsSync(full)) {
      return full;
    }
  }

  return undefined;
}

export function evaluateBudget(
  config: BudgetConfig,
  results: readonly ScenarioMetrics[],
): Breach[] {
  const breaches: Breach[] = [];
  for (const result of results) {
    for (const [metric, max] of Object.entries(config.budgets)) {
      const observed = result.metrics[metric];
      if (typeof observed !== 'number' || !Number.isFinite(observed)) {
        continue;
      }

      if (observed > max) {
        breaches.push({
          scenarioId: result.scenarioId,
          metric,
          observed,
          max,
          line: formatBreachLine(metric, observed, max),
        });
      }
    }
  }

  return breaches;
}

export function formatBreachLine(metric: string, observed: number, max: number): string {
  return `BUDGET_BREACH: ${metric} ${formatMetricValue(observed)} > ${formatMetricValue(max)}`;
}

function formatMetricValue(n: number): string {
  if (Number.isInteger(n)) {
    return String(n);
  }

  const fixed = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return fixed.length > 0 ? fixed : String(n);
}

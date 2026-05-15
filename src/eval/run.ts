#!/usr/bin/env bun
/**
 * `npm run eval` entry — loads scenario YAMLs from a directory (default
 * `scenarios/`), extracts each scenario's emitted `metrics` map, then
 * gates the run against the cost + latency budget defined in
 * `voice-evals.budget.yaml`.
 *
 * Exit code:
 *   0 — every scenario within budget (or no budget file present).
 *   1 — at least one BUDGET_BREACH line printed to stdout.
 *   2 — invalid invocation (bad scenarios dir, malformed YAML, etc.).
 *
 * This is intentionally a thin gate, not the full `voice-evals testing run`
 * orchestrator. Scenarios under the `scenarios/` dir are deterministic
 * fixtures (transcript-derived metrics already embedded), so the gate is
 * pure data validation — no live API calls.
 */

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, basename} from 'node:path';
import {parse as parseYaml} from 'yaml';
import {
  evaluateBudget,
  loadBudget,
  resolveBudgetPath,
  type ScenarioMetrics,
} from '../budget';

export type EvalRunOptions = {
  scenariosDir?: string;
  budgetPath?: string;
  cwd?: string;
  out?: (line: string) => void;
};

export async function runEval(options: EvalRunOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const scenariosDir = options.scenariosDir ?? join(cwd, 'scenarios');
  const out = options.out ?? ((line: string) => process.stdout.write(`${line}\n`));

  let entries: string[];
  try {
    entries = readdirSync(scenariosDir);
  } catch (error) {
    out(`error: cannot read scenarios dir ${scenariosDir}: ${(error as Error).message}`);
    return 2;
  }

  const scenarioFiles = entries
    .filter(name => name.endsWith('.yaml') || name.endsWith('.yml'))
    .map(name => join(scenariosDir, name))
    .filter(path => statSync(path).isFile())
    .sort();

  if (scenarioFiles.length === 0) {
    out(`error: no scenario YAML files found in ${scenariosDir}`);
    return 2;
  }

  const results: ScenarioMetrics[] = [];
  for (const file of scenarioFiles) {
    try {
      const scenario = loadScenarioMetrics(file);
      if (scenario) {
        results.push(scenario);
      }
    } catch (error) {
      out(`error: failed to parse ${basename(file)}: ${(error as Error).message}`);
      return 2;
    }
  }

  const budgetPath = resolveBudgetPath(cwd, options.budgetPath);
  if (!budgetPath) {
    out(`eval: ${results.length} scenario(s) loaded; no budget file present, skipping gate.`);
    return 0;
  }

  let budget;
  try {
    budget = loadBudget(budgetPath);
  } catch (error) {
    out(`error: ${(error as Error).message}`);
    return 2;
  }

  const breaches = evaluateBudget(budget, results);
  if (breaches.length === 0) {
    out(`eval: ${results.length} scenario(s) within budget (${Object.keys(budget.budgets).length} metric(s) checked).`);
    return 0;
  }

  for (const breach of breaches) {
    out(breach.line);
  }

  out(`eval: FAIL — ${breaches.length} budget breach(es) across ${results.length} scenario(s).`);
  return 1;
}

export function loadScenarioMetrics(file: string): ScenarioMetrics | undefined {
  const raw = readFileSync(file, 'utf8');
  const parsed = parseYaml(raw) as Record<string, unknown> | undefined;
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  const scenarioId = typeof parsed.id === 'string' ? parsed.id : basename(file).replace(/\.ya?ml$/, '');
  const metricsRaw = parsed.metrics;
  if (!metricsRaw || typeof metricsRaw !== 'object') {
    return {scenarioId, metrics: {}};
  }

  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(metricsRaw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      metrics[key] = value;
    }
  }

  return {scenarioId, metrics};
}

// Auto-dispatch when invoked directly (bun src/eval/run.ts or npm run eval).
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('src/eval/run.ts');

if (invokedDirectly) {
  const budgetFlagIdx = process.argv.indexOf('--budget');
  const scenariosFlagIdx = process.argv.indexOf('--scenarios');
  const exitCode = await runEval({
    budgetPath: budgetFlagIdx === -1 ? undefined : process.argv[budgetFlagIdx + 1],
    scenariosDir: scenariosFlagIdx === -1 ? undefined : process.argv[scenariosFlagIdx + 1],
  });
  process.exit(exitCode);
}

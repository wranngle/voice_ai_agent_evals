/**
 * Aggregate per-agent run sets into a sortable leaderboard.
 *
 * Score: mean of outcome.score across the agent's runs.
 * Latency p95: nearest-rank p95 of run.latency_ms (only runs reporting it).
 * Cost: sum of run.cost_usd (only runs reporting it).
 * Pass %: fraction of runs with outcome.status === 'passed', * 100.
 *
 * Sort: score desc, then agent name asc. Deterministic so the markdown
 * output is diff-friendly across regenerations.
 */

import type {
  AggregateOptions,
  Leaderboard,
  LeaderboardAgentInput,
  LeaderboardRow,
} from './types';

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    throw new Error('percentile: cannot compute on empty array');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.max(0, Math.min(sorted.length - 1, rank - 1));
  return sorted[idx];
}

function meanScore(scores: number[]): number {
  if (scores.length === 0) {
    return 0;
  }

  return scores.reduce((sum, x) => sum + x, 0) / scores.length;
}

export function aggregateAgent(input: LeaderboardAgentInput): LeaderboardRow {
  const scores = input.runs.map(r => r.outcome.score);
  const latencies = input.runs
    .map(r => r.latency_ms)
    .filter((x): x is number => typeof x === 'number');
  const costs = input.runs
    .map(r => r.cost_usd)
    .filter((x): x is number => typeof x === 'number');
  const passed = input.runs.filter(r => r.outcome.status === 'passed').length;

  return {
    agent: input.agent,
    model: input.model,
    score: meanScore(scores),
    latency_p95_ms: latencies.length > 0 ? percentile(latencies, 95) : null,
    cost_usd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
    pass_pct: input.runs.length === 0 ? 0 : (passed / input.runs.length) * 100,
    runs: input.runs.length,
  };
}

export function buildLeaderboard(
  agents: readonly LeaderboardAgentInput[],
  options: AggregateOptions = {},
): Leaderboard {
  const rows = agents.map(a => aggregateAgent(a));
  rows.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.agent.localeCompare(b.agent);
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {generatedAt: now(), rows};
}

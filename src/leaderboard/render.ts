/**
 * Render a Leaderboard as the markdown + JSON artifacts published via README
 * badge or gh-pages. Markdown header MUST match the R2 spec exactly:
 *
 *   | Agent | Score | Latency p95 | Cost | Pass% |
 *
 * so downstream consumers (e.g. the wranngle.com pricing page) can grep for
 * the column ordering deterministically.
 */

import type {Leaderboard, LeaderboardRow} from './types';

function fmtScore(score: number): string {
  return score.toFixed(3);
}

// eslint-disable-next-line @typescript-eslint/no-restricted-types
function fmtLatency(latency_p95_ms: number | null): string {
  if (latency_p95_ms === null) {
    return '—';
  }

  return `${Math.round(latency_p95_ms)}ms`;
}

// eslint-disable-next-line @typescript-eslint/no-restricted-types
function fmtCost(cost_usd: number | null): string {
  if (cost_usd === null) {
    return '—';
  }

  return `$${cost_usd.toFixed(4)}`;
}

function fmtPass(pass_pct: number): string {
  return `${pass_pct.toFixed(1)}%`;
}

export function renderMarkdown(board: Leaderboard): string {
  const header = '| Agent | Score | Latency p95 | Cost | Pass% |';
  const sep = '| --- | --- | --- | --- | --- |';
  const rows = board.rows.map((r: LeaderboardRow) =>
    `| ${r.agent} | ${fmtScore(r.score)} | ${fmtLatency(r.latency_p95_ms)} | ${fmtCost(r.cost_usd)} | ${fmtPass(r.pass_pct)} |`);
  const lines = [
    '# voice-evals leaderboard',
    '',
    `_Generated: ${board.generatedAt}_`,
    '',
    header,
    sep,
    ...rows,
    '',
  ];
  return lines.join('\n');
}

export function renderJson(board: Leaderboard): string {
  return JSON.stringify(board, null, 2) + '\n';
}

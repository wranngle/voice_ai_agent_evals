/**
 * @wranngle/voice-evals/leaderboard — public leaderboard generator.
 *
 * Aggregates per-agent run sets (real or fixture) and emits two artifacts
 * intended for publication via gh-pages or README badge:
 *
 *   - out/leaderboard.md   — human-readable, header row pinned to
 *     `| Agent | Score | Latency p95 | Cost | Pass% |` so downstream
 *     workflows (live-badge, wranngle.com pricing page) can grep against
 *     a stable contract.
 *   - out/leaderboard.json — full structured snapshot for AI consumers.
 *
 * Build on top of the round-1 nightly live-badge workflow (PR #16) — the
 * leaderboard.json is meant to be the data file that workflow refreshes.
 */

export {aggregateAgent, buildLeaderboard} from './aggregate';
export {DEMO_AGENTS} from './fixtures';
export {renderJson, renderMarkdown} from './render';
export type {
  AggregateOptions,
  Leaderboard,
  LeaderboardAgentInput,
  LeaderboardRow,
  LeaderboardRun,
} from './types';

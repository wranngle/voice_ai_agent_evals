/**
 * @wranngle/voice-evals/leaderboard — public leaderboard generator.
 *
 * Aggregates per-agent run sets (real or fixture) and emits two artifacts
 * intended for publication via gh-pages or README badge:
 *
 *   - out/leaderboard.md   — human-readable, header row pinned to
 *     `| Agent | Score | Latency p95 | Cost | Pass% |` so downstream
 *     consumers (e.g. the wranngle.com pricing page) can grep against
 *     a stable contract.
 *   - out/leaderboard.json — full structured snapshot for AI consumers.
 *
 * A nightly refresh workflow was the original plan (round-1 live-badge,
 * PR #16 — since retired); today the artifacts are generated on demand via
 * `bun run leaderboard`.
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

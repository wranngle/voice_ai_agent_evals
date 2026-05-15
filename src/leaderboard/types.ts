/**
 * @wranngle/voice-evals/leaderboard — types for the public leaderboard
 * aggregation (R2 #5).
 *
 * Inputs are per-agent run sets; each run carries a `RunOutcome` from the
 * scoring layer plus optional latency/cost telemetry. Aggregates collapse
 * to a single row per agent: mean score, p95 latency, total cost, pass %.
 */

import type {RunOutcome} from '../scoring/types';

export type LeaderboardRun = {
  /** Stable per-scenario id, used for join/dedup against other agents. */
  test_id: string;
  outcome: RunOutcome;
  /** End-to-end turn latency in milliseconds. Optional — agents lacking */
  /* waterfall telemetry contribute to score/pass% only. */
  latency_ms?: number;
  /** Marginal cost of this run in USD (LLM + TTS + ASR). */
  cost_usd?: number;
};

export type LeaderboardAgentInput = {
  agent: string;
  /** Optional model id, surfaced in the JSON output (not the md table). */
  model?: string;
  runs: readonly LeaderboardRun[];
};

export type LeaderboardRow = {
  agent: string;
  model?: string;
  /** Mean of run outcome.score across runs (0-1). */
  score: number;
  /** p95 latency in ms across runs that reported latency. `null` if none. */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types
  latency_p95_ms: number | null;
  /** Sum of cost_usd across runs that reported cost. `null` if none. */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types
  cost_usd: number | null;
  /** Percentage of runs with outcome.status === 'passed' (0-100). */
  pass_pct: number;
  /** Number of runs aggregated. */
  runs: number;
};

export type Leaderboard = {
  /** ISO timestamp the leaderboard was generated. */
  generatedAt: string;
  /** Sorted descending by score; ties broken by agent name asc. */
  rows: LeaderboardRow[];
};

export type AggregateOptions = {
  /** Inject a clock for tests. Default: `() => new Date().toISOString()`. */
  now?: () => string;
};

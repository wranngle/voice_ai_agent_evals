import type {RunOutcome, Status} from '../scoring/types';

/**
 * One agent's run on a given scenario. Multiple of these (same scenario,
 * different agents) feed compareRuns() to produce a CompareResult.
 */
export type RunResult = {
  agentId: string;
  scenario: string;
  outcome: RunOutcome;
};

export type CompareCellDelta = {
  /** Numeric delta vs. the baseline (first) agent; `undefined` when either cell is missing. */
  score: number | undefined;
  /** Status change vs. baseline (e.g. `passed→failed`); `undefined` when statuses match. */
  statusDelta: string | undefined;
};

export type CompareRow = {
  /** Stable dimension axis (matches DimensionScore.name). */
  dimension: string;
  /** Per-agent cells, keyed by agentId, in the same order as CompareResult.agents. */
  cells: Array<{
    agentId: string;
    status: Status | 'missing';
    score: number;
    detail?: string;
  }>;
  /** Δ column values, one per non-baseline agent. */
  deltas: CompareCellDelta[];
};

export type CompareSummary = {
  agentId: string;
  status: Status;
  aggregateScore: number;
  passedCount: number;
  failedCount: number;
};

export type CompareResult = {
  scenario: string;
  /** Agents in column order. First agent is the baseline that Δ columns reference. */
  agents: string[];
  /** One row per unique dimension across all runs (union, stable order from first run). */
  rows: CompareRow[];
  summaries: CompareSummary[];
};

export {type DimensionScore, type Status, type RunOutcome} from '../scoring/types';

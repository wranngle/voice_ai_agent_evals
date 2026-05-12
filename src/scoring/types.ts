/**
 * @wranngle/voice-evals/scoring — Inspect-AI-shaped composable scoring.
 *
 * Three primitives:
 *   - Caller<I, R>: input -> Promise<RunResult>           (Inspect-AI "solver")
 *   - Scorer<R>:    run    -> DimensionScore[]            (axis-by-axis scoring)
 *   - Task<I, R>:   { name, dataset, caller, scorer }     (eval suite)
 *
 * DimensionScore is the unit of currency: every assertion / judge / latency
 * budget / audio analysis emits one or more of them. Scorers compose via
 * `compose()` and `weighted()` from ./composer.
 */

export type Status = 'passed' | 'failed' | 'error' | 'skipped';

export type DimensionScore = {
  /** Stable axis identifier. Used to aggregate across runs and diff baselines. */
  name: string;
  status: Status;
  /** Optional 0-1 score for partial credit. Default: 1 if passed, 0 otherwise. */
  score?: number;
  /** Optional weight for ensemble combination. Default 1. */
  weight?: number;
  /** Human-readable explanation (one line preferred). */
  detail?: string;
  /** Structured sub-evidence (per-turn breakdown, raw measurements, etc.). */
  evidence?: unknown;
};

/**
 * Aggregate outcome computed from a list of DimensionScores. The aggregate
 * status is `error` if any dimension errored, `failed` if any failed, else
 * `passed`. The weighted score is `sum(weight * score) / sum(weight)`.
 */
export type RunOutcome = {
  status: Status;
  dimensions: DimensionScore[];
  /** Weighted aggregate, 0-1. */
  score: number;
  /** Concatenated failure messages, one per non-passing dimension. */
  errors: string[];
};

/** Pure function: input -> Promise<RunResult>. The "solver" side of Inspect AI. */
export type Caller<I = unknown, R = unknown> = (input: I) => Promise<R>;

/** Pure function: run -> dimension scores. Composable via `compose()`. */
export type Scorer<R = unknown> = (run: R) =>
  | DimensionScore
  | DimensionScore[]
  | Promise<DimensionScore | DimensionScore[]>;

/** An eval task: a dataset of inputs, a caller to produce runs, a scorer to grade them. */
export type Task<I = unknown, R = unknown> = {
  name: string;
  dataset: readonly I[];
  caller: Caller<I, R>;
  scorer: Scorer<R>;
};

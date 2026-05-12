/**
 * ArenaGEval — pairwise LLM judge for A/B regression comparison.
 *
 * Given a rubric and two candidate outputs (baseline vs current), the
 * judge picks the winner. Pairwise comparison reduces single-output bias
 * (LLMs anchor to length, style, etc.) and is the right primitive when
 * the question is "did this PR make things better or worse?" — which is
 * exactly the closed-loop / regression workflow this package targets.
 *
 * Reference: pairwise eval as production-tuned in Chatbot Arena and
 * Confident AI / DeepEval ArenaGEval.
 */

import type {LlmCompleteCallback} from '../../ingestion/types';

export type PairwiseVerdict = 'baseline' | 'current' | 'tie';

export type PairwiseResult = {
  winner: PairwiseVerdict;
  reasoning: string;
};

export type PairwiseJudgeCallback = (
  rubric: string,
  baselineOutput: string,
  currentOutput: string,
) => Promise<PairwiseResult>;

const ARENA_SYSTEM = `You are an expert evaluator comparing two outputs against a rubric.

Two outputs are presented as Output A and Output B. Decide which one better satisfies the rubric. Position bias is a known issue — base your decision on substance, not on which label appears first.

Reason step-by-step. Then on a NEW line, emit ONLY one of:
<verdict>A</verdict>     (Output A is better)
<verdict>B</verdict>     (Output B is better)
<verdict>tie</verdict>   (substantively tied)`;

export type ArenaOptions = {
  /** Override the default Arena system prompt. */
  systemPrompt?: string;
  /** Randomize A/B assignment internally to mitigate position bias. Default true. */
  randomizePosition?: boolean;
  /** Inject a deterministic RNG for tests. */
  rng?: () => number;
};

export function arenaJudge(llm: LlmCompleteCallback, options: ArenaOptions = {}): PairwiseJudgeCallback {
  const system = options.systemPrompt ?? ARENA_SYSTEM;
  const randomize = options.randomizePosition ?? true;
  const rng = options.rng ?? Math.random;

  return async (rubric, baseline, current) => {
    // Position-shuffle: half the time, swap baseline ↔ current. After
    // parsing, un-swap the verdict so the caller always gets baseline/current
    // semantics.
    const swap = randomize && rng() < 0.5;
    const [outputA, outputB] = swap ? [current, baseline] : [baseline, current];

    const user = `Rubric:\n${rubric}\n\nOutput A:\n${outputA}\n\nOutput B:\n${outputB}\n\nReason step-by-step, then emit <verdict>.`;
    const raw = await llm({system, user});
    const match = /<verdict>\s*(a|b|tie)\s*<\/verdict>/i.exec(raw);

    let winnerRaw: PairwiseVerdict = 'tie';
    if (match) {
      const label = match[1].toLowerCase();
      if (label === 'a') {
        winnerRaw = 'baseline';
      } else if (label === 'b') {
        winnerRaw = 'current';
      }
    }

    // Un-swap for caller's semantics
    let winner = winnerRaw;
    if (swap) {
      if (winnerRaw === 'baseline') {
        winner = 'current';
      } else if (winnerRaw === 'current') {
        winner = 'baseline';
      }
    }

    const reasoning = match ? raw.replace(/<verdict>[^<]*<\/verdict>/i, '').trim() : raw.trim();
    return {winner, reasoning};
  };
}

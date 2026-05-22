/**
 * G-Eval — chain-of-thought-prompted LLM judge.
 *
 * Asks the judge LLM to reason step-by-step, then emit a 1-5 verdict
 * inside `<score>N</score>` tags. The verdict is parsed and normalized
 * to a 0-1 score for the standard `LlmJudgeCallback` contract (which
 * `llmRubric` from src/scoring/assertions consumes).
 *
 * Reference: Liu et al., G-Eval: NLG Evaluation using GPT-4 with Better
 * Human Alignment (2023). Production-tuned in DeepEval, Langfuse, and
 * Braintrust eval suites.
 */

import type {LlmCompleteCallback} from '../../ingestion/types';
import type {LlmJudgeCallback} from '../assertions';

const G_EVAL_SYSTEM = `You are an expert evaluator. Given a rubric and an output, score how well the output satisfies the rubric on a 1-5 scale.

1 = completely fails the rubric
2 = mostly fails
3 = partial / unclear
4 = mostly satisfies
5 = completely satisfies

Reason step-by-step about what the rubric asks and how the output performs against it.
Then, on a NEW line, emit ONLY the score in <score>N</score> tags.
Use an integer 1-5 or a decimal (e.g. <score>3.5</score>).`;

export type GEvalOptions = {
  /** Override the default G-Eval system prompt. */
  systemPrompt?: string;
};

export function gEvalJudge(llm: LlmCompleteCallback, options: GEvalOptions = {}): LlmJudgeCallback {
  const system = options.systemPrompt ?? G_EVAL_SYSTEM;
  return async (rubric, output) => {
    const user = `Rubric:\n${rubric}\n\nOutput:\n${output}\n\nReason step-by-step, then emit <score>N</score>.`;
    const raw = await llm({system, user});
    const match = /<score>\s*(\d+(?:\.\d+)?)\s*<\/score>/.exec(raw);
    if (!match) {
      return {score: 0, reasoning: `judge did not emit <score> tag; raw: ${raw.slice(0, 200)}`};
    }

    const rawScore = Number.parseFloat(match[1]);
    if (!Number.isFinite(rawScore)) {
      return {score: 0, reasoning: 'judge emitted non-numeric score'};
    }

    // Normalize 1-5 to 0-1 (1 -> 0, 5 -> 1).
    const clipped = Math.max(1, Math.min(5, rawScore));
    const score = (clipped - 1) / 4;
    const reasoning = raw.replace(/<score>[^<]*<\/score>/, '').trim();
    return {score, reasoning};
  };
}

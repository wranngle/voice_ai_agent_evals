/**
 * Lynx judge — Patronus's open-weights hallucination-detection model.
 *
 * Lynx 70B (and the 8B sibling) beats GPT-4o on PubMedQA hallucination
 * detection while being open-weights — you can self-host or call a
 * Patronus endpoint, both wired here through the standard
 * `LlmCompleteCallback`. We just prompt-engineer the canonical Lynx
 * FAITHFUL/HALLUCINATED verdict format.
 *
 * Reference: Patronus blog "Lynx: State-of-the-art open-source
 * hallucination detection model" (2024).
 *
 * Usage:
 *   const lynx = lynxJudge(myLynxLlmCallback);
 *   const dim = await llmRubric(
 *     'Does the answer stay faithful to the source document?',
 *     lynx,
 *   )(agentOutput);
 */

import type {LlmCompleteCallback} from '../../ingestion/types';
import type {LlmJudgeCallback} from '../assertions';

const LYNX_SYSTEM = `You are Lynx, an LLM-based hallucination detector. Given a context (the rubric — describing what the output should remain faithful to) and an output (the claim under test), you decide whether the claim is faithful to the context.

Reason step-by-step:
  1. What does the context establish or constrain?
  2. What specific claims does the output make?
  3. Is every claim in the output traceable to (or compatible with) the context?

Then on a NEW line, emit ONLY one of:
<verdict>FAITHFUL</verdict>      — claims are supported by the context
<verdict>HALLUCINATED</verdict>  — at least one claim is not supported`;

export function lynxJudge(llm: LlmCompleteCallback): LlmJudgeCallback {
  return async (rubric, output) => {
    const user = `Context (rubric):\n${rubric}\n\nOutput (claim):\n${output}`;
    const raw = await llm({system: LYNX_SYSTEM, user});
    const match = /<verdict>\s*(faithful|hallucinated)\s*<\/verdict>/i.exec(raw);
    if (!match) {
      return {
        score: 0,
        reasoning: `Lynx did not emit <verdict> tag; raw: ${raw.slice(0, 200)}`,
      };
    }

    const verdict = match[1].toUpperCase();
    const score = verdict === 'FAITHFUL' ? 1 : 0;
    const reasoning = raw.replace(/<verdict>[^<]*<\/verdict>/i, '').trim();
    return {score, reasoning};
  };
}

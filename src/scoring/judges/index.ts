/**
 * @wranngle/voice-evals/scoring/judges
 *
 * Four LLM-as-judge implementations, all callback-bound (consumer
 * supplies the LLM). Mix and match through the `llmRubric` assertion
 * from src/scoring/assertions.
 *
 *   gEvalJudge   — chain-of-thought single judge, 1-5 -> 0-1 score
 *   arenaJudge   — pairwise A/B comparison (baseline vs current)
 *   lynxJudge    — Patronus Lynx hallucination-detection prompt format
 *   evaluateDag  — composable decision-tree of leaves + branches
 */

export {gEvalJudge} from './g-eval';
export type {GEvalOptions} from './g-eval';

export {arenaJudge} from './arena';
export type {
  ArenaOptions, PairwiseJudgeCallback, PairwiseResult, PairwiseVerdict,
} from './arena';

export {evaluateDag, leaf, regexBranch} from './dag';
export type {
  DagDecisionNode, DagLeafNode, DagNode, DagResult,
} from './dag';

export {lynxJudge} from './lynx';

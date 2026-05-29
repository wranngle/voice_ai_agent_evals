/**
 * @wranngle/voice-evals/scoring
 *
 * Inspect-AI-shaped composable scoring engine: Task = (dataset, caller, scorer).
 * Promptfoo-style assertions DSL with `not(...)` negation. Audio-native
 * scorers (WAV parse + RMS envelope + barge-in detection) — the marquee
 * differentiator vs. text-only voice-eval incumbents.
 *
 * Shipped surface (post-v1.1):
 *   - judges/{g-eval, arena, dag, lynx}                   — 4 LLM-as-judge implementations
 *   - dialog.ts                                            — scoreContainmentRate, scoreNotEarlyTermination
 *   - rubrics.ts                                           — 7 canonical rubric prompts
 *   - audio.ts                                             — 6 audio metrics (VAD, barge-in, SNR, pitch, WPM, AI-interrupt)
 *
 * Still deferred (per FEATURE-MAP § "Known Gaps"):
 *   - latency.ts (rolling p95 module) — latency budgets are currently
 *     enforced inline by src/testing/runners/scenario-runner.ts
 *   - transcript.ts (standalone tone scorer) — tone is currently scored
 *     inline in the scenario runner as `tone_judge`
 */

export type {
  Caller, DimensionScore, RunOutcome, Scorer, Status, Task,
} from './types';

export {aggregate, compose, weighted} from './composer';

export type {Assertion, AsyncAssertion, LlmJudgeCallback} from './assertions';
export {
  contains, equals, llmRubric, not, notAsync, regex,
} from './assertions';

export type {
  BargeInOptions, BargeInResult, SegmentationOptions, SpeechSegment, WavInfo,
} from './audio';
export {
  detectBargeIn, detectSpeechSegments, parseWav, rmsEnvelope,
  scoreAiInterruptingUser,
  scoreAveragePitch,
  scoreBargeIn,
  scoreSignalToNoiseRatio,
  scoreSpeechRate,
  scoreVoiceActivity,
} from './audio';

export {scoreContainmentRate, scoreNotEarlyTermination} from './dialog';

export {
  scoreAiHumanHandoff,
  scoreCustomerSatisfaction,
  scoreFirstCallResolution,
  scoreInstructionFollowing,
  scoreIntentRecognition,
  scoreResponseConsistency,
  scoreTaskCompletion,
} from './rubrics';

export {
  arenaJudge, evaluateDag, gEvalJudge, leaf, lynxJudge, regexBranch,
} from './judges';
export type {
  ArenaOptions,
  DagDecisionNode,
  DagLeafNode,
  DagNode,
  DagResult,
  GEvalOptions,
  PairwiseJudgeCallback,
  PairwiseResult,
  PairwiseVerdict,
} from './judges';

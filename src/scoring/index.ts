/**
 * @wranngle/voice-evals/scoring
 *
 * Inspect-AI-shaped composable scoring engine: Task = (dataset, caller, scorer).
 * Promptfoo-style assertions DSL with `not(...)` negation. Audio-native
 * scorers (WAV parse + RMS envelope + barge-in detection) — the marquee
 * differentiator vs. text-only voice-eval incumbents.
 *
 * Subsequent phases add: latency.ts (rolling p95), transcript.ts (tone /
 * tool-call axes), judges/{g-eval, arena, dag, rubric, lynx}, and the
 * migration from src/testing/runners/scenario-runner.ts onto these
 * primitives.
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
  scoreBargeIn, scoreVoiceActivity,
} from './audio';

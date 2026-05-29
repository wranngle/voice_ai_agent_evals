/**
 * @wranngle/voice-evals/scoring/dialog — turn-level / outcome-level scorers
 * that operate on transcripts or caller-supplied call-outcome signals
 * rather than raw audio samples.
 *
 * Distinct from src/scoring/audio.ts (waveform-DSP) and src/scoring/rubrics.ts
 * (LLM-judged). Pure functions; the caller decides where the input booleans
 * come from (the runtime tool catalog, the transcript classifier, etc.).
 */

import type {DimensionScore} from './types';

/**
 * "Not early termination" scorer. Fails when the agent ended the call
 * (`terminated: true`) before the caller's goal was satisfied
 * (`goalAchieved: false`).
 *
 * The two inputs are caller-supplied because the meaning of "goal" is
 * scenario-specific: a refund-request scenario succeeds on refund
 * confirmation; a booking scenario succeeds on a slot being held. Wire this
 * to your scenario's success_criteria once and the scorer becomes the
 * canonical "did the agent hang up too early?" metric across the suite.
 *
 * - terminated=false                       → passed (call continued)
 * - terminated=true,  goalAchieved=true    → passed (resolved + ended cleanly)
 * - terminated=true,  goalAchieved=false   → failed (early termination)
 */
export function scoreNotEarlyTermination(options: {
  terminated: boolean;
  goalAchieved: boolean;
  name?: string;
}): DimensionScore {
  const name = options.name ?? 'not_early_termination';
  const earlyTermination = options.terminated && !options.goalAchieved;
  let detail: string;
  if (!options.terminated) {
    detail = 'call continued (no termination event)';
  } else if (earlyTermination) {
    detail = 'agent terminated before goal was achieved';
  } else {
    detail = 'agent terminated after goal was achieved';
  }

  return {
    name,
    status: earlyTermination ? 'failed' : 'passed',
    score: earlyTermination ? 0 : 1,
    detail,
    evidence: {terminated: options.terminated, goalAchieved: options.goalAchieved},
  };
}

/**
 * @wranngle/voice-evals/scoring/rubrics — semantic voice-agent metrics
 * judged by an LLM callback.
 *
 * Each metric is a Promise-returning DimensionScore producer that:
 *   1. Builds a canonical rubric prompt for the metric.
 *   2. Calls the supplied LlmCompleteCallback with system + user content.
 *   3. Parses `<score>N</score>` + the rest as reasoning (same wire format
 *      as src/scoring/judges/g-eval.ts).
 *   4. Wraps the result in a DimensionScore with the correct name.
 *
 * Covers the LLM-judged half of the v1.2 metrics push (Phase 1's
 * deterministic scorers live in audio.ts + dialog.ts). The judge prompts
 * are call-center-analytics-shaped — they map onto the metric definitions
 * voice-AI customers (LambdaTest, ElevenLabs internal asks) use to grade
 * agents.
 */

import type {LlmCompleteCallback} from '../ingestion/types';
import type {DimensionScore} from './types';

/**
 * Shared judge invocation: emits the rubric prompt, parses `<score>` (0-1
 * or 1-5 normalized), packages a DimensionScore.
 *
 * `rawScale` controls the score range the LLM is asked to emit:
 *  - `'binary'`  — score is 0 (fail) or 1 (pass); no scaling.
 *  - `'5'`       — score is 1..5; normalized to 0..1 as (n - 1) / 4.
 *  - `'fraction'`— score is 0..1 directly.
 */
async function judge(
  llm: LlmCompleteCallback,
  options: {
    name: string;
    system: string;
    user: string;
    threshold: number;
    rawScale: 'binary' | '5' | 'fraction';
  },
): Promise<DimensionScore> {
  let raw: string;
  try {
    raw = await llm({system: options.system, user: options.user});
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {name: options.name, status: 'error', detail: `judge callback failed: ${message}`};
  }

  // Match the score tag liberally so non-numeric contents reach the
  // Number.parseFloat → isFinite check below (it's the more actionable
  // error message than \"no score tag\").
  const match = /<score>\s*([^<]+?)\s*<\/score>/.exec(raw);
  if (!match) {
    return {
      name: options.name,
      status: 'error',
      detail: `judge did not emit <score> tag; raw: ${raw.slice(0, 200)}`,
      evidence: {raw},
    };
  }

  const rawScore = Number.parseFloat(match[1]);
  if (!Number.isFinite(rawScore)) {
    return {
      name: options.name, status: 'error', detail: `judge emitted non-numeric score: "${match[1]}"`, evidence: {raw},
    };
  }

  let score: number;
  if (options.rawScale === '5') {
    score = (Math.max(1, Math.min(5, rawScore)) - 1) / 4;
  } else if (options.rawScale === 'binary') {
    score = rawScore >= 0.5 ? 1 : 0;
  } else {
    score = Math.max(0, Math.min(1, rawScore));
  }

  const reasoning = raw.replace(/<score>[^<]*<\/score>/, '').trim();
  return {
    name: options.name,
    status: score >= options.threshold ? 'passed' : 'failed',
    score,
    detail: reasoning.slice(0, 500) || 'no reasoning supplied',
    evidence: {raw, parsedScore: rawScore},
  };
}

/**
 * Intent Recognition — did the agent correctly identify what the caller
 * wanted? Pass when the judge confirms the agent's first substantive
 * response aligns with `expectedIntent`.
 *
 * Use when the scenario has a known intent and you want a single
 * yes/no signal. For a freeform open-ended call where the intent isn't
 * known a priori, use g-eval / arena-judge against a custom rubric instead.
 */
export async function scoreIntentRecognition(
  llm: LlmCompleteCallback,
  options: {transcript: string; expectedIntent: string; name?: string; threshold?: number},
): Promise<DimensionScore> {
  return judge(llm, {
    name: options.name ?? 'intent_recognition',
    threshold: options.threshold ?? 0.5,
    rawScale: 'binary',
    system:
      'You judge whether a voice agent correctly identified the caller\'s intent. '
      + 'Output reasoning then <score>0</score> for misidentified or <score>1</score> for correctly identified. '
      + 'No other text after </score>.',
    user: `Expected intent: ${options.expectedIntent}\n\nTranscript:\n${options.transcript}\n\nReason briefly, then emit <score>0</score> or <score>1</score>.`,
  });
}

/**
 * Instruction Following — did the agent obey its system-prompt rules
 * (e.g. \"never quote prices over $X\", \"always confirm phone in
 * E.164\", \"refuse legal advice\")? Pass when the judge finds the
 * agent did not violate any supplied rule.
 *
 * `instructions` can be a single string or a list — each rule should be
 * a short imperative.
 */
export async function scoreInstructionFollowing(
  llm: LlmCompleteCallback,
  options: {transcript: string; instructions: string | string[]; name?: string; threshold?: number},
): Promise<DimensionScore> {
  const rules = Array.isArray(options.instructions)
    ? options.instructions.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : options.instructions;
  return judge(llm, {
    name: options.name ?? 'instruction_following',
    threshold: options.threshold ?? 0.8,
    rawScale: '5',
    system:
      'You judge how well a voice agent followed its instructions. '
      + 'Output reasoning identifying any violations, then <score>N</score> where '
      + '1=multiple major violations, 2=one major violation, 3=minor violations, '
      + '4=trivial deviations, 5=fully compliant. No other text after </score>.',
    user: `Instructions the agent was given:\n${rules}\n\nTranscript:\n${options.transcript}\n\nList each violation (or "none"), then emit <score>1..5</score>.`,
  });
}

/**
 * Task Completion — was the caller's requested task actually performed?
 * Pass when the judge confirms the task reached a definite resolution
 * (success or refused-with-reason — not stalled, hand-waved, or hallucinated).
 *
 * `task` is the action the caller asked for ("book an appointment for
 * Tuesday 2pm", "transfer me to billing", "schedule a callback").
 */
export async function scoreTaskCompletion(
  llm: LlmCompleteCallback,
  options: {transcript: string; task: string; name?: string; threshold?: number},
): Promise<DimensionScore> {
  return judge(llm, {
    name: options.name ?? 'task_completion',
    threshold: options.threshold ?? 0.5,
    rawScale: 'binary',
    system:
      'You judge whether a voice agent completed the caller\'s requested task. '
      + 'Output reasoning then <score>0</score> for did-not-complete or '
      + '<score>1</score> for completed (either successfully or with a clearly-'
      + 'stated refusal/escalation). No other text after </score>.',
    user: `Requested task: ${options.task}\n\nTranscript:\n${options.transcript}\n\nReason, then emit <score>0</score> or <score>1</score>.`,
  });
}

/**
 * First Call Resolution (FCR) — did the caller's goal resolve in this
 * single call, with no callback / no escalation needed? Pass when the
 * judge confirms a complete resolution and the caller is unlikely to
 * call back about the same issue.
 *
 * The headline call-center metric. Different from Task Completion in
 * that the resolution must be self-contained — \"we'll call you back\"
 * counts as a fail for FCR even when the task itself was logged.
 */
export async function scoreFirstCallResolution(
  llm: LlmCompleteCallback,
  options: {transcript: string; goal: string; name?: string; threshold?: number},
): Promise<DimensionScore> {
  return judge(llm, {
    name: options.name ?? 'first_call_resolution',
    threshold: options.threshold ?? 0.5,
    rawScale: 'binary',
    system:
      'You judge whether the caller\'s goal was resolved in this single call. '
      + 'Resolved = the caller has what they came for and would not need to call back '
      + 'about the same issue. Output reasoning, then <score>0</score> for not resolved '
      + '(callback needed, transferred without solution, abandoned) or <score>1</score> '
      + 'for resolved. No other text after </score>.',
    user: `Caller's goal: ${options.goal}\n\nTranscript:\n${options.transcript}\n\nReason, then emit <score>0</score> or <score>1</score>.`,
  });
}

/**
 * Customer Satisfaction (CSAT) — proxy estimate of how the caller would
 * rate the interaction, judged from their language, sentiment trajectory,
 * and the agent's apparent responsiveness.
 *
 * 1-5 internal scale (matches CSAT survey convention); normalized to
 * 0..1 for the DimensionScore. Threshold defaults to 0.5 (=>= 3/5).
 */
export async function scoreCustomerSatisfaction(
  llm: LlmCompleteCallback,
  options: {transcript: string; name?: string; threshold?: number},
): Promise<DimensionScore> {
  return judge(llm, {
    name: options.name ?? 'customer_satisfaction',
    threshold: options.threshold ?? 0.5,
    rawScale: '5',
    system:
      'You estimate the caller\'s likely CSAT rating from a transcript. '
      + 'Consider sentiment trajectory, frustration markers ("I already told you", '
      + 'repeated requests, raised voice cues), and the agent\'s responsiveness. '
      + 'Output reasoning then <score>N</score> where N is the predicted CSAT 1..5. '
      + 'No other text after </score>.',
    user: `Transcript:\n${options.transcript}\n\nReason about caller sentiment, then emit <score>1..5</score>.`,
  });
}

/**
 * AI → Human Handoff — when the agent escalated to a human (or refused),
 * was the transition smooth and informative? Pass when the judge confirms
 * the handoff included a clear reason, preserved context, and didn't
 * leave the caller confused or stranded.
 *
 * Use only when a handoff was expected or attempted. If the scenario
 * shouldn't have involved a handoff, pair this with `scoreContainmentRate`
 * (Phase 3) to detect *spurious* handoffs.
 */
export async function scoreAiHumanHandoff(
  llm: LlmCompleteCallback,
  options: {transcript: string; name?: string; threshold?: number},
): Promise<DimensionScore> {
  return judge(llm, {
    name: options.name ?? 'ai_human_handoff',
    threshold: options.threshold ?? 0.6,
    rawScale: '5',
    system:
      'You judge the quality of an AI-to-human handoff in a voice call. A clean '
      + 'handoff: clear reason given to the caller, no context loss, no abandoned '
      + 'mid-sentence transfer. Output reasoning then <score>N</score> 1..5 where '
      + '1=no handoff occurred (or hard fail) and 5=clean handoff with all of the above. '
      + 'No other text after </score>.',
    user: `Transcript:\n${options.transcript}\n\nFocus on the handoff moment. Reason, then emit <score>1..5</score>.`,
  });
}

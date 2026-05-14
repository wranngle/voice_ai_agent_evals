/**
 * @wranngle/voice-evals — latency waterfall types.
 *
 * A voice turn has four sequential legs the operator cares about:
 *   STT  — caller audio → recognized text
 *   LLM  — recognized text → first agent token (TTFT)
 *   Tool — agent tool calls (sum of all calls in the turn)
 *   TTS  — first agent token → first audio frame back to caller
 *
 * The waterfall is the per-leg breakdown for a single turn or for an entire
 * conversation (summed). Durations are integer milliseconds; missing legs
 * are reported as 0 rather than absent so consumers can iterate uniformly.
 */

export const LATENCY_LEG_NAMES = ['stt', 'llm', 'tool', 'tts'] as const;
export type LatencyLegName = (typeof LATENCY_LEG_NAMES)[number];

export type LatencyLeg = {
  name: LatencyLegName;
  duration_ms: number;
};

export type LatencyWaterfall = {
  /** Scope: one turn (`'turn'`) or the whole conversation (`'conversation'`). */
  scope: 'turn' | 'conversation';
  /** Optional zero-indexed turn number; present when `scope === 'turn'`. */
  turn_index?: number;
  legs: LatencyLeg[];
  /** Sum of leg durations, in ms. */
  total_ms: number;
};

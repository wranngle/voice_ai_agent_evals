/**
 * @wranngle/voice-evals/ingestion/post-call-import — deterministic converter
 * from ElevenLabs post-call webhook payloads to TestCase[].
 *
 * Pure function. No LLM. No I/O. The caller passes the parsed JSON of a
 * post-call webhook (`post_call_transcription` event); the function emits
 * one TestCase per evaluation_criteria_result if `analysis` is present, or
 * a single TestCase representing the conversation as a whole otherwise.
 *
 * Use this when you want every live call to seed a regression test ("trace
 * to test" — the Braintrust pattern from the research synthesis).
 */

import type {TestCase} from '../testing/types';
import {slugify} from '../internal/slug';
import {
  LATENCY_LEG_NAMES,
  type LatencyLeg,
  type LatencyLegName,
  type LatencyWaterfall,
} from '../types/latency';
import type {ElevenLabsPostCallPayload, ImportedTestCases} from './types';

type ImportOptions = {
  /** Tag(s) to apply to every produced TestCase. Default: `['ingested']`. */
  tags?: string[];
  /** Id prefix. Default: `'TC-POSTCALL'`. */
  idPrefix?: string;
  /** Override the timestamp baked into created_at / updated_at. For tests. */
  now?: () => string;
};

export function importPostCallWebhook(
  payload: ElevenLabsPostCallPayload,
  options: ImportOptions = {},
): ImportedTestCases {
  const tags = options.tags ?? ['ingested', 'post-call'];
  const idPrefix = options.idPrefix ?? 'TC-POSTCALL';
  const now = (options.now ?? defaultNow)();

  const data = payload.data ?? {};
  const conversationId = data.conversation_id ?? 'unknown';
  const agentId = data.agent_id;
  const summary = data.analysis?.transcript_summary;
  const criteriaResults = data.analysis?.evaluation_criteria_results;

  const cases: TestCase[] = [];

  if (criteriaResults && Object.keys(criteriaResults).length > 0) {
    for (const [criterionId, result] of Object.entries(criteriaResults)) {
      cases.push({
        test_id: `${idPrefix}-${slug(conversationId)}-${slug(criterionId)}`,
        type: 'elevenlabs',
        name: `${criterionId} — ${conversationId}`,
        description: result.rationale
          ?? `Evaluation criterion "${criterionId}" from conversation ${conversationId}.`,
        input: {
          agent_id: agentId,
          conversation_id: conversationId,
          replay_transcript: data.transcript ?? [],
        },
        expected_output: {
          [criterionId]: result.result ?? 'unknown',
          analysis_evaluation_pass: result.result === 'success',
        },
        tags: [...tags, `criterion:${criterionId}`],
        enabled: true,
        created_at: now,
        updated_at: now,
      });
    }
  } else {
    // No analysis present — emit a single placeholder test for the whole conversation.
    cases.push({
      test_id: `${idPrefix}-${slug(conversationId)}`,
      type: 'elevenlabs',
      name: `Conversation ${conversationId}`,
      description: summary
        ?? `Post-call import for conversation ${conversationId}. No analysis present.`,
      input: {
        agent_id: agentId,
        conversation_id: conversationId,
        replay_transcript: data.transcript ?? [],
      },
      expected_output: {
        call_successful: data.analysis?.call_successful ?? 'unknown',
      },
      tags,
      enabled: true,
      created_at: now,
      updated_at: now,
    });
  }

  const waterfalls = extractLatencyWaterfalls(data.transcript);

  return {
    cases,
    source: {
      agent_id: agentId,
      conversation_id: conversationId,
      transcript_summary: summary,
    },
    ...(waterfalls && {waterfalls}),
  };
}

/**
 * Maps an ElevenLabs `conversation_turn_metrics` key to one of the four
 * canonical waterfall legs. Returns `null` if the key is unrelated to a
 * leg (cost, total time, etc.) or already aggregated.
 *
 * Keys observed in ElevenLabs post-call payloads (May 2026):
 *   convai_llm_service_ttfb / convai_llm_service_ttf_sentence  -> llm
 *   convai_asr_service_ttfb                                    -> stt
 *   convai_tts_service_ttfb                                    -> tts
 *   convai_tool_calls_total_ms / convai_tool_call_ttfb         -> tool
 *
 * Numbers in the payload arrive in seconds (floats); we round to integer ms.
 */
const LEG_KEY_PATTERNS: Array<{pattern: RegExp; leg: LatencyLegName}> = [
  {pattern: /(^|_)(asr|stt)(_|$)/i, leg: 'stt'},
  {pattern: /(^|_)llm(_|$)/i, leg: 'llm'},
  {pattern: /(^|_)tool(_|$)/i, leg: 'tool'},
  {pattern: /(^|_)tts(_|$)/i, leg: 'tts'},
];

function classifyMetricKey(key: string): LatencyLegName | undefined {
  for (const {pattern, leg} of LEG_KEY_PATTERNS) {
    if (pattern.test(key)) {
      return leg;
    }
  }

  return undefined;
}

function toIntegerMs(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return undefined;
  }

  // ElevenLabs reports turn metrics in seconds; coerce to ms.
  // Heuristic: a positive value under 60 is seconds (a single turn rarely exceeds 60s
  // for any one leg); values >= 60 are already ms.
  const ms = raw < 60 ? raw * 1000 : raw;
  return Math.round(ms);
}

function summarizeTurnMetrics(metrics: Record<string, unknown>): Map<LatencyLegName, number> {
  const sums = new Map<LatencyLegName, number>();
  for (const [key, value] of Object.entries(metrics)) {
    const leg = classifyMetricKey(key);
    if (!leg) {
      continue;
    }

    const ms = toIntegerMs(value);
    if (ms === undefined) {
      continue;
    }

    sums.set(leg, (sums.get(leg) ?? 0) + ms);
  }

  return sums;
}

function buildLegs(sums: Map<LatencyLegName, number>): LatencyLeg[] {
  return LATENCY_LEG_NAMES.map(name => ({
    name,
    duration_ms: sums.get(name) ?? 0,
  }));
}

function extractLatencyWaterfalls(transcript: ElevenLabsPostCallPayload['data'] extends infer D
  ? D extends {transcript?: infer T} ? T : undefined
  : undefined): {turns: LatencyWaterfall[]; conversation: LatencyWaterfall} | undefined {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return undefined;
  }

  const turns: LatencyWaterfall[] = [];
  const totals = new Map<LatencyLegName, number>();
  let sawMetrics = false;

  for (const [index, turn] of transcript.entries()) {
    const metrics = (turn as {conversation_turn_metrics?: Record<string, unknown>})
      .conversation_turn_metrics;
    if (!metrics || typeof metrics !== 'object') {
      continue;
    }

    sawMetrics = true;

    const sums = summarizeTurnMetrics(metrics);
    if (sums.size === 0) {
      continue;
    }

    const legs = buildLegs(sums);
    const totalMs = legs.reduce((acc, leg) => acc + leg.duration_ms, 0);
    turns.push({
      scope: 'turn', turn_index: index, legs, total_ms: totalMs,
    });

    for (const [leg, ms] of sums.entries()) {
      totals.set(leg, (totals.get(leg) ?? 0) + ms);
    }
  }

  if (!sawMetrics) {
    return undefined;
  }

  const conversationLegs = buildLegs(totals);
  const conversationTotal = conversationLegs.reduce(
    (acc, leg) => acc + leg.duration_ms,
    0,
  );

  return {
    turns,
    conversation: {
      scope: 'conversation',
      legs: conversationLegs,
      total_ms: conversationTotal,
    },
  };
}

function slug(value: string): string {
  // Defer to the linear ReDoS-safe slugify helper.
  return slugify(value, {maxLength: 48});
}

function defaultNow(): string {
  return new Date().toISOString();
}

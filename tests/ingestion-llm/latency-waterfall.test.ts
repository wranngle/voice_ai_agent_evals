import {describe, expect, it} from 'vitest';
import {importPostCallWebhook} from '../../src/ingestion/post-call-import';
import type {ElevenLabsPostCallPayload} from '../../src/ingestion/types';
import {renderLatencyWaterfallSvg} from '../../src/report/latency-waterfall';
import {
  LATENCY_LEG_NAMES,
  type LatencyWaterfall,
} from '../../src/types/latency';

const FIXED_NOW = '2026-05-14T00:00:00.000Z';
const now = () => FIXED_NOW;

/**
 * Fixture: two-turn conversation with per-turn metrics in the shape the
 * ElevenLabs post-call webhook emits (seconds-as-floats keyed by service).
 */
function buildPayload(): ElevenLabsPostCallPayload {
  return {
    type: 'post_call_transcription',
    data: {
      agent_id: 'agent_demo',
      conversation_id: 'conv_lw_001',
      transcript: [
        {
          role: 'user',
          message: 'I need a callback after 5pm',
          conversation_turn_metrics: {
            convai_asr_service_ttfb: 0.215,
            convai_llm_service_ttfb: 0.420,
            convai_tool_call_total_ms: 0.090,
            convai_tts_service_ttfb: 0.310,
          },
        },
        {
          role: 'agent',
          message: 'I will schedule that for you.',
          conversation_turn_metrics: {
            convai_asr_service_ttfb: 0.180,
            convai_llm_service_ttfb: 0.512,
            convai_tts_service_ttfb: 0.295,
            // No tool call this turn.
          },
        },
      ],
    },
  };
}

describe('importPostCallWebhook — latency waterfall extraction', () => {
  it('produces a LatencyWaterfall per turn with four named legs', () => {
    const {waterfalls} = importPostCallWebhook(buildPayload(), {now});

    expect(waterfalls).toBeDefined();
    expect(waterfalls!.turns).toHaveLength(2);

    for (const turn of waterfalls!.turns) {
      const legNames = turn.legs.map(l => l.name);
      expect(legNames).toEqual([...LATENCY_LEG_NAMES]);
      expect(legNames).toHaveLength(4);
      expect(legNames).toContain('stt');
      expect(legNames).toContain('llm');
      expect(legNames).toContain('tool');
      expect(legNames).toContain('tts');
    }
  });

  it('reports integer-ms durations (no floats, no NaN, no negatives)', () => {
    const {waterfalls} = importPostCallWebhook(buildPayload(), {now});
    const allLegs: LatencyWaterfall['legs'] = [
      ...waterfalls!.turns.flatMap(t => t.legs),
      ...waterfalls!.conversation.legs,
    ];

    for (const leg of allLegs) {
      expect(Number.isInteger(leg.duration_ms)).toBe(true);
      expect(leg.duration_ms).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(leg.duration_ms)).toBe(true);
    }
  });

  it('coerces seconds-as-floats to integer ms (0.215s -> 215ms)', () => {
    const {waterfalls} = importPostCallWebhook(buildPayload(), {now});
    const turn0 = waterfalls!.turns[0];
    const stt = turn0.legs.find(l => l.name === 'stt')!;
    const llm = turn0.legs.find(l => l.name === 'llm')!;
    const tool = turn0.legs.find(l => l.name === 'tool')!;
    const tts = turn0.legs.find(l => l.name === 'tts')!;

    expect(stt.duration_ms).toBe(215);
    expect(llm.duration_ms).toBe(420);
    expect(tool.duration_ms).toBe(90);
    expect(tts.duration_ms).toBe(310);

    expect(turn0.total_ms).toBe(215 + 420 + 90 + 310);
  });

  it('aggregates a conversation-level waterfall by summing turn legs', () => {
    const {waterfalls} = importPostCallWebhook(buildPayload(), {now});
    const conv = waterfalls!.conversation;

    expect(conv.scope).toBe('conversation');
    expect(conv.turn_index).toBeUndefined();
    expect(conv.legs).toHaveLength(4);

    // Turn 1 has no tool leg; conversation tool == 90.
    const tool = conv.legs.find(l => l.name === 'tool')!;
    expect(tool.duration_ms).toBe(90);

    const stt = conv.legs.find(l => l.name === 'stt')!;
    expect(stt.duration_ms).toBe(215 + 180);

    expect(conv.total_ms).toBe(
      conv.legs.reduce((acc, l) => acc + l.duration_ms, 0),
    );
  });

  it('returns undefined waterfalls when no turn carries metrics', () => {
    const payload: ElevenLabsPostCallPayload = {
      type: 'post_call_transcription',
      data: {
        conversation_id: 'conv_no_metrics',
        transcript: [{role: 'agent', message: 'hi'}],
      },
    };

    const {waterfalls} = importPostCallWebhook(payload, {now});
    expect(waterfalls).toBeUndefined();
  });

  it('records the turn_index for each per-turn waterfall', () => {
    const {waterfalls} = importPostCallWebhook(buildPayload(), {now});
    expect(waterfalls!.turns.map(t => t.turn_index)).toEqual([0, 1]);
    expect(waterfalls!.turns.every(t => t.scope === 'turn')).toBe(true);
  });
});

describe('renderLatencyWaterfallSvg', () => {
  it('renders a horizontal-bar SVG with four bars (one per leg)', () => {
    const waterfall: LatencyWaterfall = {
      scope: 'conversation',
      legs: [
        {name: 'stt', duration_ms: 395},
        {name: 'llm', duration_ms: 932},
        {name: 'tool', duration_ms: 90},
        {name: 'tts', duration_ms: 605},
      ],
      total_ms: 2022,
    };

    const svg = renderLatencyWaterfallSvg(waterfall);

    // One <rect data-leg="..."> per canonical leg name; exactly four.
    const bars = svg.match(/<rect [^>]*data-leg="[^"]+"/g) ?? [];
    expect(bars).toHaveLength(4);

    for (const leg of LATENCY_LEG_NAMES) {
      expect(svg).toContain(`data-leg="${leg}"`);
    }

    // Top-level testid + total stamped on the root <svg>.
    expect(svg).toContain('data-testid="latency-waterfall"');
    expect(svg).toContain('data-total-ms="2022"');
    expect(svg).toMatch(/^<svg [^>]*>/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it('escapes XML in the aria-label so untrusted scope values cannot break the SVG', () => {
    const waterfall: LatencyWaterfall = {
      scope: 'turn',
      turn_index: 0,
      legs: LATENCY_LEG_NAMES.map(name => ({name, duration_ms: 100})),
      total_ms: 400,
    };
    const svg = renderLatencyWaterfallSvg(waterfall);
    // No raw `<` or `>` inside the aria-label attribute value.
    const ariaMatch = svg.match(/aria-label="([^"]*)"/);
    expect(ariaMatch).not.toBeNull();
    expect(ariaMatch![1]).not.toContain('<');
    expect(ariaMatch![1]).not.toContain('>');
  });
});

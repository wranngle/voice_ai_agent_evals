/**
 * @wranngle/voice-evals — latency waterfall SVG renderer.
 *
 * Pure function: takes a LatencyWaterfall and returns an inline SVG string
 * with one horizontal bar per leg (STT / LLM / Tool / TTS). No external CSS,
 * no fonts, no scripts — safe to embed in the HTML scorecard or stand alone.
 *
 * The output uses stable `data-leg` attributes so the scorecard test can
 * assert four bars without depending on visual coordinates.
 */

import type {LatencyLegName, LatencyWaterfall} from '../types/latency';

const LEG_COLORS: Record<LatencyLegName, string> = {
  stt: '#2563eb',
  llm: '#7c3aed',
  tool: '#059669',
  tts: '#d97706',
};

const LEG_LABELS: Record<LatencyLegName, string> = {
  stt: 'STT',
  llm: 'LLM',
  tool: 'Tool',
  tts: 'TTS',
};

export type RenderWaterfallOptions = {
  /** Outer SVG width in px. Default 480. */
  width?: number;
  /** Per-bar height in px. Default 24. */
  barHeight?: number;
  /** Gap between rows in px. Default 6. */
  rowGap?: number;
  /** Left gutter for leg labels in px. Default 56. */
  labelGutter?: number;
  /** Right gutter for duration text in px. Default 80. */
  durationGutter?: number;
};

export function renderLatencyWaterfallSvg(
  waterfall: LatencyWaterfall,
  options: RenderWaterfallOptions = {},
): string {
  const width = options.width ?? 480;
  const barHeight = options.barHeight ?? 24;
  const rowGap = options.rowGap ?? 6;
  const labelGutter = options.labelGutter ?? 56;
  const durationGutter = options.durationGutter ?? 80;

  const rows = waterfall.legs.length;
  const height = rows * (barHeight + rowGap) - rowGap;
  const trackWidth = Math.max(1, width - labelGutter - durationGutter);

  let maxDuration = 0;
  for (const leg of waterfall.legs) {
    maxDuration = Math.max(maxDuration, leg.duration_ms);
  }

  const denominator = maxDuration > 0 ? maxDuration : 1;

  const bars = waterfall.legs.map((leg, index) => {
    const y = index * (barHeight + rowGap);
    const barWidth = Math.max(
      1,
      Math.round((leg.duration_ms / denominator) * trackWidth),
    );
    const labelX = labelGutter - 8;
    const barX = labelGutter;
    const durationX = labelGutter + trackWidth + 8;
    const textY = y + barHeight / 2 + 4;
    const color = LEG_COLORS[leg.name];
    const label = escapeXml(LEG_LABELS[leg.name]);
    const duration = `${leg.duration_ms} ms`;

    return [
      `<text x="${labelX}" y="${textY}" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="#1f2937">${label}</text>`,
      `<rect data-leg="${leg.name}" data-duration-ms="${leg.duration_ms}" x="${barX}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${color}" />`,
      `<text x="${durationX}" y="${textY}" font-family="system-ui, sans-serif" font-size="12" fill="#374151">${duration}</text>`,
    ].join('');
  }).join('');

  const titleScope = waterfall.scope === 'turn'
    ? `Turn ${waterfall.turn_index ?? 0} latency`
    : 'Conversation latency';
  const totalLabel = `${waterfall.total_ms} ms total`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(`${titleScope}: ${totalLabel}`)}" data-testid="latency-waterfall" data-scope="${waterfall.scope}" data-total-ms="${waterfall.total_ms}">`,
    `<title>${escapeXml(`${titleScope} — ${totalLabel}`)}</title>`,
    bars,
    '</svg>',
  ].join('');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}

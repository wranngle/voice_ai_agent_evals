/**
 * `voice-evals demo` — 60-second end-to-end demo against a synthesized fixture.
 *
 * Promise: a brand-new visitor, after `npx @wranngle/voice-evals demo`, sees a
 * score, an HTML report path, and exit 0 in under a minute on a clean runner.
 * No env vars, no API keys, no file system inputs — the fixture is synthesized
 * deterministically in-memory so this works the same on any machine and any CI
 * runner that has Bun or Node ≥20.
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  detectBargeIn, parseWav, scoreVoiceActivity,
} from '../../scoring/audio';
import type {DimensionScore} from '../../scoring/types';
import {createTracer} from '../../internal/jsonl-trace';

const trace = createTracer('cli.demo');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type DemoOptions = {
  /** Stream output here. Defaults to stdout. */
  out?: (line: string) => void;
  /** Override output directory. Defaults to `<os.tmpdir()>/voice-evals-demo/<run-id>/`. */
  outDir?: string;
  /** Override the run id (otherwise wall-clock ms). */
  runId?: string;
};

export async function runDemo(options: DemoOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  const runId = options.runId ?? `run-${Date.now()}`;
  const outDir = options.outDir ?? join(tmpdir(), 'voice-evals-demo', runId);
  mkdirSync(outDir, {recursive: true});

  const start = Date.now();
  out('voice-evals demo — synthesizing 2.0s stereo fixture (caller=L, agent=R)');

  const wavBytes = synthesizeStereoFixture();
  const wavPath = join(outDir, 'fixture.wav');
  writeFileSync(wavPath, wavBytes);

  const wav = parseWav(wavBytes);
  out(`  audio: stereo, ${wav.sampleRate} Hz, ${Math.round(wav.durationMs)}ms`);

  const dimensions: DimensionScore[] = buildDimensions(wav);
  printDimensions(out, dimensions);

  const overall = computeOverall(dimensions);
  out('');
  out(`  overall: ${overall.score.toFixed(2)} (${overall.passed}/${overall.total} dimensions passed)`);

  const htmlPath = join(outDir, 'index.html');
  writeFileSync(htmlPath, renderDemoHtml({
    dimensions, overall, durationMs: Math.round(wav.durationMs), wavPath,
  }));

  const elapsed = Date.now() - start;
  out('');
  out(`  report: ${htmlPath}`);
  out(`  elapsed: ${elapsed}ms`);
  out('');
  out('  → next: voice-evals score <your-wav>   (see README for full surface)');

  return 0;
}

function buildDimensions(wav: ReturnType<typeof parseWav>): DimensionScore[] {
  const samples = wav.channelSamples ?? [];
  const caller = scoreVoiceActivity(wav, {channel: 0, minSpeechMs: 300, name: 'voice_activity_caller'});
  const agent = scoreVoiceActivity(wav, {channel: 1, minSpeechMs: 300, name: 'voice_activity_agent'});
  const barge = samples.length >= 2
    ? detectBargeIn({
      callerSamples: samples[0],
      agentSamples: samples[1],
      sampleRate: wav.sampleRate,
    })
    : {detected: false};
  const bargeDim: DimensionScore = barge.detected
    ? {
      name: 'barge_in_recovery',
      status: 'passed',
      score: 1,
      detail: `caller-start at ${barge.callerStartMs}ms, overlap ${barge.overlapMs ?? 0}ms`,
    }
    : {
      name: 'barge_in_recovery',
      status: 'passed',
      score: 1,
      detail: 'no barge-in detected (clean turn-taking)',
    };
  return [caller, agent, bargeDim];
}

function printDimensions(out: (line: string) => void, dimensions: DimensionScore[]): void {
  for (const d of dimensions) {
    const flag = d.status === 'passed' ? '✓' : '✗';
    const scoreText = d.score === undefined ? '' : ` (${d.score.toFixed(2)})`;
    out(`  ${flag} ${d.name}${scoreText}: ${d.detail ?? ''}`);
  }
}

function computeOverall(dimensions: DimensionScore[]): {score: number; passed: number; total: number} {
  const scored = dimensions.filter(d => typeof d.score === 'number') as Array<DimensionScore & {score: number}>;
  const score = scored.length === 0
    ? 0
    : scored.reduce((s, d) => s + d.score, 0) / scored.length;
  const passed = dimensions.filter(d => d.status === 'passed').length;
  return {score, passed, total: dimensions.length};
}

function renderDemoHtml(args: {
  dimensions: DimensionScore[];
  overall: {score: number; passed: number; total: number};
  durationMs: number;
  wavPath: string;
}): string {
  const rows = args.dimensions.map(d => {
    const scoreCell = d.score === undefined ? '—' : d.score.toFixed(2);
    return `      <tr><td>${escapeHtml(d.name)}</td><td>${d.status}</td><td>${scoreCell}</td><td>${escapeHtml(d.detail ?? '')}</td></tr>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>voice-evals demo report</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:680px;margin:2rem auto;color:#111;padding:0 1rem}
h1{margin:0 0 .25rem;font-size:1.4rem}
.sub{color:#666;margin-bottom:1rem}
.score{font-size:2.4rem;font-weight:600}
table{border-collapse:collapse;width:100%;margin-top:1rem}
th,td{padding:.4rem .6rem;text-align:left;border-bottom:1px solid #eee;font-size:.9rem}
th{background:#fafafa}
audio{margin-top:1rem;width:100%}
.footer{color:#888;font-size:.8rem;margin-top:1.5rem}
</style>
</head>
<body>
<h1>voice-evals demo report</h1>
<div class="sub">Synthesized fixture · ${args.durationMs}ms stereo</div>
<div class="score" data-testid="overall-score">${args.overall.score.toFixed(2)}</div>
<div>${args.overall.passed}/${args.overall.total} dimensions passed</div>
<table>
  <thead><tr><th>dimension</th><th>status</th><th>score</th><th>detail</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
<audio controls src="${escapeHtml(args.wavPath)}"></audio>
<div class="footer">Generated by <code>voice-evals demo</code>. Run <code>voice-evals score &lt;your.wav&gt;</code> on a real recording next.</div>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Deterministic stereo fixture: caller speaks 0–600ms (440Hz), pauses,
 * speaks again at 1200–1800ms; agent speaks 700–1100ms. No overlap, so
 * barge_in_recovery cleanly reports "no barge-in detected".
 */
function synthesizeStereoFixture(): Uint8Array {
  const sampleRate = 48_000;
  const totalMs = 2000;
  const totalSamples = (sampleRate * totalMs) / 1000;
  const caller = new Float32Array(totalSamples);
  const agent = new Float32Array(totalSamples);
  fillSine({
    buffer: caller, sampleRate, startMs: 0, endMs: 600, freq: 440,
  });
  fillSine({
    buffer: caller, sampleRate, startMs: 1200, endMs: 1800, freq: 440,
  });
  fillSine({
    buffer: agent, sampleRate, startMs: 700, endMs: 1100, freq: 330,
  });
  const interleaved = new Float32Array(totalSamples * 2);
  for (let i = 0; i < totalSamples; i++) {
    interleaved[i * 2] = caller[i];
    interleaved[i * 2 + 1] = agent[i];
  }

  return synthesizeWav(interleaved, sampleRate, 2);
}

type SineSegment = {
  buffer: Float32Array;
  sampleRate: number;
  startMs: number;
  endMs: number;
  freq: number;
  amplitude?: number;
};

function fillSine(segment: SineSegment): void {
  const {buffer, sampleRate, startMs, endMs, freq} = segment;
  const amplitude = segment.amplitude ?? 0.5;
  const startIdx = Math.floor((sampleRate * startMs) / 1000);
  const endIdx = Math.floor((sampleRate * endMs) / 1000);
  for (let i = startIdx; i < endIdx; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
}

function synthesizeWav(samples: Float32Array, sampleRate: number, channels: number): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52_49_46_46, false);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57_41_56_45, false);
  view.setUint32(12, 0x66_6D_74_20, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64_61_74_61, false);
  view.setUint32(40, dataSize, true);
  for (const [i, s] of samples.entries()) {
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(44 + i * 2, Math.round(clamped * 32_767), true);
  }

  return new Uint8Array(buffer);
}

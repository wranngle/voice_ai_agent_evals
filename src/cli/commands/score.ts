/**
 * `voice-evals score <wav-file>` — score a recorded conversation.
 *
 * Demonstrates the audio-native pitch (Phase 2). Loads a WAV PCM file,
 * runs voice-activity + barge-in scorers, prints DimensionScores.
 *
 * Mono WAV: voice activity only.
 * Stereo WAV (caller=L, agent=R): voice activity per channel + barge-in.
 *
 * Per Phase 0 audio-format decision the canonical fixture is WAV PCM
 * 48kHz mono/stereo; the parser also accepts 16/24/32-bit at any rate.
 */

import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  detectBargeIn, parseWav, scoreVoiceActivity, type WavInfo,
} from '../../scoring/audio';
import type {DimensionScore} from '../../scoring/types';
import {renderHtml} from '../../report/html';
import {createTracer} from '../../internal/jsonl-trace';
import {createEcsLogger, type EcsLogger} from '../../log/ecs';

const trace = createTracer('cli.score');
// JSONL tracing — emit start/end events from dispatch entry points.

void trace;

export type ScoreOptions = {
  /** Path to a WAV PCM file. */
  path: string;
  /** Min speech ms threshold for voice-activity scorer. Default 500. */
  minSpeechMs?: number;
  /** Max overlap ms for barge-in scorer. Default 250. */
  maxOverlapMs?: number;
  /** Stream output here. Defaults to stdout. */
  out?: (line: string) => void;
  /** Inject WAV bytes directly (skip the filesystem read) — for tests. */
  bytes?: Uint8Array;
  /** If set, emit a self-contained HTML scorecard at `<htmlOut>/index.html`. */
  htmlOut?: string;
  /** Optional stable run id surfaced in the report header. */
  runId?: string;
  /** Path to NDJSON ECS log sink. When absent the channel is a no-op. */
  jsonLogPath?: string | undefined;
  /** Inject a pre-built ECS logger (test seam). Bypasses jsonLogPath. */
  ecsLogger?: EcsLogger;
};

export async function runScore(options: ScoreOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  const ecs = options.ecsLogger ?? createEcsLogger({path: options.jsonLogPath});
  ecs.info('score.start', {
    'voice.score.path': options.path,
    'voice.score.bytes_injected': options.bytes !== undefined,
  }, 'voice-evals score invoked');

  if (!options.path && !options.bytes) {
    out('error: voice-evals score requires a path to a WAV file');
    out('usage: voice-evals score <wav-file>');
    ecs.error('score.usage_error', {'voice.score.reason': 'missing_path'}, 'missing wav path argument');
    return 1;
  }

  let bytes: Uint8Array;
  if (options.bytes) {
    bytes = options.bytes;
    ecs.info('score.load', {'voice.score.source': 'bytes'}, 'wav bytes injected');
  } else {
    if (!existsSync(options.path)) {
      out(`error: file not found: ${options.path}`);
      ecs.error('score.load_failed', {'voice.score.path': options.path, 'voice.score.reason': 'enoent'}, 'wav file not found');
      return 1;
    }

    bytes = new Uint8Array(readFileSync(options.path));
    ecs.info('score.load', {'voice.score.path': options.path, 'voice.score.bytes_len': bytes.byteLength}, 'wav file read');
  }

  let wav: WavInfo;
  try {
    wav = parseWav(bytes);
  } catch (error) {
    out(`error: not a WAV PCM file: ${(error as Error).message}`);
    ecs.error('score.parse_failed', {'error.message': (error as Error).message}, 'wav parse failed');
    return 1;
  }

  const minSpeechMs = options.minSpeechMs ?? 500;
  const maxOverlapMs = options.maxOverlapMs ?? 250;

  ecs.info('score.parse', {
    'voice.wav.channels': wav.channels,
    'voice.wav.sample_rate': wav.sampleRate,
    'voice.wav.bits_per_sample': wav.bitsPerSample,
    'voice.wav.duration_ms': Math.round(wav.durationMs),
  }, 'wav parsed');

  out(`Audio: ${wav.channels === 1 ? 'mono' : 'stereo'}, ${wav.sampleRate} Hz, ${wav.bitsPerSample}-bit, ${Math.round(wav.durationMs)}ms`);
  out('');

  ecs.info('score.thresholds', {
    'voice.score.min_speech_ms': minSpeechMs,
    'voice.score.max_overlap_ms': maxOverlapMs,
  }, 'scoring thresholds resolved');

  ecs.info('score.scorer_selected', {
    'voice.score.scorer_set': wav.channels === 1 ? 'mono' : 'stereo_with_barge_in',
  }, 'scorer set selected');

  const dimensions: DimensionScore[] = wav.channels === 1
    ? [scoreVoiceActivity(wav, {minSpeechMs, name: 'voice_activity'})]
    : buildStereoDimensions(wav, minSpeechMs, maxOverlapMs);

  ecs.info('score.dimensions_computed', {
    'voice.score.dimension_count': dimensions.length,
    'voice.score.mode': wav.channels === 1 ? 'mono' : 'stereo',
  }, 'dimensions computed');

  let anyFailed = false;
  for (const d of dimensions) {
    const flag = d.status === 'passed' ? '✓' : '✗';
    const scoreText = d.score === undefined ? '' : ` (${d.score.toFixed(2)})`;
    out(`  ${flag} ${d.name}${scoreText}: ${d.detail ?? ''}`);
    ecs.info('score.dimension', {
      'voice.dimension.name': d.name,
      'voice.dimension.status': d.status,
      'voice.dimension.score': d.score ?? null,
    }, `${d.name}: ${d.status}`);
    if (d.status !== 'passed' && d.status !== 'skipped') {
      anyFailed = true;
    }
  }

  if (options.htmlOut) {
    const audioSummary = `${wav.channels === 1 ? 'mono' : 'stereo'}, ${wav.sampleRate} Hz, ${wav.bitsPerSample}-bit, ${Math.round(wav.durationMs)}ms`;
    const rendered = renderHtml(
      {
        runId: options.runId,
        audioPath: options.path ? resolve(options.path) : '',
        audioSummary,
        dimensions,
      },
      options.htmlOut,
    );
    out('');
    out(`HTML scorecard: ${rendered.htmlPath}`);
  }

  ecs.info('score.complete', {
    'voice.score.failed': anyFailed,
    'voice.score.exit_code': anyFailed ? 1 : 0,
  }, anyFailed ? 'score failed' : 'score passed');

  return anyFailed ? 1 : 0;
}

function buildStereoDimensions(
  wav: WavInfo,
  minSpeechMs: number,
  maxOverlapMs: number,
): DimensionScore[] {
  if (!wav.channelSamples || wav.channels < 2) {
    return [];
  }

  const caller = scoreVoiceActivity(wav, {channel: 0, minSpeechMs, name: 'voice_activity_caller'});
  const agent = scoreVoiceActivity(wav, {channel: 1, minSpeechMs, name: 'voice_activity_agent'});
  const bargeIn = detectBargeIn({
    callerSamples: wav.channelSamples[0],
    agentSamples: wav.channelSamples[1],
    sampleRate: wav.sampleRate,
  });

  const bargeDim: DimensionScore = bargeIn.detected
    ? {
      name: 'barge_in_recovery',
      status: (bargeIn.overlapMs ?? 0) <= maxOverlapMs ? 'passed' : 'failed',
      score: (bargeIn.overlapMs ?? 0) <= maxOverlapMs
        ? 1
        : Math.max(0, 1 - ((bargeIn.overlapMs ?? 0) - maxOverlapMs) / 1000),
      detail: `caller-start at ${bargeIn.callerStartMs}ms, agent still speaking until ${bargeIn.agentStillSpeakingMs}ms, overlap ${bargeIn.overlapMs ?? 0}ms (max ${maxOverlapMs}ms)`,
    }
    : {name: 'barge_in_recovery', status: 'passed', detail: 'no barge-in detected'};

  return [caller, agent, bargeDim];
}

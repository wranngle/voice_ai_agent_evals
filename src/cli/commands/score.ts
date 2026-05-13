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
import {
  detectBargeIn, parseWav, scoreVoiceActivity, type WavInfo,
} from '../../scoring/audio';
import type {DimensionScore} from '../../scoring/types';

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
};

export async function runScore(options: ScoreOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.path && !options.bytes) {
    out('error: voice-evals score requires a path to a WAV file');
    out('usage: voice-evals score <wav-file>');
    return 1;
  }

  let bytes: Uint8Array;
  if (options.bytes) {
    bytes = options.bytes;
  } else {
    if (!existsSync(options.path)) {
      out(`error: file not found: ${options.path}`);
      return 1;
    }

    bytes = new Uint8Array(readFileSync(options.path));
  }

  let wav: WavInfo;
  try {
    wav = parseWav(bytes);
  } catch (error) {
    out(`error: not a WAV PCM file: ${(error as Error).message}`);
    return 1;
  }

  const minSpeechMs = options.minSpeechMs ?? 500;
  const maxOverlapMs = options.maxOverlapMs ?? 250;

  out(`Audio: ${wav.channels === 1 ? 'mono' : 'stereo'}, ${wav.sampleRate} Hz, ${wav.bitsPerSample}-bit, ${Math.round(wav.durationMs)}ms`);
  out('');

  const dimensions: DimensionScore[] = wav.channels === 1
    ? [scoreVoiceActivity(wav, {minSpeechMs, name: 'voice_activity'})]
    : buildStereoDimensions(wav, minSpeechMs, maxOverlapMs);

  let anyFailed = false;
  for (const d of dimensions) {
    const flag = d.status === 'passed' ? '✓' : '✗';
    const scoreText = d.score === undefined ? '' : ` (${d.score.toFixed(2)})`;
    out(`  ${flag} ${d.name}${scoreText}: ${d.detail ?? ''}`);
    if (d.status !== 'passed' && d.status !== 'skipped') {
      anyFailed = true;
    }
  }

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

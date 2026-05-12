/**
 * @wranngle/voice-evals/scoring/audio — audio-native scoring for WAV PCM 48kHz.
 *
 * Capabilities (Phase 2 MVP):
 *   - parseWav(buffer): WAV PCM parser (16/24/32-bit, mono or stereo).
 *   - rmsEnvelope(samples, sampleRate, windowMs): RMS-energy envelope.
 *   - detectSpeechSegments(envelope, opts): energy-threshold VAD.
 *   - detectBargeIn({callerSamples, agentSamples, sampleRate}): barge-in
 *     detection between two parallel speaker streams.
 *   - scoreVoiceActivity(wav, opts): dead-air dimension scorer.
 *   - scoreBargeIn(...): barge-in dimension scorer.
 *
 * Audio fixture format per Phase 0 decision: WAV PCM 48kHz mono. Stereo and
 * 16/24/32-bit are accepted at parse time. Non-PCM formats (mu-law, ADPCM)
 * are rejected — convert to PCM with `ffmpeg -i in.wav -c:a pcm_s16le out.wav`.
 *
 * All functions are pure. No filesystem I/O. The caller is expected to load
 * the WAV bytes via `node:fs` and pass them in.
 */

import type {DimensionScore} from './types';

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Interleaved samples normalized to [-1, 1]. For stereo, layout is L,R,L,R,... */
  samples: Float32Array;
  /** Deinterleaved per-channel arrays. Present only when channels > 1. */
  channelSamples?: Float32Array[];
  durationMs: number;
};

const FORMAT_PCM = 1;
const CHUNK_RIFF = 0x52_49_46_46;
const CHUNK_WAVE = 0x57_41_56_45;
const CHUNK_FMT = 0x66_6D_74_20;
const CHUNK_DATA = 0x64_61_74_61;

export function parseWav(buffer: ArrayBuffer | Uint8Array): WavInfo {
  const ab = buffer instanceof Uint8Array
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer;
  const view = new DataView(ab);

  if (view.byteLength < 12) {
    throw new Error('Not a WAV file: too short');
  }

  if (view.getUint32(0, false) !== CHUNK_RIFF) {
    throw new Error('Not a WAV file: missing RIFF header');
  }

  if (view.getUint32(8, false) !== CHUNK_WAVE) {
    throw new Error('Not a WAV file: missing WAVE marker');
  }

  let offset = 12;
  let fmt: {format: number; channels: number; sampleRate: number; bitsPerSample: number} | undefined;
  let dataOffset = -1;
  let dataSize = -1;

  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === CHUNK_FMT) {
      fmt = {
        format: view.getUint16(offset + 8, true),
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    } else if (chunkId === CHUNK_DATA) {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (!fmt) {
    throw new Error('Not a WAV file: missing fmt chunk');
  }

  if (dataOffset < 0) {
    throw new Error('Not a WAV file: missing data chunk');
  }

  if (fmt.format !== FORMAT_PCM) {
    throw new Error(`Unsupported WAV format ${fmt.format} (only PCM=1 supported)`);
  }

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / bytesPerSample / fmt.channels);
  const interleaved = new Float32Array(frameCount * fmt.channels);

  for (let i = 0; i < frameCount * fmt.channels; i++) {
    const sampleOffset = dataOffset + i * bytesPerSample;
    switch (fmt.bitsPerSample) {
      case 16: {
        interleaved[i] = view.getInt16(sampleOffset, true) / 32_768;

        break;
      }

      case 24: {
        const b1 = view.getUint8(sampleOffset);
        const b2 = view.getUint8(sampleOffset + 1);
        const b3 = view.getInt8(sampleOffset + 2);
        // 24-bit sign-extended into 32 bits, normalized to [-1, 1].
        // eslint-disable-next-line no-bitwise
        interleaved[i] = ((b3 << 16) | (b2 << 8) | b1) / 8_388_608;

        break;
      }

      case 32: {
        interleaved[i] = view.getInt32(sampleOffset, true) / 2_147_483_648;

        break;
      }

      case 8: {
      // 8-bit PCM is unsigned, centered on 128
        interleaved[i] = (view.getUint8(sampleOffset) - 128) / 128;

        break;
      }

      default: {
        throw new Error(`Unsupported bit depth: ${fmt.bitsPerSample}`);
      }
    }
  }

  let channelSamples: Float32Array[] | undefined;
  if (fmt.channels > 1) {
    channelSamples = [];
    for (let ch = 0; ch < fmt.channels; ch++) {
      const buf = new Float32Array(frameCount);
      for (let i = 0; i < frameCount; i++) {
        buf[i] = interleaved[i * fmt.channels + ch];
      }

      channelSamples.push(buf);
    }
  }

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
    samples: interleaved,
    channelSamples,
    durationMs: (frameCount / fmt.sampleRate) * 1000,
  };
}

/**
 * Compute RMS energy in fixed-size windows. Default 50ms windows; at 48kHz
 * that's 2400 samples per window. Returns one float per window, in the
 * order of the input.
 */
export function rmsEnvelope(
  samples: Float32Array,
  sampleRate: number,
  windowMs = 50,
): Float32Array {
  const windowSamples = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
  const windowCount = Math.floor(samples.length / windowSamples);
  const envelope = new Float32Array(windowCount);

  for (let w = 0; w < windowCount; w++) {
    let sum = 0;
    const start = w * windowSamples;
    for (let i = start; i < start + windowSamples; i++) {
      sum += samples[i] * samples[i];
    }

    envelope[w] = Math.sqrt(sum / windowSamples);
  }

  return envelope;
}

export type SpeechSegment = {startMs: number; endMs: number};

export type SegmentationOptions = {
  /** RMS threshold above which we consider the window "speech". Default 0.02. */
  threshold?: number;
  /** Window size used to compute the envelope. Default 50ms. */
  windowMs?: number;
  /** Minimum continuous speech duration to register a segment. Default 100ms. */
  minSpeechMs?: number;
  /** Silence run before closing a segment. Default 200ms (handles inter-word pauses). */
  minSilenceMs?: number;
};

/**
 * Find speech segments via energy-threshold VAD. Smoothing parameters
 * (`minSpeechMs` / `minSilenceMs`) prevent flickering at word boundaries.
 */
export function detectSpeechSegments(
  envelope: Float32Array,
  options: SegmentationOptions = {},
): SpeechSegment[] {
  const threshold = options.threshold ?? 0.02;
  const windowMs = options.windowMs ?? 50;
  const minSpeechWindows = Math.max(1, Math.ceil((options.minSpeechMs ?? 100) / windowMs));
  const minSilenceWindows = Math.max(1, Math.ceil((options.minSilenceMs ?? 200) / windowMs));
  const segments: SpeechSegment[] = [];

  let inSpeech = false;
  let segStart = 0;
  let silenceRun = 0;

  for (const [i, element] of envelope.entries()) {
    const aboveThreshold = element >= threshold;

    if (aboveThreshold) {
      if (!inSpeech) {
        inSpeech = true;
        segStart = i;
      }

      silenceRun = 0;
    } else if (inSpeech) {
      silenceRun++;
      if (silenceRun >= minSilenceWindows) {
        const segEnd = i - silenceRun;
        if (segEnd - segStart >= minSpeechWindows) {
          segments.push({startMs: segStart * windowMs, endMs: segEnd * windowMs});
        }

        inSpeech = false;
        silenceRun = 0;
      }
    }
  }

  if (inSpeech) {
    const segEnd = envelope.length - silenceRun;
    if (segEnd - segStart >= minSpeechWindows) {
      segments.push({startMs: segStart * windowMs, endMs: segEnd * windowMs});
    }
  }

  return segments;
}

export type BargeInResult = {
  detected: boolean;
  /** ms from start of call to caller's first speech onset. */
  callerStartMs?: number;
  /** ms position of agent's last above-threshold sample at/after callerStartMs. */
  agentStillSpeakingMs?: number;
  /** Overlap duration (ms) — caller's speech tail intersecting agent's. */
  overlapMs?: number;
};

export type BargeInOptions = {
  callerSamples: Float32Array;
  agentSamples: Float32Array;
  sampleRate: number;
  threshold?: number;
  windowMs?: number;
  /** Caller speech onsets shorter than this don't count (anti-thrash). Default 100ms. */
  minSpeechMs?: number;
};

/**
 * Detect barge-in given two parallel speaker streams.
 *
 * A barge-in is when the caller starts speaking while the agent is still
 * speaking. Requires deinterleaved per-speaker WAV streams — typical
 * ElevenLabs post-call audio export gives stereo (L=agent, R=caller, or
 * vice-versa depending on deployment); use `wav.channelSamples[0]` and
 * `wav.channelSamples[1]` after `parseWav()`.
 */
export function detectBargeIn(options: BargeInOptions): BargeInResult {
  const threshold = options.threshold ?? 0.02;
  const windowMs = options.windowMs ?? 50;
  const minSpeechMs = options.minSpeechMs ?? 100;
  const callerEnv = rmsEnvelope(options.callerSamples, options.sampleRate, windowMs);
  const agentEnv = rmsEnvelope(options.agentSamples, options.sampleRate, windowMs);
  const callerSegs = detectSpeechSegments(callerEnv, {threshold, windowMs, minSpeechMs});

  for (const callerSeg of callerSegs) {
    const windowIdx = Math.floor(callerSeg.startMs / windowMs);
    if (windowIdx < agentEnv.length && agentEnv[windowIdx] >= threshold) {
      let agentEndMs = callerSeg.startMs;
      for (let i = windowIdx + 1; i < agentEnv.length; i++) {
        if (agentEnv[i] < threshold) {
          break;
        }

        agentEndMs = i * windowMs;
      }

      const overlapMs = Math.max(0, Math.min(agentEndMs, callerSeg.endMs) - callerSeg.startMs);
      return {
        detected: true,
        callerStartMs: callerSeg.startMs,
        agentStillSpeakingMs: agentEndMs,
        overlapMs,
      };
    }
  }

  return {detected: false};
}

/**
 * Voice-activity scorer — passes if total speech duration on the given
 * channel meets `minSpeechMs`. Use to catch dead-air bugs (caller hung up,
 * agent never spoke, audio file is silent).
 */
export function scoreVoiceActivity(
  wav: WavInfo,
  options: {minSpeechMs: number; threshold?: number; channel?: number; name?: string},
): DimensionScore {
  const samples = options.channel !== undefined && wav.channelSamples
    ? wav.channelSamples[options.channel]
    : wav.samples;
  if (!samples) {
    return {
      name: options.name ?? 'voice_activity',
      status: 'error',
      detail: `channel ${options.channel} not present (file has ${wav.channels} channel(s))`,
    };
  }

  const env = rmsEnvelope(samples, wav.sampleRate, 50);
  const segments = detectSpeechSegments(env, {threshold: options.threshold ?? 0.02, windowMs: 50});
  const totalMs = segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);

  return {
    name: options.name ?? 'voice_activity',
    status: totalMs >= options.minSpeechMs ? 'passed' : 'failed',
    score: Math.min(1, totalMs / options.minSpeechMs),
    detail: `${segments.length} segment(s), ${totalMs}ms total speech (min ${options.minSpeechMs}ms)`,
    evidence: segments,
  };
}

/**
 * Barge-in scorer — fails if barge-in was detected with overlap exceeding
 * `maxOverlapMs`. Agents should yield within ~250ms of caller speech onset
 * per ElevenLabs voice-agent best practices; configurable here.
 */
export function scoreBargeIn(options: BargeInOptions & {maxOverlapMs?: number; name?: string}): DimensionScore {
  const result = detectBargeIn(options);
  const maxOverlapMs = options.maxOverlapMs ?? 250;
  const name = options.name ?? 'barge_in_recovery';

  if (!result.detected) {
    return {name, status: 'passed', detail: 'no barge-in detected'};
  }

  const overlapMs = result.overlapMs ?? 0;
  const passed = overlapMs <= maxOverlapMs;
  return {
    name,
    status: passed ? 'passed' : 'failed',
    score: passed ? 1 : Math.max(0, 1 - (overlapMs - maxOverlapMs) / 1000),
    detail: `barge-in at ${result.callerStartMs}ms, ${overlapMs}ms overlap (max ${maxOverlapMs}ms)`,
    evidence: result,
  };
}

/**
 * @wranngle/voice-evals/scoring/audio — audio-native scoring for WAV PCM 48kHz.
 *
 * Capabilities:
 *   - parseWav(buffer): WAV PCM parser (16/24/32-bit, mono or stereo).
 *   - rmsEnvelope(samples, sampleRate, windowMs): RMS-energy envelope.
 *   - detectSpeechSegments(envelope, opts): energy-threshold VAD.
 *   - detectBargeIn({callerSamples, agentSamples, sampleRate}): barge-in
 *     detection between two parallel speaker streams.
 *   - scoreVoiceActivity(wav, opts): dead-air dimension scorer.
 *   - scoreBargeIn(...): user-interrupts-agent dimension scorer.
 *   - scoreAiInterruptingUser(...): agent-interrupts-user dimension scorer
 *     (the inverse direction — agent talks over caller).
 *   - scoreSignalToNoiseRatio(wav, opts): SNR(dB) over speech vs. silence.
 *   - scoreAveragePitch(wav, opts): F0 estimation via autocorrelation.
 *   - scoreSpeechRate(wav, {transcript, ...}): words-per-minute on speech.
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

/**
 * Resolve the sample stream for a scorer's `channel` option:
 *
 *  - undefined → the whole file (mono samples or interleaved stereo as-is).
 *  - explicit on stereo+ → the deinterleaved per-channel array.
 *  - `0` on mono → the mono samples (channel 0 of a mono file is the file).
 *  - any other index on mono → `undefined` (caller should `error` out).
 *
 * Previous behavior silently fell back to `wav.samples` whenever
 * `wav.channelSamples` was undefined, which turned "I asked for channel 1 on
 * a mono file" into "score the wrong audio" instead of "error". P2 codex
 * review on PR #108.
 */
function pickChannel(wav: WavInfo, channel?: number): Float32Array | undefined {
  if (channel === undefined) {
    return wav.samples;
  }

  if (wav.channelSamples) {
    return wav.channelSamples[channel];
  }

  if (channel === 0) {
    return wav.samples;
  }

  return undefined;
}

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
        // segEnd is the index AFTER the last speech window — matching the
        // trailing-speech branch below which uses `envelope.length - silenceRun`.
        // Previously `i - silenceRun` recorded the LAST SPEECH INDEX, so endMs
        // came back one windowMs short (e.g. a 1000ms tone followed by silence
        // showed endMs=950 instead of 1000). P2 codex review on PR #108.
        const segEnd = i + 1 - silenceRun;
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
  const samples = pickChannel(wav, options.channel);
  if (!samples) {
    return {
      name: options.name ?? 'voice_activity',
      status: 'error',
      detail: `channel ${options.channel} not available (file has ${wav.channels} channel(s))`,
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

/**
 * AI-interrupts-user scorer — the inverse direction of barge-in. Fails when
 * the AGENT starts speaking while the caller is still speaking (overlap >
 * `maxOverlapMs`). Operationally the same `detectBargeIn` algorithm with
 * caller/agent channels swapped: agent onsets are scanned against active
 * caller speech instead of the other way around.
 *
 * Use both `scoreBargeIn` and `scoreAiInterruptingUser` on the same WAV to
 * separate "user butting in over the agent" (recoverable, the agent should
 * yield) from "agent talking over the user" (a hard defect — the model
 * should never preempt the caller).
 */
export function scoreAiInterruptingUser(options: BargeInOptions & {maxOverlapMs?: number; name?: string}): DimensionScore {
  const result = detectBargeIn({
    ...options,
    callerSamples: options.agentSamples,
    agentSamples: options.callerSamples,
  });
  const maxOverlapMs = options.maxOverlapMs ?? 250;
  const name = options.name ?? 'ai_interrupting_user';
  if (!result.detected) {
    return {
      name, status: 'passed', score: 1, detail: 'no agent-onset overlap detected', evidence: result,
    };
  }

  const overlapMs = result.overlapMs ?? 0;
  const passed = overlapMs <= maxOverlapMs;
  return {
    name,
    status: passed ? 'passed' : 'failed',
    score: passed ? 1 : Math.max(0, 1 - (overlapMs - maxOverlapMs) / 1000),
    detail: `agent started at ${result.callerStartMs}ms, ${overlapMs}ms overlap into caller speech (max ${maxOverlapMs}ms)`,
    evidence: result,
  };
}

/**
 * Signal-to-noise ratio (dB) scorer. Splits the envelope into "speech"
 * windows (per `detectSpeechSegments`) and "non-speech" windows; SNR is
 * `20 * log10(rmsSpeech / rmsNoise)`. Defaults: 50ms window, 0.02 threshold,
 * pass at ≥ 20 dB (decent telephony quality).
 *
 * Edge cases handled: no speech detected → `error`. Pure-speech file (no
 * noise windows) → `passed` with `SNR ∞` since there's no noise to measure.
 * For stereo files, pass `channel` (0 = first deinterleaved channel).
 */
export function scoreSignalToNoiseRatio(
  wav: WavInfo,
  options: {minSnrDb?: number; threshold?: number; windowMs?: number; channel?: number; name?: string} = {},
): DimensionScore {
  const name = options.name ?? 'snr_db';
  const samples = pickChannel(wav, options.channel);
  if (!samples) {
    return {name, status: 'error', detail: `channel ${options.channel} not available (file has ${wav.channels} channel(s))`};
  }

  const windowMs = options.windowMs ?? 50;
  const threshold = options.threshold ?? 0.02;
  const minSnrDb = options.minSnrDb ?? 20;
  const env = rmsEnvelope(samples, wav.sampleRate, windowMs);
  const segments = detectSpeechSegments(env, {threshold, windowMs});

  const speechWindows = new Set<number>();
  for (const seg of segments) {
    const startIdx = Math.floor(seg.startMs / windowMs);
    const endIdx = Math.ceil(seg.endMs / windowMs);
    for (let i = startIdx; i < endIdx; i++) {
      speechWindows.add(i);
    }
  }

  let signalSumSq = 0;
  let signalCount = 0;
  let noiseSumSq = 0;
  let noiseCount = 0;
  for (const [i, v] of env.entries()) {
    if (speechWindows.has(i)) {
      signalSumSq += v * v;
      signalCount++;
    } else {
      noiseSumSq += v * v;
      noiseCount++;
    }
  }

  if (signalCount === 0) {
    return {name, status: 'error', detail: 'no speech segments detected — cannot compute SNR'};
  }

  if (noiseCount === 0) {
    return {
      name, status: 'passed', score: 1, detail: 'no silence windows — pure-signal file (SNR ∞)', evidence: {signalCount, noiseCount: 0},
    };
  }

  const signalRms = Math.sqrt(signalSumSq / signalCount);
  const noiseRms = Math.sqrt(noiseSumSq / noiseCount);
  const snrDb = 20 * Math.log10(signalRms / Math.max(noiseRms, 1e-10));
  const passed = snrDb >= minSnrDb;

  return {
    name,
    status: passed ? 'passed' : 'failed',
    score: passed ? 1 : Math.max(0, snrDb / minSnrDb),
    detail: `${snrDb.toFixed(1)}dB SNR (signal=${signalRms.toFixed(3)}, noise=${noiseRms.toFixed(3)}, min ${minSnrDb}dB)`,
    evidence: {
      snrDb, signalRms, noiseRms, signalWindowCount: signalCount, noiseWindowCount: noiseCount,
    },
  };
}

/**
 * Average pitch (F0) scorer via time-domain autocorrelation. For each speech
 * segment, takes a `frameMs`-wide frame near the segment midpoint, runs AC
 * over lag range [SR/maxHz, SR/minHz], picks the lag with peak correlation,
 * converts to Hz. The reported pitch is the mean across all frames.
 *
 * Use case: catches "robotic monotone" (low variance) or pitch drift (sudden
 * shifts). Pass band defaults to 80–300 Hz (adult human voice). Tighten for
 * a specific voice profile by passing `minHz` / `maxHz`.
 */
export function scoreAveragePitch(
  wav: WavInfo,
  options: {minHz?: number; maxHz?: number; frameMs?: number; threshold?: number; channel?: number; name?: string} = {},
): DimensionScore {
  const name = options.name ?? 'average_pitch_hz';
  const samples = pickChannel(wav, options.channel);
  if (!samples) {
    return {name, status: 'error', detail: `channel ${options.channel} not available (file has ${wav.channels} channel(s))`};
  }

  const minHz = options.minHz ?? 80;
  const maxHz = options.maxHz ?? 300;
  const threshold = options.threshold ?? 0.02;
  // Decouple the AC search range from the pass band. The detector searches the
  // full plausible human-voice range (50–500 Hz) so a true F0 outside the user's
  // pass band is still discovered; the band check happens post-hoc on the
  // reported pitch. Without this, the searched range was [SR/maxHz, SR/minHz]
  // and the reported pitch was guaranteed in-band — `status: 'failed'` was
  // mathematically unreachable.
  const minLag = Math.max(1, Math.floor(wav.sampleRate / 500));
  const maxLag = Math.floor(wav.sampleRate / 50);
  // Frame must cover ≥ 3 periods of the lowest searched F0 (50 Hz → 60 ms)
  // for the autocorrelation to find a stable peak. Default 75 ms covers 50 Hz
  // with one period of margin. P2 codex review on PR #108: at 25 ms the AC
  // misdetected an 80 Hz tone as the 500 Hz minimum-lag candidate.
  const frameMs = options.frameMs ?? 75;
  const frameSamples = Math.round((frameMs / 1000) * wav.sampleRate);

  const env = rmsEnvelope(samples, wav.sampleRate, 50);
  const segments = detectSpeechSegments(env, {threshold, windowMs: 50});
  if (segments.length === 0) {
    return {name, status: 'error', detail: 'no speech to analyze for pitch'};
  }

  const pitches: number[] = [];
  for (const seg of segments) {
    const midSample = Math.floor(((seg.startMs + seg.endMs) / 2 / 1000) * wav.sampleRate);
    const start = Math.max(0, midSample - Math.floor(frameSamples / 2));
    const end = Math.min(samples.length, start + frameSamples);
    if (end - start <= maxLag) {
      continue;
    }

    // Compute normalized AC across the search range. Normalize by the number
    // of products so low-lag (high-Hz) candidates can't win on iteration count
    // alone — without this, lag=96 (500 Hz) accumulates ~5× more terms than
    // lag=480 (100 Hz) and beats the true peak for low F0 signals.
    const acValues = new Float32Array(maxLag - minLag + 1);
    let maxCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      const last = end - start - lag;
      for (let i = 0; i < last; i++) {
        corr += samples[start + i] * samples[start + i + lag];
      }

      corr /= last;
      acValues[lag - minLag] = corr;
      if (corr > maxCorr) {
        maxCorr = corr;
      }
    }

    // Pick the fundamental: the FIRST local maximum in the AC curve. A clean
    // periodic signal has equal-AC peaks at the fundamental and its harmonics
    // (e.g. 200 Hz sine: AC peaks at lag 240, 480, 720, 960 — picking the
    // largest single value is FP-noise-determined and routinely returns a
    // half- or third-pitch reading). Scanning for the first peak from the
    // low-lag (high-Hz) side reliably lands on the fundamental period for
    // pure tones, mixed-harmonic content, and noisy signals alike. Falls back
    // to the global max-AC lag if no local maximum is found in range (so
    // monotone or near-DC inputs still produce a reading).
    let bestLag = -1;
    for (let lag = minLag + 1; lag <= maxLag - 1; lag++) {
      const idx = lag - minLag;
      if (acValues[idx] > 0 && acValues[idx] > acValues[idx - 1] && acValues[idx] >= acValues[idx + 1]) {
        bestLag = lag;
        break;
      }
    }

    if (bestLag < 0 && maxCorr > 0) {
      for (let lag = minLag; lag <= maxLag; lag++) {
        if (acValues[lag - minLag] === maxCorr) {
          bestLag = lag;
          break;
        }
      }
    }

    if (bestLag > 0) {
      pitches.push(wav.sampleRate / bestLag);
    }
  }

  if (pitches.length === 0) {
    return {name, status: 'error', detail: 'no periodic content in detected speech (silent or noise-dominated)'};
  }

  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const inRange = avgPitch >= minHz && avgPitch <= maxHz;
  return {
    name,
    status: inRange ? 'passed' : 'failed',
    score: inRange ? 1 : 0,
    detail: `${avgPitch.toFixed(1)} Hz average pitch over ${pitches.length} speech frame(s) (expected ${minHz}-${maxHz} Hz)`,
    evidence: {avgPitchHz: avgPitch, pitches, frameCount: pitches.length},
  };
}

/**
 * Speech rate (words per minute) scorer. WPM = words / (speechSeconds / 60).
 * Speech seconds is derived from `detectSpeechSegments` on the given channel
 * — silence between words doesn't dilute the rate. Word count splits on
 * whitespace runs from the supplied transcript.
 *
 * Pass band defaults: 130–180 WPM (natural conversational range). Below 100
 * suggests an over-deliberate / stalling agent; above 220 suggests a rushed
 * TTS or unnatural-fast voice. Customize via `minWpm` / `maxWpm`.
 */
export function scoreSpeechRate(
  wav: WavInfo,
  options: {transcript: string; minWpm?: number; maxWpm?: number; threshold?: number; channel?: number; name?: string},
): DimensionScore {
  const name = options.name ?? 'words_per_minute';
  const samples = pickChannel(wav, options.channel);
  if (!samples) {
    return {name, status: 'error', detail: `channel ${options.channel} not available (file has ${wav.channels} channel(s))`};
  }

  const words = options.transcript.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    return {name, status: 'error', detail: 'transcript has no words'};
  }

  const env = rmsEnvelope(samples, wav.sampleRate, 50);
  const segments = detectSpeechSegments(env, {threshold: options.threshold ?? 0.02, windowMs: 50});
  const speechMs = segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  if (speechMs === 0) {
    return {name, status: 'error', detail: 'no speech detected for the supplied transcript'};
  }

  const wpm = words / (speechMs / 60_000);
  const minWpm = options.minWpm ?? 130;
  const maxWpm = options.maxWpm ?? 180;
  const inRange = wpm >= minWpm && wpm <= maxWpm;
  return {
    name,
    status: inRange ? 'passed' : 'failed',
    score: inRange ? 1 : 0,
    detail: `${wpm.toFixed(1)} WPM (${words} words / ${(speechMs / 1000).toFixed(2)}s speech; expected ${minWpm}-${maxWpm})`,
    evidence: {
      wpm, words, speechMs, expectedRange: [minWpm, maxWpm],
    },
  };
}

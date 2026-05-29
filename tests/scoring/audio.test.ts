import {describe, expect, it} from 'vitest';
import {
  detectBargeIn, detectSpeechSegments, parseWav, rmsEnvelope,
  scoreAiInterruptingUser,
  scoreAveragePitch,
  scoreBargeIn,
  scoreSignalToNoiseRatio,
  scoreSpeechRate,
  scoreVoiceActivity,
} from '../../src/scoring/audio';

/**
 * Synthesize a WAV PCM file (16-bit signed LE) from a Float32 sample stream.
 * Used by the audio tests so we never check binary WAV fixtures into git.
 */
function synthesizeWav(samples: Float32Array, sampleRate: number, channels = 1): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52_49_46_46, false); // 'RIFF'
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57_41_56_45, false); // 'WAVE'

  // fmt chunk
  view.setUint32(12, 0x66_6D_74_20, false); // 'fmt '
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  view.setUint32(36, 0x64_61_74_61, false); // 'data'
  view.setUint32(40, dataSize, true);

  for (const [i, sample] of samples.entries()) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32_767), true);
  }

  return new Uint8Array(buffer);
}

function sine(durationMs: number, sampleRate: number, freqHz: number, amplitude: number): Float32Array {
  const total = Math.floor((sampleRate * durationMs) / 1000);
  const samples = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }

  return samples;
}

function silence(durationMs: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.floor((sampleRate * durationMs) / 1000));
}

function concat(...chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }

  return out;
}

const SR = 48_000; // canonical sample rate per Phase 0 decision

describe('parseWav', () => {
  it('parses a synthesized 48kHz mono 16-bit PCM file', () => {
    const samples = sine(100, SR, 440, 0.5);
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    expect(wav.sampleRate).toBe(SR);
    expect(wav.channels).toBe(1);
    expect(wav.bitsPerSample).toBe(16);
    expect(wav.samples).toHaveLength(samples.length);
    expect(Math.abs(wav.samples[0] - samples[0])).toBeLessThan(1e-4);
    expect(Math.round(wav.durationMs)).toBe(100);
  });

  it('parses stereo and deinterleaves channels', () => {
    const left = sine(50, SR, 440, 0.3);
    const right = sine(50, SR, 880, 0.5);
    const interleaved = new Float32Array(left.length * 2);
    for (const [i, element] of left.entries()) {
      interleaved[i * 2] = element;
      interleaved[i * 2 + 1] = right[i];
    }

    const wav = parseWav(synthesizeWav(interleaved, SR, 2));
    expect(wav.channels).toBe(2);
    expect(wav.channelSamples).toHaveLength(2);
    expect(wav.channelSamples?.[0]).toHaveLength(left.length);
    expect(wav.channelSamples?.[1]).toHaveLength(right.length);
    expect(Math.abs(wav.channelSamples![0][10] - left[10])).toBeLessThan(1e-3);
    expect(Math.abs(wav.channelSamples![1][10] - right[10])).toBeLessThan(1e-3);
  });

  it('rejects non-WAV input', () => {
    expect(() => parseWav(new Uint8Array([1, 2, 3, 4]))).toThrow();
    expect(() => parseWav(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0, 0, 0, 0])))
      .toThrow(/missing wave/i);
  });
});

describe('rmsEnvelope', () => {
  it('returns near-zero RMS for silence', () => {
    const env = rmsEnvelope(silence(200, SR), SR);
    for (const v of env) {
      expect(v).toBeLessThan(0.001);
    }
  });

  it('returns elevated RMS for a sine tone', () => {
    const env = rmsEnvelope(sine(200, SR, 440, 0.5), SR);
    const max = Math.max(...env);
    // RMS of a 0.5-amplitude sine is 0.5 / sqrt(2) ≈ 0.354
    expect(max).toBeGreaterThan(0.3);
    expect(max).toBeLessThan(0.4);
  });

  it('returns one value per windowMs window', () => {
    const env = rmsEnvelope(silence(500, SR), SR, 50);
    expect(env.length).toBe(10); // 500ms / 50ms windows
  });
});

describe('detectSpeechSegments', () => {
  it('finds a single segment in a sine surrounded by silence', () => {
    const samples = concat(silence(300, SR), sine(400, SR, 440, 0.5), silence(300, SR));
    const env = rmsEnvelope(samples, SR, 50);
    const segs = detectSpeechSegments(env, {threshold: 0.05, windowMs: 50, minSpeechMs: 100});
    expect(segs).toHaveLength(1);
    expect(segs[0].startMs).toBeGreaterThanOrEqual(250);
    expect(segs[0].startMs).toBeLessThanOrEqual(350);
    expect(segs[0].endMs - segs[0].startMs).toBeGreaterThan(300);
  });

  it('returns no segments for pure silence', () => {
    const env = rmsEnvelope(silence(1000, SR), SR);
    expect(detectSpeechSegments(env)).toHaveLength(0);
  });

  it('splits into multiple segments when silence > minSilenceMs separates them', () => {
    const samples = concat(
      sine(300, SR, 440, 0.5),
      silence(400, SR), // > minSilenceMs of 200ms
      sine(300, SR, 440, 0.5),
    );
    const env = rmsEnvelope(samples, SR, 50);
    const segs = detectSpeechSegments(env, {
      threshold: 0.05, windowMs: 50, minSpeechMs: 100, minSilenceMs: 200,
    });
    expect(segs).toHaveLength(2);
  });
});

describe('detectBargeIn', () => {
  it('reports no barge-in when streams do not overlap', () => {
    const callerSamples = concat(silence(500, SR), sine(300, SR, 440, 0.5));
    const agentSamples = concat(sine(300, SR, 440, 0.5), silence(500, SR));
    const result = detectBargeIn({
      callerSamples, agentSamples, sampleRate: SR, threshold: 0.05,
    });
    expect(result.detected).toBe(false);
  });

  it('detects barge-in when caller starts while agent is speaking', () => {
    // Agent talks 0-800ms; caller starts at 400ms.
    const agentSamples = concat(sine(800, SR, 440, 0.5), silence(400, SR));
    const callerSamples = concat(silence(400, SR), sine(400, SR, 440, 0.5), silence(400, SR));
    const result = detectBargeIn({
      callerSamples, agentSamples, sampleRate: SR, threshold: 0.05,
    });
    expect(result.detected).toBe(true);
    expect(result.callerStartMs).toBeGreaterThanOrEqual(350);
    expect(result.callerStartMs).toBeLessThanOrEqual(450);
    expect(result.overlapMs).toBeGreaterThan(200);
  });
});

describe('scoreVoiceActivity', () => {
  it('passes when total speech meets minimum', () => {
    const samples = concat(silence(200, SR), sine(600, SR, 440, 0.5), silence(200, SR));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreVoiceActivity(wav, {minSpeechMs: 400, threshold: 0.05});
    expect(dim.status).toBe('passed');
  });

  it('fails when audio is mostly silent', () => {
    const samples = silence(1000, SR);
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreVoiceActivity(wav, {minSpeechMs: 200});
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0);
  });
});

describe('scoreBargeIn', () => {
  it('passes when no barge-in', () => {
    const callerSamples = concat(silence(500, SR), sine(300, SR, 440, 0.5));
    const agentSamples = concat(sine(300, SR, 440, 0.5), silence(500, SR));
    const dim = scoreBargeIn({
      callerSamples, agentSamples, sampleRate: SR, threshold: 0.05,
    });
    expect(dim.status).toBe('passed');
  });

  it('fails when overlap exceeds maxOverlapMs', () => {
    const agentSamples = sine(1000, SR, 440, 0.5);
    const callerSamples = concat(silence(200, SR), sine(700, SR, 440, 0.5));
    const dim = scoreBargeIn({
      callerSamples,
      agentSamples,
      sampleRate: SR,
      threshold: 0.05,
      maxOverlapMs: 100,
    });
    expect(dim.status).toBe('failed');
    expect(dim.detail).toContain('overlap');
  });
});

describe('scoreAiInterruptingUser', () => {
  it('passes when agent waits for caller to finish (no agent-onset overlap)', () => {
    const callerSamples = concat(sine(300, SR, 440, 0.5), silence(500, SR));
    const agentSamples = concat(silence(500, SR), sine(300, SR, 440, 0.5));
    const dim = scoreAiInterruptingUser({
      callerSamples, agentSamples, sampleRate: SR, threshold: 0.05,
    });
    expect(dim.status).toBe('passed');
  });

  it('fails when agent talks over caller (agent onset during caller speech)', () => {
    // Caller speaks 0-1000ms; agent jumps in at 200ms and speaks for 700ms — the
    // bad direction. Same waveform shape that would fire scoreBargeIn with
    // channels reversed.
    const callerSamples = sine(1000, SR, 440, 0.5);
    const agentSamples = concat(silence(200, SR), sine(700, SR, 440, 0.5));
    const dim = scoreAiInterruptingUser({
      callerSamples, agentSamples, sampleRate: SR, threshold: 0.05, maxOverlapMs: 100,
    });
    expect(dim.status).toBe('failed');
    expect(dim.detail).toContain('agent started');
  });
});

describe('scoreSignalToNoiseRatio', () => {
  it('passes for clean speech (high SNR)', () => {
    // Loud sine on top of near-zero silence — SNR should be very high.
    const samples = concat(silence(400, SR), sine(600, SR, 440, 0.7), silence(400, SR));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreSignalToNoiseRatio(wav, {minSnrDb: 10});
    expect(dim.status).toBe('passed');
    expect((dim.evidence as {snrDb: number}).snrDb).toBeGreaterThan(10);
  });

  it('fails when signal is only slightly above the noise floor', () => {
    // Pattern: silence(noisy) | quiet speech | silence(noisy).
    // Speech segments → moderate signal RMS; silence segments → noisy-but-
    // present floor that nibbles the SNR down. Sub-threshold signal yields
    // a low SNR that the scorer should report as failed at the 20 dB bar.
    function quietNoise(durationMs: number, sampleRate: number, amp: number) {
      const total = Math.floor((sampleRate * durationMs) / 1000);
      const out = new Float32Array(total);
      // Deterministic LCG (numerical-recipes-style) for repeatable noise.
      // Bitwise-free so the codebase's no-bitwise lint stays happy.
      let s = 1_234_567;
      for (let i = 0; i < total; i++) {
        s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
        out[i] = amp * ((s / 2_147_483_648) - 0.5);
      }

      return out;
    }

    // Use a sine quiet enough that it barely clears the speech threshold (0.02)
    // and a noise floor that's almost as energetic.
    const silenceyNoise = quietNoise(400, SR, 0.015);
    const sigPlusNoise = new Float32Array(Math.floor((SR * 400) / 1000));
    const tone = sine(400, SR, 440, 0.025);
    for (const [i, v] of tone.entries()) {
      sigPlusNoise[i] = v + 0.015 * Math.sin(2 * Math.PI * 137 * (i / SR));
    }

    const buf = concat(silenceyNoise, sigPlusNoise, silenceyNoise);
    const wav = parseWav(synthesizeWav(buf, SR, 1));
    const dim = scoreSignalToNoiseRatio(wav, {minSnrDb: 20});
    // Either the SNR comes back low (failed) or the speech is too faint to
    // segment at all (error). Both are correct — the scorer must NOT
    // report 'passed'.
    expect(['failed', 'error']).toContain(dim.status);
  });

  it('errors when no speech is detectable', () => {
    const samples = silence(500, SR);
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreSignalToNoiseRatio(wav);
    expect(dim.status).toBe('error');
  });
});

describe('scoreAveragePitch', () => {
  it('detects a 200 Hz pure tone within the expected band', () => {
    const samples = concat(silence(100, SR), sine(400, SR, 200, 0.5), silence(100, SR));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreAveragePitch(wav, {minHz: 150, maxHz: 250});
    expect(dim.status).toBe('passed');
    const evidence = dim.evidence as {avgPitchHz: number};
    expect(Math.abs(evidence.avgPitchHz - 200)).toBeLessThan(15);
  });

  it('fails when detected pitch is outside the configured band', () => {
    const samples = concat(silence(100, SR), sine(400, SR, 200, 0.5), silence(100, SR));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    // Expect 80-100 Hz, but the tone is 200 Hz → fail.
    const dim = scoreAveragePitch(wav, {minHz: 80, maxHz: 100});
    expect(dim.status).toBe('failed');
  });

  it('errors when no speech to analyze', () => {
    const samples = silence(400, SR);
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreAveragePitch(wav);
    expect(dim.status).toBe('error');
  });
});

describe('scoreSpeechRate', () => {
  it('passes for a transcript that lands in the conversational band', () => {
    // 1.5 s of speech total; transcript of 4 words → 4 / (1.5/60) = 160 WPM.
    const samples = concat(silence(200, SR), sine(750, SR, 440, 0.5), silence(200, SR), sine(750, SR, 440, 0.5), silence(200, SR));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreSpeechRate(wav, {transcript: 'hello there friend hi'});
    expect(dim.status).toBe('passed');
    const evidence = dim.evidence as {wpm: number};
    expect(evidence.wpm).toBeGreaterThan(130);
    expect(evidence.wpm).toBeLessThan(180);
  });

  it('fails when WPM is below the floor (too slow)', () => {
    // 2 s speech, 2 words → 60 WPM, well below 130.
    const samples = concat(sine(1000, SR, 440, 0.5), silence(100, SR), sine(1000, SR, 440, 0.5));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreSpeechRate(wav, {transcript: 'um yeah'});
    expect(dim.status).toBe('failed');
    expect((dim.evidence as {wpm: number}).wpm).toBeLessThan(130);
  });

  it('errors on empty transcript', () => {
    const samples = sine(500, SR, 440, 0.5);
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreSpeechRate(wav, {transcript: '   '});
    expect(dim.status).toBe('error');
  });
});

// Regression tests for the three P2 codex review findings on PR #108.
describe('PR #108 codex review regressions', () => {
  it('rejects an out-of-range channel on a mono file (was silently scoring wav.samples)', () => {
    const samples = sine(500, SR, 440, 0.5);
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    // Pre-fix, channel:1 on a mono WAV fell through to wav.samples and scored
    // the (only) mono signal as if it were channel 1 of a stereo file. Now it
    // errors with a clear "not available" message.
    const dim = scoreSignalToNoiseRatio(wav, {channel: 1});
    expect(dim.status).toBe('error');
    expect(dim.detail).toContain('not available');
    expect(dim.detail).toContain('1 channel');
  });

  it('accepts channel:0 on a mono file (the mono signal IS channel 0)', () => {
    // Side-condition of the channel fix: explicit channel:0 on mono should
    // succeed against wav.samples (it would be needlessly hostile to error).
    const samples = concat(silence(100, SR), sine(400, SR, 440, 0.5), silence(100, SR));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreSignalToNoiseRatio(wav, {channel: 0, minSnrDb: 10});
    expect(dim.status).toBe('passed');
  });

  it('detects an 80 Hz tone (was falsely scored as the 500 Hz minimum-lag candidate)', () => {
    // Pre-fix, unnormalized AC + a 25 ms frame made low-Hz tones get scored
    // as the 500 Hz minimum-lag candidate. After normalization + frame ≥ 75 ms
    // + local-max peak picking, an 80 Hz tone reports ~80 Hz. Pass band is
    // widened to 75-300 to accommodate lag-quantization at SR=48k (lag=603
    // = 79.6 Hz is the closest discrete lag to 80 Hz, just below the default
    // 80 Hz floor); what's being tested is the detected frequency, not the
    // floor.
    const samples = concat(silence(100, SR), sine(400, SR, 80, 0.5), silence(100, SR));
    const wav = parseWav(synthesizeWav(samples, SR, 1));
    const dim = scoreAveragePitch(wav, {minHz: 75, maxHz: 300});
    expect(dim.status).toBe('passed');
    const evidence = dim.evidence as {avgPitchHz: number};
    // Pre-fix this would have reported ~500 Hz. Now it lands within 5 Hz of
    // the true 80 Hz fundamental.
    expect(Math.abs(evidence.avgPitchHz - 80)).toBeLessThan(5);
  });

  it('counts the full last speech window in speech duration (WPM no longer inflated)', () => {
    // detectSpeechSegments used to record segEnd as the START of the last
    // speech window, dropping windowMs (50 ms by default) per segment. WPM
    // = words / speechMs, so a too-short denominator inflated WPM and could
    // pass borderline cases. Build a 1000 ms tone + silence and confirm the
    // segment end is at 1000 ms (not 950 ms).
    const samples = concat(sine(1000, SR, 440, 0.5), silence(300, SR));
    const env = rmsEnvelope(samples, SR, 50);
    const segs = detectSpeechSegments(env, {threshold: 0.05});
    expect(segs).toHaveLength(1);
    // Allow ±1 window of float-rounding slack but verify it's NOT the old
    // 950 ms regression.
    expect(segs[0].endMs).toBeGreaterThanOrEqual(950);
    expect(segs[0].endMs).toBeLessThanOrEqual(1050);
    expect(segs[0].endMs - segs[0].startMs).toBeGreaterThanOrEqual(1000);
  });
});

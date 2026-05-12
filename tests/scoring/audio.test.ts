import {describe, expect, it} from 'vitest';
import {
  detectBargeIn, detectSpeechSegments, parseWav, rmsEnvelope,
  scoreBargeIn, scoreVoiceActivity,
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

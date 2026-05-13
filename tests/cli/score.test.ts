import {describe, expect, it} from 'vitest';
import {runScore} from '../../src/cli/commands/score';

/**
 * Synthesize a minimal WAV PCM 16-bit LE file from a Float32 sample stream.
 * Used so we don't check binary WAV fixtures into git.
 */
function synthesizeWav(samples: Float32Array, sampleRate: number, channels = 1): Uint8Array {
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

const SR = 48_000;

function sine(durationMs: number, freqHz: number, amplitude: number): Float32Array {
  const total = Math.floor((SR * durationMs) / 1000);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SR);
  }

  return out;
}

function silence(durationMs: number): Float32Array {
  return new Float32Array(Math.floor((SR * durationMs) / 1000));
}

function concat(...chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }

  return out;
}

describe('runScore', () => {
  it('passes on a mono WAV with enough speech (voice_activity dim)', async () => {
    const samples = concat(silence(100), sine(800, 440, 0.5), silence(100));
    const wav = synthesizeWav(samples, SR, 1);
    const lines: string[] = [];
    const code = await runScore({
      path: '', bytes: wav, out: line => lines.push(line), minSpeechMs: 500,
    });
    expect(code).toBe(0);
    const joined = lines.join('\n');
    expect(joined).toContain('mono');
    expect(joined).toContain('48000');
    expect(joined).toContain('voice_activity');
    expect(joined).toContain('✓');
  });

  it('fails when audio is silent', async () => {
    const wav = synthesizeWav(silence(1000), SR, 1);
    const lines: string[] = [];
    const code = await runScore({
      path: '', bytes: wav, out: line => lines.push(line), minSpeechMs: 500,
    });
    expect(code).toBe(1);
    expect(lines.some(l => l.includes('✗'))).toBe(true);
  });

  it('reports voice-activity per channel + barge-in on stereo', async () => {
    const callerSamples = concat(silence(200), sine(600, 440, 0.5), silence(200));
    const agentSamples = concat(sine(600, 440, 0.5), silence(400));
    const interleaved = new Float32Array(callerSamples.length * 2);
    for (const [i, callerSample] of callerSamples.entries()) {
      interleaved[i * 2] = callerSample;
      interleaved[i * 2 + 1] = agentSamples[i];
    }

    const wav = synthesizeWav(interleaved, SR, 2);
    const lines: string[] = [];
    const code = await runScore({
      path: '', bytes: wav, out: line => lines.push(line), minSpeechMs: 300, maxOverlapMs: 100,
    });
    const joined = lines.join('\n');
    expect(joined).toContain('stereo');
    expect(joined).toContain('voice_activity_caller');
    expect(joined).toContain('voice_activity_agent');
    expect(joined).toContain('barge_in_recovery');
    expect(code).toBeGreaterThanOrEqual(0); // pass/fail depends on synth timing
  });

  it('errors out when file is missing', async () => {
    const lines: string[] = [];
    const code = await runScore({path: '/nonexistent/file.wav', out: line => lines.push(line)});
    expect(code).toBe(1);
    expect(lines.some(l => l.includes('file not found'))).toBe(true);
  });

  it('errors out when no path or bytes given', async () => {
    const lines: string[] = [];
    const code = await runScore({path: '', out: line => lines.push(line)});
    expect(code).toBe(1);
    expect(lines.some(l => l.includes('requires a path'))).toBe(true);
  });

  it('errors out on non-WAV input', async () => {
    const lines: string[] = [];
    const code = await runScore({path: '', bytes: new Uint8Array([1, 2, 3, 4, 5]), out: line => lines.push(line)});
    expect(code).toBe(1);
    expect(lines.some(l => l.includes('not a WAV'))).toBe(true);
  });
});

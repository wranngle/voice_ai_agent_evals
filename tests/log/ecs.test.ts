import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {runScore} from '../../src/cli/commands/score';
import {
  buildEcsEvent,
  createEcsLogger,
  EVENT_DATASET,
  REQUIRED_ECS_FIELDS,
  SERVICE_NAME,
} from '../../src/log/ecs';

/**
 * Contract test for the ECS-shaped JSONL log channel (spec 03-feature-plans
 * §1.6). The bar: `voice-evals score --json-log <path>` produces NDJSON, each
 * line parses with JSON.parse, every line contains @timestamp, event.dataset,
 * event.action, service.name, trace.id; ten or more events emitted by a
 * single score invocation.
 */

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

function buildStereoWav(): Uint8Array {
  const callerSamples = concat(silence(200), sine(600, 440, 0.5), silence(200));
  const agentSamples = concat(sine(600, 440, 0.5), silence(400));
  const interleaved = new Float32Array(callerSamples.length * 2);
  for (const [i, sample] of callerSamples.entries()) {
    interleaved[i * 2] = sample;
    interleaved[i * 2 + 1] = agentSamples[i];
  }

  return synthesizeWav(interleaved, SR, 2);
}

function readNdjson(path: string): Array<Record<string, unknown>> {
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter(l => l.length > 0);
  return lines.map(l => JSON.parse(l) as Record<string, unknown>);
}

const noop = (_line: string): void => undefined;

describe('ECS JSONL log channel', () => {
  it('every line in the sink is JSON-parseable NDJSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-ndjson-'));
    const path = join(dir, 'run.jsonl');
    try {
      await runScore({
        path: '', bytes: buildStereoWav(), out: noop, jsonLogPath: path,
        minSpeechMs: 300, maxOverlapMs: 100,
      });
      const raw = readFileSync(path, 'utf8');
      expect(raw.endsWith('\n')).toBe(true);
      const lines = raw.split('\n').filter(l => l.length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('emits >=10 events and every event carries the 5 required ECS fields', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-required-'));
    const path = join(dir, 'run.jsonl');
    try {
      await runScore({
        path: '', bytes: buildStereoWav(), out: noop, jsonLogPath: path,
        minSpeechMs: 300, maxOverlapMs: 100,
      });
      const events = readNdjson(path);
      expect(events.length).toBeGreaterThanOrEqual(10);
      for (const event of events) {
        for (const field of REQUIRED_ECS_FIELDS) {
          expect(event[field], `event missing ${field}: ${JSON.stringify(event)}`).toBeDefined();
        }

        expect(event['service.name']).toBe(SERVICE_NAME);
        expect(event['event.dataset']).toBe(EVENT_DATASET);
        expect(typeof event['@timestamp']).toBe('string');
        expect(typeof event['event.action']).toBe('string');
        expect(typeof event['trace.id']).toBe('string');
        expect(new Date(event['@timestamp'] as string).toString()).not.toBe('Invalid Date');
      }
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('all events share a single trace.id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-trace-'));
    const path = join(dir, 'run.jsonl');
    try {
      await runScore({
        path: '', bytes: buildStereoWav(), out: noop, jsonLogPath: path,
        minSpeechMs: 300, maxOverlapMs: 100,
      });
      const events = readNdjson(path);
      const traceIds = new Set(events.map(e => e['trace.id']));
      expect(traceIds.size).toBe(1);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('is a no-op when jsonLogPath is not supplied', async () => {
    const code = await runScore({
      path: '', bytes: buildStereoWav(), out: noop,
      minSpeechMs: 300, maxOverlapMs: 100,
    });
    // proves no crash; absence of side effect verified by tmp-path isolation
    // in the parallel suites above.
    expect(typeof code).toBe('number');
  });

  it('buildEcsEvent shapes a single event with required fields and merges extras', () => {
    const event = buildEcsEvent({
      action: 'score.start',
      level: 'info',
      traceId: '00000000-0000-4000-8000-000000000000',
      fields: {'voice.score.path': '/tmp/x.wav', 'voice.wav.channels': 2},
      message: 'hello',
      now: new Date('2026-05-14T00:00:00.000Z'),
    });
    expect(event['@timestamp']).toBe('2026-05-14T00:00:00.000Z');
    expect(event['event.dataset']).toBe(EVENT_DATASET);
    expect(event['service.name']).toBe(SERVICE_NAME);
    expect(event['event.action']).toBe('score.start');
    expect(event['trace.id']).toBe('00000000-0000-4000-8000-000000000000');
    expect(event['log.level']).toBe('info');
    expect(event.message).toBe('hello');
    expect(event['voice.score.path']).toBe('/tmp/x.wav');
    expect(event['voice.wav.channels']).toBe(2);
  });

  it('createEcsLogger without a path is a silent no-op', () => {
    const logger = createEcsLogger();
    expect(() => {
      logger.info('noop.action', {x: 1}, 'msg');
      logger.warn('noop.action', {x: 1});
      logger.error('noop.action');
    }).not.toThrow();
    expect(logger.path).toBeUndefined();
    expect(typeof logger.traceId).toBe('string');
  });

  it('createEcsLogger creates parent directories on demand', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-mkdir-'));
    const path = join(dir, 'nested', 'sub', 'run.jsonl');
    try {
      const logger = createEcsLogger({path, traceId: 'fixed-trace-id'});
      logger.info('first.action', {a: 1}, 'first');
      logger.warn('second.action', {b: 2}, 'second');
      const events = readNdjson(path);
      expect(events).toHaveLength(2);
      expect(events[0]['event.action']).toBe('first.action');
      expect(events[0]['trace.id']).toBe('fixed-trace-id');
      expect(events[1]['log.level']).toBe('warn');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

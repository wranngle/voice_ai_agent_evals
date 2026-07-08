/**
 * Contract test for traced() — the CLI lifecycle wrapper in
 * src/internal/jsonl-trace.ts.
 *
 * The run_id contract (jsonl-trace.ts header): run_id "groups events from one
 * invocation". Module-level tracers bake ONE runId at import time, so the
 * wrapper must mint a fresh run_id per call — otherwise every call of the
 * same command in one process (library consumers, this test suite) collapses
 * into a single "invocation" in the log.
 */

import {
  mkdtempSync, readdirSync, readFileSync, rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';
import {createTracer, traced} from '../../src/internal/jsonl-trace';

let workDir: string;
let previousCwd: string;

beforeEach(() => {
  previousCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'voice-evals-traced-'));
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(previousCwd);
  rmSync(workDir, {recursive: true, force: true});
});

function readEvents(): Array<{run_id: string; msg: string; channel: string; fields?: Record<string, unknown>; level: string}> {
  const logDir = join(workDir, 'logs');
  const events: Array<{run_id: string; msg: string; channel: string; fields?: Record<string, unknown>; level: string}> = [];
  for (const file of readdirSync(logDir)) {
    for (const line of readFileSync(join(logDir, file), 'utf8').split('\n')) {
      if (line.trim()) {
        events.push(JSON.parse(line) as typeof events[number]);
      }
    }
  }

  return events;
}

describe('traced() run_id contract', () => {
  it('mints a distinct run_id per invocation, even from one module-level tracer', async () => {
    const trace = createTracer('test.channel');
    await traced(trace, undefined, () => 0);
    await traced(trace, undefined, () => 0);
    await traced(trace, undefined, () => 0);
    const starts = readEvents().filter(e => e.msg === 'start');
    expect(starts.length).toBe(3);
    expect(new Set(starts.map(e => e.run_id)).size).toBe(3);
  });

  it('pairs start and end under the same run_id with the exit code', async () => {
    const trace = createTracer('test.pairing');
    await traced(trace, {probe: true}, () => 7);
    const events = readEvents().filter(e => e.channel === 'test.pairing');
    const start = events.find(e => e.msg === 'start');
    const end = events.find(e => e.msg === 'end');
    expect(start?.run_id).toBe(end?.run_id);
    expect(end?.fields).toStrictEqual({exit_code: 7});
  });

  it('a throw emits a fail event under the same run_id and rethrows', async () => {
    const trace = createTracer('test.failing');
    await expect(traced(trace, undefined, () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const events = readEvents().filter(e => e.channel === 'test.failing');
    const start = events.find(e => e.msg === 'start');
    const fail = events.find(e => e.msg === 'fail');
    expect(fail?.run_id).toBe(start?.run_id);
    expect(fail?.level).toBe('error');
    expect(fail?.fields).toStrictEqual({error: 'boom'});
  });
});

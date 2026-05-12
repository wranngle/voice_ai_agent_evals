import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  baselineExists, captureBaseline, loadBaseline, saveBaseline,
} from '../../src/regression/baseline';
import type {BaselineRun} from '../../src/regression/types';

const FIXED_NOW = '2026-05-11T20:00:00.000Z';

function makeRun(test_id: string, score: number, status: 'passed' | 'failed' = 'passed'): BaselineRun {
  return {
    test_id,
    outcome: {
      status,
      dimensions: [{name: 'main', status, score}],
      score,
      errors: [],
    },
  };
}

describe('captureBaseline', () => {
  it('produces a snapshot keyed by test_id with the injected clock', () => {
    const snapshot = captureBaseline(
      [makeRun('TC-1', 0.9), makeRun('TC-2', 0.7)],
      {name: 'main-2026-05-11', now: () => FIXED_NOW, ref: 'abc1234'},
    );
    expect(snapshot.name).toBe('main-2026-05-11');
    expect(snapshot.capturedAt).toBe(FIXED_NOW);
    expect(snapshot.ref).toBe('abc1234');
    expect(Object.keys(snapshot.runs)).toEqual(['TC-1', 'TC-2']);
    expect(snapshot.runs['TC-1'].outcome.score).toBe(0.9);
  });

  it('the last duplicate test_id wins (caller-side dedup)', () => {
    const snapshot = captureBaseline(
      [makeRun('TC-1', 0.5), makeRun('TC-1', 0.9)],
      {name: 'dup', now: () => FIXED_NOW},
    );
    expect(snapshot.runs['TC-1'].outcome.score).toBe(0.9);
  });
});

describe('saveBaseline / loadBaseline / baselineExists', () => {
  it('roundtrips through the filesystem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-baseline-'));
    try {
      const snapshot = captureBaseline(
        [makeRun('TC-1', 0.85)],
        {name: 'roundtrip-test', now: () => FIXED_NOW},
      );
      const written = saveBaseline(snapshot, dir);
      expect(written).toContain('roundtrip-test.json');
      expect(baselineExists('roundtrip-test', dir)).toBe(true);

      const reloaded = loadBaseline('roundtrip-test', dir);
      expect(reloaded.name).toBe('roundtrip-test');
      expect(reloaded.runs['TC-1'].outcome.score).toBe(0.85);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('loadBaseline throws on missing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-baseline-'));
    try {
      expect(() => loadBaseline('nope', dir)).toThrow(/not found/i);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('sanitizes the on-disk filename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-baseline-'));
    try {
      const snap = captureBaseline([], {name: '../wat/etc/passwd', now: () => FIXED_NOW});
      const path = saveBaseline(snap, dir);
      expect(path).not.toContain('..');
      expect(path).toContain('wat-etc-passwd');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

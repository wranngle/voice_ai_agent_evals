import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  getUnresolvedFrictions, logFriction, readFrictionLog, resolveFriction,
} from '../../src/remediation/friction-log';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'voice-evals-friction-'));
}

const FIXED = '2026-05-12T10:00:00.000Z';
const now = () => FIXED;

describe('logFriction + readFrictionLog', () => {
  it('appends events to JSONL and reads them back in order', () => {
    const dir = makeTempDir();
    const path = join(dir, 'friction.jsonl');
    try {
      logFriction({type: 'PATTERN_DETECTED', pattern: 'SMS_AFTER_DECLINE', success: false}, {path, now});
      logFriction({type: 'REMEDIATION_APPLIED', pattern: 'SMS_AFTER_DECLINE', success: true}, {path, now});
      logFriction({type: 'VERIFICATION_FAILED', pattern: 'TOOL_NOT_CALLED', success: false}, {path, now});

      const events = readFrictionLog(path);
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('PATTERN_DETECTED');
      expect(events[1].type).toBe('REMEDIATION_APPLIED');
      expect(events[2].type).toBe('VERIFICATION_FAILED');
      expect(events.every(e => e.timestamp === FIXED)).toBe(true);
      expect(events.every(e => !e.resolved)).toBe(true);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('readFrictionLog returns [] when file does not exist', () => {
    expect(readFrictionLog('/nonexistent/path.jsonl')).toEqual([]);
  });

  it('tolerates a malformed line in the middle (forward-compatible)', async () => {
    const dir = makeTempDir();
    const path = join(dir, 'corrupt.jsonl');
    try {
      logFriction({type: 'A', success: true}, {path, now});
      // Simulate a partial write via raw append
      const {appendFileSync} = await import('node:fs');
      appendFileSync(path, '{this is not json\n', 'utf8');
      logFriction({type: 'B', success: true}, {path, now});
      const events = readFrictionLog(path);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('A');
      expect(events[1].type).toBe('B');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('getUnresolvedFrictions', () => {
  it('filters out resolved events', () => {
    const dir = makeTempDir();
    const path = join(dir, 'mix.jsonl');
    try {
      logFriction({type: 'A', success: true}, {path, now});
      logFriction({type: 'B', success: false}, {path, now});
      resolveFriction({type: 'A'}, {path, now: () => '2026-05-12T11:00:00.000Z'});
      const unresolved = getUnresolvedFrictions(path);
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].type).toBe('B');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('resolveFriction', () => {
  it('marks matching events as resolved and persists', () => {
    const dir = makeTempDir();
    const path = join(dir, 'resolve.jsonl');
    try {
      logFriction({type: 'A', pattern: 'SMS_AFTER_DECLINE', success: false}, {path, now});
      logFriction({type: 'A', pattern: 'TOOL_NOT_CALLED', success: false}, {path, now});
      const updated = resolveFriction(
        {pattern: 'SMS_AFTER_DECLINE'},
        {path, now: () => '2026-05-12T12:00:00.000Z'},
      );
      expect(updated).toBe(1);
      const events = readFrictionLog(path);
      const sms = events.find(e => e.pattern === 'SMS_AFTER_DECLINE');
      const tnc = events.find(e => e.pattern === 'TOOL_NOT_CALLED');
      expect(sms?.resolved).toBe(true);
      expect(sms?.resolvedAt).toBe('2026-05-12T12:00:00.000Z');
      expect(tnc?.resolved).toBe(false);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('returns 0 and is a no-op when no match', () => {
    const dir = makeTempDir();
    const path = join(dir, 'nomatch.jsonl');
    try {
      logFriction({type: 'A', success: true}, {path, now});
      const updated = resolveFriction({pattern: 'NEVER_LOGGED'}, {path, now});
      expect(updated).toBe(0);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('does not double-resolve already-resolved events', () => {
    const dir = makeTempDir();
    const path = join(dir, 'dup.jsonl');
    try {
      logFriction({type: 'A', pattern: 'P', success: true}, {path, now});
      resolveFriction({type: 'A'}, {path, now});
      const updated = resolveFriction({type: 'A'}, {path, now});
      expect(updated).toBe(0);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

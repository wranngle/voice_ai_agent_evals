/**
 * Meta-audit — addresses S7 (friction log doesn't scale).
 *
 * resolveFriction reads the entire log, transforms in memory, and writes the
 * entire file back. At 10k events this is fine. At 10M events (a year of
 * production), it's a problem.
 *
 * This test does NOT prove the bug at production scale — that requires a
 * 1 GB synthetic log and ~1 minute. Instead, we:
 *   1. Write 10 000 events.
 *   2. Resolve one matching event.
 *   3. Measure elapsed time.
 *   4. Assert it completes within an envelope (be lenient — this is CI).
 *
 * The test PASSES. The point is the numbers it prints, not the assertion.
 * A future implementation using append-only tombstones should beat this by
 * 100x at the same scale.
 */

import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {logFriction, resolveFriction} from '../../src/remediation/friction-log';

describe('META-AUDIT: friction-log scale envelope', () => {
  it('resolves a matching event in a 10k-event log within 5 s on CI hardware', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-friction-scale-'));
    const path = join(dir, 'friction.jsonl');
    try {
      const writeStart = Date.now();
      for (let i = 0; i < 10_000; i++) {
        logFriction({
          type: 'PATTERN_DETECTED',
          pattern: i === 5000 ? 'TARGET' : 'SMS_AFTER_DECLINE',
          agentId: `agent_${i}`,
          success: false,
        }, {path, now: () => new Date(2026, 0, 1, 0, 0, i).toISOString()});
      }

      const writeMs = Date.now() - writeStart;

      const resolveStart = Date.now();
      const count = resolveFriction({pattern: 'TARGET'}, {path});
      const resolveMs = Date.now() - resolveStart;

      // Numbers vary by hardware; print to stdout for visibility.

      console.log(`  meta-audit: 10k writes ${writeMs}ms, 1 resolve ${resolveMs}ms`);
      expect(count).toBe(1);
      expect(resolveMs).toBeLessThan(5000); // generous envelope for CI
      // Document the cost: every resolve is O(N) IO. At 1M events, this same
      // operation would take ~100x as long. Append-only tombstones would fix it.
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it.todo('append-only tombstone variant: resolve in O(1) IO at any log size');
});

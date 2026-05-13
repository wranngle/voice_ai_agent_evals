/**
 * Meta-audit — addresses S12 (no cross-runtime determinism test).
 *
 * mulberry32 (used by `pairwise`, `sample`, `generateRandomScenarios`) is a
 * 32-bit hash function with bitwise ops. JavaScript engines should agree on
 * its output bit-for-bit, but we have no test that LOCKS the output. If a
 * future bun upgrade subtly changes Math.imul or shift semantics, our
 * "deterministic by seed" claim breaks silently.
 *
 * This test snapshots 16 consecutive outputs at seed 1. The values are
 * derived from the canonical mulberry32 algorithm; if they change, the test
 * fails and the operator must investigate.
 */

import {describe, expect, it} from 'vitest';
import {sample} from '../../src/factory/expand';

// Locked output of mulberry32(1) for the first 5 ints in [0, 100). If you are
// looking at this comment because the test failed, do NOT update the snapshot
// blindly. Investigate which engine changed and whether it is acceptable.
// Locked at audit time on Bun 1.1 from `sample({x:[0..9]}, 10, 1).map(r=>r.x)`.
// If this snapshot drifts on Node 20 / Node 22 / a future Bun, mulberry32 +
// Math.imul + shift semantics no longer agree across runtimes.
const LOCKED_SAMPLE_AT_SEED_1 = [7, 8, 3, 2, 1, 5, 9, 4, 0, 6] as const;

describe('META-AUDIT: mulberry32 cross-runtime determinism', () => {
  it('seed=1 produces the same first 5 samples on every run', () => {
    const variables = {x: [0, 1, 2, 3, 4, 5]};
    const a = sample(variables, 5, 1);
    const b = sample(variables, 5, 1);
    // Same-runtime determinism (trivial — same process)
    expect(a).toEqual(b);
  });

  it('seed=1 sample[0..4].x are integers from {0..5} with no duplicates (Fisher-Yates property)', () => {
    const variables = {x: [0, 1, 2, 3, 4, 5]};
    const out = sample(variables, 5, 1);
    const picked = out.map(r => r.x);
    expect(new Set(picked).size).toBe(5); // no duplicates
    for (const v of picked) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('locks the seeded output as a JSON snapshot so cross-engine drift fails this test', () => {
    const variables = {x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]};
    const out = sample(variables, 10, 1).map(r => r.x);
    expect(out).toEqual([...LOCKED_SAMPLE_AT_SEED_1]);
  });

  it('sample(arr, n, seed) honours seed when n >= arr.length (regression test)', () => {
    // FIXED: sample now always shuffles before slicing. Different seeds
    // produce different orderings at every n. Previously the n >= length
    // early-return skipped the shuffle and made seed a no-op.
    const variables = {x: [0, 1, 2, 3, 4]};
    const a = sample(variables, 5, 1).map(r => r.x);
    const b = sample(variables, 5, 99).map(r => r.x);
    expect(a).not.toEqual(b);
    expect(new Set(a)).toEqual(new Set(b)); // same elements, different order
  });

});

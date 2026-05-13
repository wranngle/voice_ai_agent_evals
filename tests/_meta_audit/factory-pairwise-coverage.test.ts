/**
 * Meta-audit — addresses S4 (no load/scale test) + S6 (magic numbers).
 *
 * `pairwise` claims to implement IPO-style 2-way coverage. The test file
 * tests/factory/expand.test.ts asserts "every pair appears at least once"
 * for tiny inputs. This file:
 *   1. Computes the ACTUAL pair-coverage RATE on a non-trivial input (4×4×4).
 *   2. Asserts the output size is within 2x of the theoretical IPO optimum.
 *   3. Stresses with a realistic factory input (10 dims × 5 values each) and
 *      asserts it completes in under 1 s.
 *
 * The TODO test calls out that production users will want >2-way coverage
 * (3-way, 4-way) — and we don't support it.
 */

import {describe, expect, it} from 'vitest';
import {pairwise} from '../../src/factory/expand';

describe('META-AUDIT: pairwise 2-way coverage rate', () => {
  it('covers 100% of pairs on a 4x4x4 input (the optimum)', () => {
    const variables = {a: ['a1', 'a2', 'a3', 'a4'], b: ['b1', 'b2', 'b3', 'b4'], c: ['c1', 'c2', 'c3', 'c4']};
    const out = pairwise(variables, {seed: 1});

    // Compute the set of (key_i=v, key_j=w) pairs that should appear.
    const keys = Object.keys(variables);
    const expectedPairs = new Set<string>();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        for (const v1 of variables[keys[i] as keyof typeof variables]) {
          for (const v2 of variables[keys[j] as keyof typeof variables]) {
            expectedPairs.add(`${keys[i]}=${v1}|${keys[j]}=${v2}`);
          }
        }
      }
    }

    // Compute the set actually realized by the pairwise output.
    const realized = new Set<string>();
    for (const row of out) {
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          realized.add(`${keys[i]}=${row[keys[i] as keyof typeof variables]}|${keys[j]}=${row[keys[j] as keyof typeof variables]}`);
        }
      }
    }

    const coverage = realized.size / expectedPairs.size;
    expect(coverage).toBe(1); // must hit every pair
  });

  it('output size is within 2x the theoretical IPO optimum on 4x4x4', () => {
    const variables = {a: ['a1', 'a2', 'a3', 'a4'], b: ['b1', 'b2', 'b3', 'b4'], c: ['c1', 'c2', 'c3', 'c4']};
    const out = pairwise(variables, {seed: 1});
    // Theoretical IPO minimum for 4×4×4 ≈ 16 (the largest single-pair domain).
    // Cartesian = 64. We aim for the implementation to land near IPO, not near Cartesian.
    expect(out.length).toBeLessThanOrEqual(32);
    expect(out.length).toBeGreaterThanOrEqual(16);
  });

  it('runs under 1 second on a realistic 10 dim x 5 val input', () => {
    const variables: Record<string, string[]> = {};
    for (let i = 0; i < 10; i++) {
      variables[`dim${i}`] = ['v1', 'v2', 'v3', 'v4', 'v5'];
    }

    const start = Date.now();
    const out = pairwise(variables, {seed: 1});
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    // For 10 dims × 5 vals, IPO target is ~25-30. Cartesian would be 9.7M.
    expect(out.length).toBeLessThan(100);
  });

  it.todo('supports 3-way coverage (currently 2-way only) — production users will ask');
});

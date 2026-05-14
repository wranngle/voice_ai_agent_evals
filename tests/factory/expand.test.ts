import {describe, expect, it} from 'vitest';
import {
  cartesian, expand, pairwise, sample,
} from '../../src/factory/expand';

describe('cartesian', () => {
  it('returns empty for zero arrays', () => {
    expect(cartesian()).toEqual([]);
  });

  it('returns each value singleton for one array', () => {
    expect(cartesian([1, 2, 3])).toEqual([[1], [2], [3]]);
  });

  it('produces N1 × N2 combinations for two arrays', () => {
    expect(cartesian<number | string>([1, 2], ['a', 'b'])).toEqual([
      [1, 'a'], [1, 'b'], [2, 'a'], [2, 'b'],
    ]);
  });

  it('total count = product of array sizes', () => {
    const result = cartesian<number | string | boolean | undefined>([1, 2, 3], ['a', 'b'], [true, false, undefined]);
    expect(result).toHaveLength(3 * 2 * 3);
  });
});

describe('pairwise', () => {
  it('returns [] for empty input', () => {
    expect(pairwise({})).toEqual([]);
  });

  it('returns one row per value when only one variable', () => {
    const result = pairwise({x: ['a', 'b', 'c']});
    expect(result).toEqual([{x: 'a'}, {x: 'b'}, {x: 'c'}]);
  });

  it('covers every (k1=v1, k2=v2) pair at least once for 3 variables × 3 values', () => {
    const variables = {
      a: ['a1', 'a2', 'a3'],
      b: ['b1', 'b2', 'b3'],
      c: ['c1', 'c2', 'c3'],
    };
    const result = pairwise(variables, {seed: 42});

    // Build the universe of pairs that should be covered.
    const required = new Set<string>();
    const keys = Object.keys(variables);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        for (const va of variables[keys[i] as keyof typeof variables]) {
          for (const vb of variables[keys[j] as keyof typeof variables]) {
            required.add(`${keys[i]}=${va}|${keys[j]}=${vb}`);
          }
        }
      }
    }

    // Check coverage.
    for (const test of result) {
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          required.delete(`${keys[i]}=${test[keys[i] as keyof typeof variables]}|${keys[j]}=${test[keys[j] as keyof typeof variables]}`);
        }
      }
    }

    expect(required.size).toBe(0);
  });

  it('is far smaller than cartesian for 5 variables × 4 values', () => {
    const variables = {
      a: ['a1', 'a2', 'a3', 'a4'],
      b: ['b1', 'b2', 'b3', 'b4'],
      c: ['c1', 'c2', 'c3', 'c4'],
      d: ['d1', 'd2', 'd3', 'd4'],
      e: ['e1', 'e2', 'e3', 'e4'],
    };
    const cartesianSize = 4 ** 5; // 1024
    const result = pairwise(variables, {seed: 7});
    expect(result.length).toBeLessThan(cartesianSize / 10); // expect dramatic shrink
    expect(result.length).toBeGreaterThanOrEqual(16); // each (k,v) appears -> at least 16 pairs
  });

  it('same seed -> deterministic output', () => {
    const variables = {a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1', 'c2']};
    const r1 = pairwise(variables, {seed: 99});
    const r2 = pairwise(variables, {seed: 99});
    expect(r1).toEqual(r2);
  });
});

describe('sample', () => {
  it('returns all combinations when n >= cartesian size', () => {
    const variables = {a: ['a1', 'a2'], b: ['b1']};
    const result = sample(variables, 100, 1);
    expect(result).toHaveLength(2);
  });

  it('returns exactly n elements when n < cartesian size', () => {
    const variables = {a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1', 'c2']};
    expect(sample(variables, 5, 42)).toHaveLength(5);
  });

  it('same seed -> deterministic order', () => {
    const variables = {a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1', 'c2']};
    const r1 = sample(variables, 5, 42);
    const r2 = sample(variables, 5, 42);
    expect(r1).toEqual(r2);
  });

  it('different seeds -> different orders (almost always)', () => {
    const variables = {a: ['a1', 'a2', 'a3', 'a4'], b: ['b1', 'b2', 'b3', 'b4']};
    const r1 = JSON.stringify(sample(variables, 10, 1));
    const r2 = JSON.stringify(sample(variables, 10, 9999));
    expect(r1).not.toBe(r2);
  });
});

describe('expand (driver)', () => {
  it('routes cartesian strategy correctly', () => {
    const result = expand({a: ['a1', 'a2'], b: ['b1', 'b2']}, 'cartesian');
    expect(result).toHaveLength(4);
  });

  it('routes pairwise strategy correctly', () => {
    const result = expand(
      {a: ['a1', 'a2', 'a3'], b: ['b1', 'b2', 'b3'], c: ['c1', 'c2', 'c3']},
      'pairwise',
      {seed: 1},
    );
    expect(result.length).toBeLessThan(27);
    expect(result.length).toBeGreaterThan(0);
  });

  it('routes sample strategy with seeded RNG', () => {
    const result = expand(
      {a: ['a1', 'a2', 'a3'], b: ['b1', 'b2']},
      'sample',
      {sampleCount: 3, seed: 5},
    );
    expect(result).toHaveLength(3);
  });
});

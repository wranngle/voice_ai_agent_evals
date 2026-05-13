/**
 * @wranngle/voice-evals/factory/expand — combinatorial expansion strategies.
 *
 *   cartesian:  all combinations of variable arrays (N1 × N2 × ... × Nk tests)
 *   pairwise:   greedy approximation of IPO algorithm — covers every (key, value) PAIR
 *               at least once with far fewer tests than cartesian
 *   sample:     seeded random subset of the cartesian product
 *
 * All functions are pure (modulo the seeded RNG state). Pairwise uses a
 * candidate-sampling greedy heuristic that produces near-optimal pairwise
 * coverage in O(N · attempts) where N is the test count and attempts is
 * the candidate-pool size per iteration.
 */

import type {ExpansionStrategy} from './types';

/**
 * Cartesian product over N arrays. Returns every combination.
 * For inputs [[a,b], [1,2]] returns [[a,1], [a,2], [b,1], [b,2]].
 */
export function cartesian<T>(...arrays: T[][]): T[][] {
  if (arrays.length === 0) {
    return [];
  }

  let acc: T[][] = [[]];
  for (const arr of arrays) {
    acc = acc.flatMap(prefix => arr.map(value => [...prefix, value]));
  }

  return acc;
}

/**
 * Pairwise expansion via greedy candidate-coverage maximization.
 *
 * Output covers every (key_i = value_a, key_j = value_b) pair at least once.
 * For 10 dims × 4 values: roughly 16-24 tests instead of 1,048,576 cartesian.
 *
 * @param variables Map from variable name to its allowed value array.
 * @param options.seed RNG seed for deterministic candidate generation.
 * @param options.candidateAttempts How many random candidates per iteration. Default 64.
 */
export function pairwise<T>(
  variables: Record<string, T[]>,
  options: {seed?: number; candidateAttempts?: number} = {},
): Array<Record<string, T>> {
  const keys = Object.keys(variables);
  if (keys.length === 0) {
    return [];
  }

  if (keys.length === 1) {
    return variables[keys[0]].map(v => ({[keys[0]]: v}));
  }

  // Build the universe of (key_i=val_a | key_j=val_b) pairs we must cover.
  const uncovered = new Set<string>();
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      for (const va of variables[keys[i]]) {
        for (const vb of variables[keys[j]]) {
          uncovered.add(pairKey(keys[i], va, keys[j], vb));
        }
      }
    }
  }

  const rng = mulberry32(options.seed ?? 1);
  const candidateAttempts = options.candidateAttempts ?? 64;
  const out: Array<Record<string, T>> = [];
  let safety = 0;

  while (uncovered.size > 0 && safety < 10_000) {
    let bestCandidate: Record<string, T> | undefined;
    let bestCoverage = 0;

    for (let attempt = 0; attempt < candidateAttempts; attempt++) {
      const candidate: Record<string, T> = {};
      for (const key of keys) {
        const values = variables[key];
        candidate[key] = values[Math.floor(rng() * values.length)];
      }

      const coverage = countCoverage(candidate, keys, uncovered);
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestCandidate = candidate;
        if (coverage === uncovered.size) {
          break;
        }
      }
    }

    if (!bestCandidate || bestCoverage === 0) {
      // No candidate covers any remaining pair — emit one final pass that
      // takes the first uncovered pair directly to guarantee termination.
      const first = uncovered.values().next().value;
      if (first === undefined) {
        break;
      }

      const forced: Record<string, T> = {};
      for (const key of keys) {
        forced[key] = variables[key][0];
      }

      // Overlay the forced pair onto `forced`.
      const parsed = parsePairKey<T>(first, variables);
      Object.assign(forced, parsed);
      bestCandidate = forced;
    }

    // Remove all pairs this candidate covers.
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        uncovered.delete(pairKey(keys[i], bestCandidate[keys[i]], keys[j], bestCandidate[keys[j]]));
      }
    }

    out.push(bestCandidate);
    safety++;
  }

  return out;
}

/**
 * Seeded random subset of the cartesian product. Same seed -> same output.
 */
export function sample<T>(
  variables: Record<string, T[]>,
  n: number,
  seed = 1,
): Array<Record<string, T>> {
  const keys = Object.keys(variables);
  if (keys.length === 0 || n <= 0) {
    return [];
  }

  const arrays = keys.map(k => variables[k]);
  const full = cartesian(...arrays);
  // Convert positional arrays to keyed objects.
  const asRecords = full.map(values => {
    const rec: Record<string, T> = {};
    for (const [idx, key] of keys.entries()) {
      rec[key] = values[idx];
    }

    return rec;
  });

  // Always shuffle (Fisher-Yates with seeded RNG), then slice. Previously
  // n >= length skipped the shuffle, which silently broke the "deterministic
  // by seed" claim at that boundary.
  const rng = mulberry32(seed);
  const shuffled = [...asRecords];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (n >= shuffled.length) {
    return shuffled;
  }

  return shuffled.slice(0, n);
}

/**
 * Driver. Pick the right strategy and return keyed assignment objects.
 */
export function expand<T>(
  variables: Record<string, T[]>,
  strategy: ExpansionStrategy,
  options: {seed?: number; sampleCount?: number; candidateAttempts?: number} = {},
): Array<Record<string, T>> {
  switch (strategy) {
    case 'cartesian': {
      const keys = Object.keys(variables);
      const arrays = keys.map(k => variables[k]);
      return cartesian(...arrays).map(values => {
        const rec: Record<string, T> = {};
        for (const [idx, key] of keys.entries()) {
          rec[key] = values[idx];
        }

        return rec;
      });
    }

    case 'pairwise': {
      return pairwise(variables, {seed: options.seed, candidateAttempts: options.candidateAttempts});
    }

    case 'sample': {
      return sample(variables, options.sampleCount ?? 100, options.seed);
    }
  }
}

// ---------- internals ----------

function pairKey<T>(k1: string, v1: T, k2: string, v2: T): string {
  return `${k1}=${stableStringify(v1)}|${k2}=${stableStringify(v2)}`;
}

function parsePairKey<T>(
  key: string,
  variables: Record<string, T[]>,
): Record<string, T> {
  const [left, right] = key.split('|');
  const out: Record<string, T> = {};
  for (const half of [left, right]) {
    const eq = half.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const k = half.slice(0, eq);
    const serialized = half.slice(eq + 1);
    const candidates = variables[k];
    if (!candidates) {
      continue;
    }

    const match = candidates.find(v => stableStringify(v) === serialized);
    if (match !== undefined) {
      out[k] = match;
    }
  }

  return out;
}

function countCoverage<T>(
  candidate: Record<string, T>,
  keys: string[],
  uncovered: Set<string>,
): number {
  let count = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (uncovered.has(pairKey(keys[i], candidate[keys[i]], keys[j], candidate[keys[j]]))) {
        count++;
      }
    }
  }

  return count;
}

function stableStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

/* eslint-disable no-bitwise -- mulberry32 is a hash function; bitwise is canonical */
/** Mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D_2B_79_F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
/* eslint-enable no-bitwise */

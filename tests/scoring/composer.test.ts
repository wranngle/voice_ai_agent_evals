import {describe, expect, it} from 'vitest';
import {aggregate, compose, weighted} from '../../src/scoring/composer';
import type {DimensionScore, Scorer} from '../../src/scoring/types';

const passDim: DimensionScore = {name: 'a', status: 'passed'};
const failDim: DimensionScore = {name: 'b', status: 'failed', detail: 'b failed'};
const errorDim: DimensionScore = {name: 'c', status: 'error', detail: 'c errored'};

describe('compose', () => {
  it('flattens dimensions across multiple scorers', async () => {
    const s1: Scorer = () => passDim;
    const s2: Scorer = () => [failDim, errorDim];
    const composed = compose(s1, s2);
    const result = await composed({});
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect((result as DimensionScore[])[0].name).toBe('a');
    expect((result as DimensionScore[])[1].name).toBe('b');
    expect((result as DimensionScore[])[2].name).toBe('c');
  });

  it('handles async scorers', async () => {
    const async1: Scorer = async () => passDim;
    const async2: Scorer = async () => [failDim];
    const result = await compose(async1, async2)({});
    expect(result).toHaveLength(2);
  });

  it('preserves order', async () => {
    const dims: DimensionScore[] = [];
    for (let i = 0; i < 5; i++) {
      dims.push({name: `d${i}`, status: 'passed'});
    }

    const scorers: Scorer[] = dims.map(d => () => d);
    const result = (await compose(...scorers)({})) as DimensionScore[];
    expect(result.map(d => d.name)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4']);
  });
});

describe('weighted', () => {
  it('annotates every dimension with the given weight', async () => {
    const s: Scorer = () => [passDim, failDim];
    const weighted2 = weighted(2, s);
    const result = (await weighted2({})) as DimensionScore[];
    expect(result[0].weight).toBe(2);
    expect(result[1].weight).toBe(2);
  });

  it('overrides existing weights on the wrapped scorer', async () => {
    const s: Scorer = () => ({...passDim, weight: 1});
    const result = (await weighted(5, s)({})) as DimensionScore[];
    expect(result[0].weight).toBe(5);
  });
});

describe('aggregate', () => {
  it('passes when all dimensions pass', () => {
    const outcome = aggregate([passDim, {...passDim, name: 'a2'}]);
    expect(outcome.status).toBe('passed');
    expect(outcome.score).toBe(1);
    expect(outcome.errors).toHaveLength(0);
  });

  it('fails when any dimension fails', () => {
    const outcome = aggregate([passDim, failDim]);
    expect(outcome.status).toBe('failed');
    expect(outcome.score).toBeCloseTo(0.5);
    expect(outcome.errors).toContain('b: b failed');
  });

  it('errors when any dimension errors', () => {
    const outcome = aggregate([passDim, errorDim]);
    expect(outcome.status).toBe('error');
  });

  it('weights aggregate by dimension weight', () => {
    const outcome = aggregate([
      {
        name: 'a', status: 'passed', score: 1, weight: 3,
      },
      {
        name: 'b', status: 'failed', score: 0, weight: 1,
      },
    ]);
    expect(outcome.score).toBeCloseTo(0.75); // 3*1 + 1*0 / 4 = 0.75
  });

  it('respects explicit score over status-derived default', () => {
    const outcome = aggregate([
      {name: 'partial', status: 'failed', score: 0.6},
    ]);
    expect(outcome.score).toBeCloseTo(0.6);
    expect(outcome.status).toBe('failed');
  });

  it('handles empty dimension list (score = 0, status = passed)', () => {
    const outcome = aggregate([]);
    expect(outcome.status).toBe('passed');
    expect(outcome.score).toBe(0);
  });

  it('skipped dimensions do not contribute to errors', () => {
    const outcome = aggregate([
      passDim,
      {name: 'skipped', status: 'skipped', detail: 'no fixture'},
    ]);
    expect(outcome.errors).toHaveLength(0);
  });
});

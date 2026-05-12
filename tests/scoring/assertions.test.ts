import {describe, expect, it} from 'vitest';
import {
  contains, equals, llmRubric, not, notAsync, regex,
} from '../../src/scoring/assertions';

describe('contains', () => {
  it('passes when the needle is in the value', () => {
    expect(contains('hello')('hello world')).toMatchObject({status: 'passed'});
  });

  it('fails when the needle is absent', () => {
    expect(contains('xyz')('hello world')).toMatchObject({status: 'failed'});
  });

  it('is case-insensitive by default', () => {
    expect(contains('HELLO')('hello world')).toMatchObject({status: 'passed'});
  });

  it('respects caseSensitive option', () => {
    expect(contains('HELLO', {caseSensitive: true})('hello world'))
      .toMatchObject({status: 'failed'});
    expect(contains('hello', {caseSensitive: true})('hello world'))
      .toMatchObject({status: 'passed'});
  });

  it('accepts a custom name', () => {
    expect(contains('x', {name: 'must_contain_x'})('xyz').name).toBe('must_contain_x');
  });
});

describe('regex', () => {
  it('passes on match', () => {
    expect(regex(/\d{3}/)('order 123 confirmed')).toMatchObject({status: 'passed'});
  });

  it('fails on no match', () => {
    expect(regex(/foo/)('bar')).toMatchObject({status: 'failed'});
  });
});

describe('equals', () => {
  it('passes on exact match', () => {
    expect(equals('hi')('hi')).toMatchObject({status: 'passed'});
  });

  it('fails on mismatch', () => {
    expect(equals('hi')('hello')).toMatchObject({status: 'failed'});
  });
});

describe('not', () => {
  it('inverts passed -> failed', () => {
    expect(not(contains('x'))('xyz')).toMatchObject({status: 'failed'});
  });

  it('inverts failed -> passed', () => {
    expect(not(contains('x'))('abc')).toMatchObject({status: 'passed'});
  });

  it('preserves errored / skipped statuses (does not invert them)', () => {
    const errorAssertion = () => ({name: 'fake', status: 'error' as const, detail: 'kaput'});
    expect(not(errorAssertion)('any')).toMatchObject({status: 'error'});
  });

  it('uses default name = "not:<wrapped>"', () => {
    const wrapped = contains('x', {name: 'has_x'});
    expect(not(wrapped)('abc').name).toBe('not:has_x');
  });
});

describe('llmRubric', () => {
  it('passes when judge score >= threshold', async () => {
    const judge = async () => ({score: 0.85, reasoning: 'tone is professional'});
    const assertion = llmRubric('rate the tone', judge, {threshold: 0.7});
    const result = await assertion('Hello, how may I help you?');
    expect(result.status).toBe('passed');
    expect(result.score).toBe(0.85);
    expect(result.detail).toBe('tone is professional');
  });

  it('fails when judge score < threshold', async () => {
    const judge = async () => ({score: 0.5, reasoning: 'too curt'});
    const assertion = llmRubric('rate the tone', judge, {threshold: 0.7});
    const result = await assertion('ok bye');
    expect(result.status).toBe('failed');
  });

  it('surfaces judge errors as error status (not failed)', async () => {
    const judge = async () => {
      throw new Error('judge LLM timed out');
    };

    const assertion = llmRubric('rate', judge);
    const result = await assertion('value');
    expect(result.status).toBe('error');
    expect(result.detail).toContain('judge LLM timed out');
  });
});

describe('notAsync', () => {
  it('inverts an async assertion', async () => {
    const judge = async () => ({score: 0.85, reasoning: 'great'});
    const passing = llmRubric('rubric', judge);
    const negated = notAsync(passing);
    const result = await negated('value');
    expect(result.status).toBe('failed');
  });
});

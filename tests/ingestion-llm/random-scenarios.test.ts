import {describe, expect, it} from 'vitest';
import {generateRandomScenarios} from '../../src/ingestion/random-scenarios';

describe('generateRandomScenarios', () => {
  it('returns the requested count', () => {
    expect(generateRandomScenarios(50)).toHaveLength(50);
    expect(generateRandomScenarios(0)).toHaveLength(0);
  });

  it('is deterministic for the same seed', () => {
    const a = generateRandomScenarios(20, {seed: 42});
    const b = generateRandomScenarios(20, {seed: 42});
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const a = JSON.stringify(generateRandomScenarios(20, {seed: 1}));
    const b = JSON.stringify(generateRandomScenarios(20, {seed: 9999}));
    expect(a).not.toBe(b);
  });

  it('mixes industry and objection scenarios per ratio', () => {
    const scenarios = generateRandomScenarios(200, {seed: 1, industryRatio: 0.7});
    const industries = scenarios.filter(s => s.category === 'random_industry');
    const objections = scenarios.filter(s => s.category === 'random_objection');
    expect(industries.length + objections.length).toBe(200);
    // ratio should be roughly 70/30 (±15% slop)
    expect(industries.length / 200).toBeGreaterThan(0.55);
    expect(industries.length / 200).toBeLessThan(0.85);
  });

  it('every scenario has the required shape', () => {
    for (const s of generateRandomScenarios(30, {seed: 7})) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.prompt.length).toBeGreaterThan(20);
      expect(Array.isArray(s.expectedTools)).toBe(true);
      expect(Array.isArray(s.forbiddenTools)).toBe(true);
      expect(s.assignment.name).toBeTruthy();
    }
  });

  it('willAcceptSms === true → expectedTools includes send_sms', () => {
    for (const s of generateRandomScenarios(100, {seed: 1})) {
      if (s.category === 'random_industry' && s.assignment.willAcceptSms === true) {
        expect(s.expectedTools).toContain('send_sms');
        expect(s.forbiddenTools).not.toContain('send_sms');
      }

      if (s.category === 'random_industry' && s.assignment.willAcceptSms === false) {
        expect(s.forbiddenTools).toContain('send_sms');
        expect(s.expectedTools).not.toContain('send_sms');
      }
    }
  });

  it('accepts custom industries pool', () => {
    const scenarios = generateRandomScenarios(20, {
      seed: 1,
      industryRatio: 1, // all industry
      industries: [{id: 'fintech', name: 'FinTech'}],
    });
    expect(scenarios.every(s => s.assignment.industry === 'fintech')).toBe(true);
  });
});

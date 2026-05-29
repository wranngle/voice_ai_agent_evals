import {describe, expect, it} from 'vitest';
import {scoreContainmentRate, scoreNotEarlyTermination} from '../../src/scoring/dialog';

describe('scoreNotEarlyTermination', () => {
  it('passes when call continued (no termination event)', () => {
    const dim = scoreNotEarlyTermination({terminated: false, goalAchieved: false});
    expect(dim.status).toBe('passed');
    expect(dim.score).toBe(1);
    expect(dim.detail).toContain('no termination');
  });

  it('passes when agent terminated after goal was achieved', () => {
    const dim = scoreNotEarlyTermination({terminated: true, goalAchieved: true});
    expect(dim.status).toBe('passed');
    expect(dim.detail).toContain('after goal');
  });

  it('fails when agent terminated before goal was achieved', () => {
    const dim = scoreNotEarlyTermination({terminated: true, goalAchieved: false});
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0);
    expect(dim.detail).toContain('before goal');
  });

  it('emits the supplied name on the dimension', () => {
    const dim = scoreNotEarlyTermination({terminated: true, goalAchieved: false, name: 'no_early_hangup'});
    expect(dim.name).toBe('no_early_hangup');
  });

  it('echoes the input booleans into evidence', () => {
    const dim = scoreNotEarlyTermination({terminated: true, goalAchieved: false});
    expect(dim.evidence).toEqual({terminated: true, goalAchieved: false});
  });
});

describe('scoreContainmentRate', () => {
  it('passes when contained rate meets the floor', () => {
    const runs = [
      {resolved: true, handedOff: false},
      {resolved: true, handedOff: false},
      {resolved: true, handedOff: false},
      {resolved: false, handedOff: true},
    ];
    const dim = scoreContainmentRate({runs, minRate: 0.7});
    expect(dim.status).toBe('passed');
    expect(dim.score).toBe(0.75);
    expect(dim.detail).toContain('3/4 contained');
  });

  it('fails when too many runs hand off', () => {
    const runs = [
      {resolved: true, handedOff: false},
      {resolved: false, handedOff: true},
      {resolved: false, handedOff: true},
      {resolved: true, handedOff: false},
    ];
    const dim = scoreContainmentRate({runs});
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0.5);
  });

  it('counts resolved-but-handed-off as not contained', () => {
    // A run can be both resolved AND handed off (e.g. agent passes to human
    // who solves it). For containment, that's not the AI's win.
    const runs = [{resolved: true, handedOff: true}];
    const dim = scoreContainmentRate({runs, minRate: 0});
    expect(dim.score).toBe(0);
  });

  it('errors on empty runs', () => {
    const dim = scoreContainmentRate({runs: []});
    expect(dim.status).toBe('error');
    expect(dim.detail).toContain('no runs supplied');
  });
});

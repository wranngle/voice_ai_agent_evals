import {describe, expect, it} from 'vitest';
import {scoreNotEarlyTermination} from '../../src/scoring/dialog';

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

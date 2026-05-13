import {describe, expect, it} from 'vitest';
import {aggregateCycleStats} from '../../src/remediation/cycle-stats';
import type {FixProposal, PolishLoopStep} from '../../src/remediation/types';

function makeStep(opts: Partial<PolishLoopStep> & {
  iteration: number;
  failingBefore: number;
  failingAfter: number;
}): PolishLoopStep {
  return {
    iteration: opts.iteration,
    failingBefore: opts.failingBefore,
    proposal: opts.proposal,
    applied: opts.applied ?? Boolean(opts.proposal),
    failingAfter: opts.failingAfter,
  };
}

function makeProposal(target: FixProposal['target'], addresses: string[]): FixProposal {
  return {
    target,
    locator: '',
    proposed_value: 'x',
    rationale: 'r',
    addresses,
  };
}

describe('aggregateCycleStats', () => {
  it('returns zero stats on empty history', () => {
    const stats = aggregateCycleStats([]);
    expect(stats.iterations).toBe(0);
    expect(stats.proposals).toBe(0);
    expect(stats.applied).toBe(0);
    expect(stats.improvementRate).toBe(0);
  });

  it('counts iterations, proposals, applied, and improvement rate', () => {
    const history: PolishLoopStep[] = [
      makeStep({
        iteration: 1, failingBefore: 5, failingAfter: 4, proposal: makeProposal('voice_speed', ['voice_activity']),
      }),
      makeStep({
        iteration: 2, failingBefore: 4, failingAfter: 3, proposal: makeProposal('temperature', ['voice_activity']),
      }),
      makeStep({
        iteration: 3, failingBefore: 3, failingAfter: 3, proposal: makeProposal('first_message', ['tone']),
      }),
      makeStep({
        iteration: 4, failingBefore: 3, failingAfter: 0, proposal: makeProposal('system_prompt', ['tone']),
      }),
    ];

    const stats = aggregateCycleStats(history);
    expect(stats.iterations).toBe(4);
    expect(stats.initialFailing).toBe(5);
    expect(stats.finalFailing).toBe(0);
    expect(stats.proposals).toBe(4);
    expect(stats.applied).toBe(4);
    expect(stats.improvedIterations).toBe(3);
    expect(stats.flatIterations).toBe(1);
    expect(stats.regressedIterations).toBe(0);
    expect(stats.improvementRate).toBeCloseTo(0.75);
  });

  it('counts a regression iteration when failingAfter > failingBefore', () => {
    const history: PolishLoopStep[] = [
      makeStep({
        iteration: 1, failingBefore: 2, failingAfter: 3, proposal: makeProposal('voice_speed', ['x']),
      }),
    ];
    const stats = aggregateCycleStats(history);
    expect(stats.regressedIterations).toBe(1);
    expect(stats.improvedIterations).toBe(0);
  });

  it('tallies patternsDetected from proposal.addresses', () => {
    const history: PolishLoopStep[] = [
      makeStep({
        iteration: 1, failingBefore: 1, failingAfter: 0, proposal: makeProposal('voice_speed', ['voice_activity']),
      }),
      makeStep({
        iteration: 2, failingBefore: 1, failingAfter: 0, proposal: makeProposal('temperature', ['voice_activity', 'tone']),
      }),
    ];
    const stats = aggregateCycleStats(history);
    expect(stats.patternsDetected.voice_activity).toBe(2);
    expect(stats.patternsDetected.tone).toBe(1);
  });

  it('passes through stoppedBecause from PolishLoopResult', () => {
    const stats = aggregateCycleStats(
      [makeStep({iteration: 1, failingBefore: 0, failingAfter: 0})],
      {stopped_because: 'all_passing'},
    );
    expect(stats.stoppedBecause).toBe('all_passing');
  });

  it('does not count proposals or applies for dry-run iterations without a proposal', () => {
    const history: PolishLoopStep[] = [
      makeStep({
        iteration: 1, failingBefore: 2, failingAfter: 2, proposal: undefined, applied: false,
      }),
    ];
    const stats = aggregateCycleStats(history);
    expect(stats.proposals).toBe(0);
    expect(stats.applied).toBe(0);
  });
});

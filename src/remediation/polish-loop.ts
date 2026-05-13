/**
 * @wranngle/voice-evals/remediation/polish-loop — iterative closed loop.
 *
 * Six phases per iteration (matches archive's autorefinement-engine):
 *   1. EVALUATE     run the eval suite, collect failing dimensions
 *   2. ANALYZE      (optional) detect known failure patterns
 *   3. PROPOSE      either pattern-driven (deterministic) or LLM-driven
 *   4. APPLY        governance-gated PATCH
 *   5. VERIFY       re-run the eval suite, compute delta
 *   6. LOG          (optional) append to JSONL friction log
 *
 * Stops on:
 *   - all dimensions pass ('all_passing')
 *   - iteration cap reached ('max_iterations')
 *   - no improvement for `patience` iterations ('patience_exhausted')
 *   - proposer returned nothing ('no_proposal')
 *
 * Apply is governance-gated: by default only [DEV]-tagged agents are
 * touched; pass `governance: { allowedPhases: ['ALPHA'] }` to ramp.
 *
 * Outcome reporting: the result carries `initialFailingDimensions`,
 * `finalFailingDimensions`, `improvedDimensions`, `regressedDimensions`,
 * `netImprovement`, and `regressed`. Operators check `regressed` and
 * roll back the agent when true.
 */

import type {DimensionScore} from '../scoring/types';
import {applyFix} from './apply';
import {logFriction} from './friction-log';
import {detectPatterns, type DetectedPattern} from './patterns';
import {proposeFix} from './proposal';
import type {
  FixProposal, PolishLoopOptions, PolishLoopResult, PolishLoopStep,
} from './types';

type LoopState = {
  initialFailing?: Set<string>;
  initialPassing?: Set<string>;
  initialDims?: readonly DimensionScore[];
  lastDims?: readonly DimensionScore[];
};

export async function polishLoop(options: PolishLoopOptions): Promise<PolishLoopResult> {
  const maxIterations = options.maxIterations ?? 3;
  const patience = options.patience ?? 2;
  const dryRun = options.dryRun ?? false;

  const applied: FixProposal[] = [];
  const history: PolishLoopStep[] = [];
  const patternTally: Record<string, number> = {};
  const failingHistory: number[] = [];
  const state: LoopState = {};
  let prevFailing = Number.POSITIVE_INFINITY;
  let consecutiveNoImprovement = 0;

  for (let i = 1; i <= maxIterations; i++) {
    const {failures: failingBefore, all: dimsBefore} = await collectDims(options.evaluate);
    rememberDims(state, dimsBefore);

    if (failingBefore.length === 0) {
      history.push({
        iteration: i, failingBefore: 0, proposal: undefined, applied: false, failingAfter: 0,
      });
      return finish(history, applied, 'all_passing', 0, patternTally, state);
    }

    const detected = await runAnalyze(options, failingBefore, failingHistory);
    tallyPatterns(detected, patternTally);
    logPatternsDetected(options, detected, options.agentId);

    const agent = await options.client.agents.get(options.agentId);
    const proposals = await proposeFix({
      llm: options.llm,
      agentConfig: (agent.config ?? {}) as Record<string, unknown>,
      failures: failingBefore,
      detectedPatterns: detected,
    });

    const proposal = proposals[0];
    if (!proposal) {
      history.push({
        iteration: i,
        failingBefore: failingBefore.length,
        proposal: undefined,
        applied: false,
        failingAfter: failingBefore.length,
        patternsDetected: detected,
      });
      return finish(history, applied, 'no_proposal', failingBefore.length, patternTally, state);
    }

    const applyResult = await applyFix({
      client: options.client,
      agentId: options.agentId,
      fix: proposal,
      governance: options.governance,
      dryRun,
    });

    let afterFailures: DimensionScore[];
    let afterAll: readonly DimensionScore[];
    if (dryRun) {
      afterFailures = [...failingBefore];
      afterAll = dimsBefore;
    } else {
      const out = await collectDims(options.evaluate);
      afterFailures = out.failures;
      afterAll = out.all;
    }

    rememberDims(state, afterAll); // overwrite lastDims each iteration
    const failingAfter = afterFailures.length;

    history.push({
      iteration: i,
      failingBefore: failingBefore.length,
      proposal,
      applied: applyResult.applied,
      failingAfter,
      patternsDetected: detected,
    });
    failingHistory.push(failingAfter);

    logRemediationOutcome(options, proposal, applyResult.applied, failingBefore.length, failingAfter);

    if (applyResult.applied) {
      applied.push(proposal);
    }

    if (failingAfter === 0) {
      return finish(history, applied, 'all_passing', 0, patternTally, state);
    }

    if (failingAfter >= prevFailing) {
      consecutiveNoImprovement += 1;
    } else {
      consecutiveNoImprovement = 0;
    }

    prevFailing = failingAfter;

    if (consecutiveNoImprovement >= patience) {
      return finish(history, applied, 'patience_exhausted', failingAfter, patternTally, state);
    }
  }

  return finish(history, applied, 'max_iterations', prevFailing, patternTally, state);
}

async function collectDims(evaluate: PolishLoopOptions['evaluate']): Promise<{
  failures: DimensionScore[];
  all: readonly DimensionScore[];
}> {
  const dims = await evaluate();
  return {
    failures: dims.filter(d => d.status === 'failed' || d.status === 'error'),
    all: dims,
  };
}

function rememberDims(state: LoopState, dims: readonly DimensionScore[]): void {
  if (!state.initialFailing) {
    state.initialFailing = new Set(dims.filter(d => d.status === 'failed' || d.status === 'error').map(d => d.name));
    state.initialPassing = new Set(dims.filter(d => d.status === 'passed').map(d => d.name));
    state.initialDims = dims;
  }

  state.lastDims = dims;
}

async function runAnalyze(
  options: PolishLoopOptions,
  failures: readonly DimensionScore[],
  failingHistory: readonly number[],
): Promise<DetectedPattern[]> {
  if (!options.analyze) {
    return [];
  }

  const ctx = await options.analyze(failures);
  return detectPatterns({...ctx, failures, iterationHistory: failingHistory});
}

function tallyPatterns(detected: readonly DetectedPattern[], tally: Record<string, number>): void {
  for (const d of detected) {
    tally[d.pattern] = (tally[d.pattern] ?? 0) + 1;
  }
}

function logPatternsDetected(
  options: PolishLoopOptions,
  detected: readonly DetectedPattern[],
  agentId: string,
): void {
  if (!options.frictionLogPath || detected.length === 0) {
    return;
  }

  for (const d of detected) {
    logFriction({
      type: 'PATTERN_DETECTED',
      pattern: d.pattern,
      agentId,
      success: false,
      detail: d.evidence,
    }, {path: options.frictionLogPath});
  }
}

function logRemediationOutcome(
  options: PolishLoopOptions,
  proposal: FixProposal,
  appliedOk: boolean,
  failingBefore: number,
  failingAfter: number,
): void {
  if (!options.frictionLogPath) {
    return;
  }

  logFriction({
    type: failingAfter < failingBefore ? 'REMEDIATION_APPLIED' : 'VERIFICATION_FAILED',
    pattern: proposal.target,
    agentId: options.agentId,
    success: appliedOk && failingAfter < failingBefore,
    detail: `before=${failingBefore} after=${failingAfter}`,
  }, {path: options.frictionLogPath});
}

function finish(
  history: PolishLoopStep[],
  applied: FixProposal[],
  reason: PolishLoopResult['stopped_because'],
  finalFailingCount: number,
  patternsDetected: Record<string, number>,
  state: LoopState,
): PolishLoopResult {
  const out: PolishLoopResult = {
    iterations: history.length,
    applied,
    history,
    stopped_because: reason,
    finalFailingCount,
  };

  if (Object.keys(patternsDetected).length > 0) {
    out.patternsDetected = patternsDetected;
  }

  if (state.initialFailing && state.lastDims) {
    const finalFailing = new Set(state.lastDims.filter(d => d.status === 'failed' || d.status === 'error').map(d => d.name));
    const {initialFailing} = state;
    const initialPassing = state.initialPassing ?? new Set<string>();

    const improved = [...initialFailing].filter(name => !finalFailing.has(name));
    const regressed = [...finalFailing].filter(name => initialPassing.has(name));

    out.initialFailingDimensions = [...initialFailing].sort();
    out.finalFailingDimensions = [...finalFailing].sort();
    out.improvedDimensions = improved.sort();
    out.regressedDimensions = regressed.sort();
    out.netImprovement = improved.length - regressed.length;
    out.regressed = regressed.length > 0 || finalFailingCount > initialFailing.size;
  }

  return out;
}

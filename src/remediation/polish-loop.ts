/**
 * @wranngle/voice-evals/remediation/polish-loop — iterative closed loop.
 *
 * Repeat (evaluate -> propose -> apply -> evaluate) until:
 *   - all eval dimensions pass ('all_passing'), or
 *   - the iteration cap is reached ('max_iterations'), or
 *   - no improvement for `patience` consecutive iterations ('patience_exhausted'), or
 *   - the proposer returned no suggestions ('no_proposal').
 *
 * Each step is reported in `history[]` so operators can audit the loop.
 * Apply is governance-gated: by default only [DEV]-tagged agents are
 * touched; pass `governance: { allowedPhases: ['ALPHA'] }` to ramp.
 */

import type {DimensionScore} from '../scoring/types';
import {applyFix} from './apply';
import {proposeFix} from './proposal';
import type {
  FixProposal, PolishLoopOptions, PolishLoopResult, PolishLoopStep,
} from './types';

export async function polishLoop(options: PolishLoopOptions): Promise<PolishLoopResult> {
  const maxIterations = options.maxIterations ?? 3;
  const patience = options.patience ?? 2;
  const dryRun = options.dryRun ?? false;

  const applied: FixProposal[] = [];
  const history: PolishLoopStep[] = [];
  let prevFailing = Number.POSITIVE_INFINITY;
  let consecutiveNoImprovement = 0;

  for (let i = 1; i <= maxIterations; i++) {
    const failingBefore = await collectFailures(options.evaluate);

    if (failingBefore.length === 0) {
      history.push({
        iteration: i, failingBefore: 0, proposal: undefined, applied: false, failingAfter: 0,
      });
      return finish(history, applied, 'all_passing', 0);
    }

    const agent = await options.client.agents.get(options.agentId);
    const proposals = await proposeFix({
      llm: options.llm,
      agentConfig: (agent.config ?? {}) as Record<string, unknown>,
      failures: failingBefore,
    });

    const proposal = proposals[0];
    if (!proposal) {
      history.push({
        iteration: i,
        failingBefore: failingBefore.length,
        proposal: undefined,
        applied: false,
        failingAfter: failingBefore.length,
      });
      return finish(history, applied, 'no_proposal', failingBefore.length);
    }

    const applyResult = await applyFix({
      client: options.client,
      agentId: options.agentId,
      fix: proposal,
      governance: options.governance,
      dryRun,
    });

    const afterFailures = dryRun
      ? failingBefore
      : await collectFailures(options.evaluate);
    const failingAfter = afterFailures.length;

    history.push({
      iteration: i,
      failingBefore: failingBefore.length,
      proposal,
      applied: applyResult.applied,
      failingAfter,
    });

    if (applyResult.applied) {
      applied.push(proposal);
    }

    if (failingAfter === 0) {
      return finish(history, applied, 'all_passing', 0);
    }

    if (failingAfter >= prevFailing) {
      consecutiveNoImprovement += 1;
    } else {
      consecutiveNoImprovement = 0;
    }

    prevFailing = failingAfter;

    if (consecutiveNoImprovement >= patience) {
      return finish(history, applied, 'patience_exhausted', failingAfter);
    }
  }

  return finish(history, applied, 'max_iterations', prevFailing);
}

async function collectFailures(evaluate: PolishLoopOptions['evaluate']): Promise<DimensionScore[]> {
  const dims = await evaluate();
  return dims.filter(d => d.status === 'failed' || d.status === 'error');
}

function finish(
  history: PolishLoopStep[],
  applied: FixProposal[],
  reason: PolishLoopResult['stopped_because'],
  finalFailingCount: number,
): PolishLoopResult {
  return {
    iterations: history.length,
    applied,
    history,
    stopped_because: reason,
    finalFailingCount,
  };
}

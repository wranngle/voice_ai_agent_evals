/**
 * `voice-evals polish <agent-id>` — run the closed-loop remediation.
 *
 * Demonstrates Phase 5 closed-loop. Reads voice-evals.config.{ts,mjs} for
 * `client`, `llm`, and `evaluate`. Calls polishLoop. Prints per-iteration
 * history and the stop-reason.
 *
 * Required config exports:
 *   client:   VoiceEvalsClient (from createVoiceEvalsClient)
 *   llm:      LlmCompleteCallback
 *   evaluate: () => Promise<DimensionScore[]>   (your eval suite)
 */

import {polishLoop} from '../../remediation/polish-loop';
import type {PolishLoopOptions, PolishLoopResult} from '../../remediation/types';
import type {VoiceEvalsClient} from '../../wrapper/types';
import {loadConfig} from './config-loader';
import {createTracer} from '../../internal/jsonl-trace';

const trace = createTracer('cli.polish');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type PolishCliOptions = {
  agentId: string;
  dryRun?: boolean;
  maxIterations?: number;
  patience?: number;
  /** Stream output here. */
  out?: (line: string) => void;
  /** Override cwd for config loading. */
  cwd?: string;
  /** Inject a fully-constructed PolishLoopOptions (skip config load) — for tests. */
  override?: PolishLoopOptions;
};

export async function runPolish(options: PolishCliOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.agentId && !options.override) {
    out('error: voice-evals polish requires an agent_id argument');
    out('usage: voice-evals polish <agent-id> [--dry-run] [--max-iterations N] [--patience N]');
    return 1;
  }

  let loopOpts: PolishLoopOptions;
  if (options.override) {
    loopOpts = options.override;
  } else {
    try {
      const config = await loadConfig(options.cwd);
      if (!config.client || typeof config.client !== 'object') {
        out('error: voice-evals.config must export `client: VoiceEvalsClient`');
        return 1;
      }

      if (typeof config.llm !== 'function') {
        out('error: voice-evals.config must export `llm: LlmCompleteCallback`');
        return 1;
      }

      if (typeof config.evaluate !== 'function') {
        out('error: voice-evals.config must export `evaluate: () => Promise<DimensionScore[]>`');
        out('This callback runs your eval suite and returns the failing dimensions to polish against.');
        return 1;
      }

      loopOpts = {
        client: config.client as VoiceEvalsClient,
        agentId: options.agentId,
        evaluate: config.evaluate as PolishLoopOptions['evaluate'],
        llm: config.llm as PolishLoopOptions['llm'],
        maxIterations: options.maxIterations,
        patience: options.patience,
        dryRun: options.dryRun,
      };
    } catch (error) {
      out(`error: ${(error as Error).message}`);
      return 1;
    }
  }

  out(`Polishing agent ${options.agentId ?? '(overridden)'}${options.dryRun ? ' (dry-run)' : ''}…`);

  let result: PolishLoopResult;
  try {
    result = await polishLoop(loopOpts);
  } catch (error) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  out('');
  for (const step of result.history) {
    const tag = step.applied ? '✓ applied' : (step.proposal ? '· dry-run' : '— no proposal');
    out(`  iter ${step.iteration}: ${step.failingBefore} → ${step.failingAfter} failing  [${tag}]`);
    if (step.proposal) {
      const locator = step.proposal.locator ? ` ${step.proposal.locator}` : '';
      out(`    proposal: ${step.proposal.target}${locator} → ${step.proposal.proposed_value.slice(0, 80)}`);
      out(`    reason:   ${step.proposal.rationale.slice(0, 120)}`);
    }
  }

  out('');
  out(`Stopped: ${result.stopped_because}`);
  out(`Final failing dimensions: ${result.finalFailingCount}`);
  out(`Applied ${result.applied.length} fix(es) over ${result.iterations} iteration(s).`);

  return result.finalFailingCount === 0 ? 0 : 1;
}

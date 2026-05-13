/**
 * @wranngle/voice-evals/remediation/supersystem — top-level autonomous loop.
 *
 * Ports the archive's `supersystem-engine.js` orchestrator. Coordinates:
 *   L1 — agent fixes (via polishLoop)
 *   L2 — n8n workflow fixes (via createN8nCorrector)
 *   L3 — friction log + cycle stats
 *
 * Out of scope (per the v1.1 port): L4 Gemini brain, L5 Claude Code
 * auto-commit, L6 Deep Research. Consumers plug in their own LLM via
 * `llm` and their own workflow diagnostics via `n8n.collectFailures`.
 *
 * The loop runs up to `maxCycles` (default 5). Each cycle:
 *   1. Run polishLoop against the agent.
 *   2. If `n8n.collectFailures` is set, ask for the current workflow
 *      failures, run diagnoseWorkflowFailure for each, apply via
 *      applyWorkflowFixes.
 *   3. Aggregate cycle stats + log to friction-log if configured.
 *
 * Stops on:
 *   - polishLoop's `regressed` flag (agent got worse — operator gate)
 *   - polishLoop reports `all_passing` AND no workflow failures
 *   - `maxCycles` reached
 */

import type {N8nCorrectorClient, WorkflowFailureContext} from '../n8n';
import type {LlmCompleteCallback} from '../ingestion/types';
import type {GovernanceOptions, VoiceEvalsClient} from '../wrapper/types';
import {aggregateCycleStats, type CycleStats} from './cycle-stats';
import {logFriction} from './friction-log';
import {polishLoop} from './polish-loop';
import type {
  AnalyzeCallback, EvaluateCallback, PolishLoopResult,
} from './types';

export type SupersystemN8nHooks = {
  corrector: N8nCorrectorClient;
  /**
   * Caller-supplied diagnostics: given the current cycle index, return a
   * list of WorkflowFailureContexts to feed to `diagnoseWorkflowFailure`.
   * Return [] when no failures are known.
   */
  collectFailures: (cycle: number) => Promise<WorkflowFailureContext[]> | WorkflowFailureContext[];
};

export type RunSupersystemOptions = {
  client: VoiceEvalsClient;
  agentId: string;
  evaluate: EvaluateCallback;
  llm: LlmCompleteCallback;
  /** Optional pattern-detection feeder; passed to polishLoop. */
  analyze?: AnalyzeCallback;
  /** Optional n8n corrector + diagnostic feeder. */
  n8n?: SupersystemN8nHooks;
  /** Max cycles of (L1 then L2). Default 5. */
  maxCycles?: number;
  /** Iterations per polishLoop call. Default 3. */
  maxIterationsPerCycle?: number;
  /** Stop applying agent fixes after this many consecutive cycles with no improvement. Default 2. */
  agentPatience?: number;
  /** Dry-run every apply. Default false. */
  dryRun?: boolean;
  /** Governance overrides for agent mutations. Default [DEV]-only. */
  governance?: GovernanceOptions;
  /** Path to a JSONL friction log. */
  frictionLogPath?: string;
};

export type N8nCycleResult = {
  cycle: number;
  diagnoses: number;
  applied: number;
  failed: number;
};

export type RunSupersystemResult = {
  cycles: number;
  agentRuns: PolishLoopResult[];
  n8nRuns: N8nCycleResult[];
  cycleStats: CycleStats;
  stopped_because:
    | 'all_passing'
    | 'max_cycles'
    | 'agent_regressed'
    | 'no_action';
  regressed: boolean;
};

export async function runSupersystem(options: RunSupersystemOptions): Promise<RunSupersystemResult> {
  const maxCycles = options.maxCycles ?? 5;
  const agentRuns: PolishLoopResult[] = [];
  const n8nRuns: N8nCycleResult[] = [];
  let stopReason: RunSupersystemResult['stopped_because'] = 'max_cycles';
  let regressed = false;

  logCycleEvent(options, 'CYCLE_START', 0);

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const agentRun = await polishLoop({
      client: options.client,
      agentId: options.agentId,
      evaluate: options.evaluate,
      llm: options.llm,
      analyze: options.analyze,
      maxIterations: options.maxIterationsPerCycle ?? 3,
      patience: options.agentPatience ?? 2,
      dryRun: options.dryRun,
      governance: options.governance,
      frictionLogPath: options.frictionLogPath,
    });
    agentRuns.push(agentRun);

    if (agentRun.regressed === true) {
      regressed = true;
      stopReason = 'agent_regressed';
      logCycleEvent(options, 'CYCLE_END', cycle, {reason: stopReason});
      break;
    }

    let n8nApplied = 0;
    if (options.n8n) {
      const cycleResult = await runN8nFixes(options.n8n, cycle, options.dryRun);
      n8nRuns.push(cycleResult);
      n8nApplied = cycleResult.applied;
    }

    if (agentRun.stopped_because === 'all_passing' && n8nApplied === 0) {
      stopReason = 'all_passing';
      logCycleEvent(options, 'CYCLE_END', cycle, {reason: stopReason});
      break;
    }

    if (
      agentRun.stopped_because === 'no_proposal'
      && n8nApplied === 0
    ) {
      stopReason = 'no_action';
      logCycleEvent(options, 'CYCLE_END', cycle, {reason: stopReason});
      break;
    }
  }

  const lastAgentRun = agentRuns.at(-1);
  const cycleStats: CycleStats = lastAgentRun
    ? aggregateCycleStats(lastAgentRun.history, lastAgentRun)
    : aggregateCycleStats([], undefined);

  return {
    cycles: agentRuns.length,
    agentRuns,
    n8nRuns,
    cycleStats,
    stopped_because: stopReason,
    regressed,
  };
}

async function runN8nFixes(
  hooks: SupersystemN8nHooks,
  cycle: number,
  dryRun: boolean | undefined,
): Promise<N8nCycleResult> {
  const failures = await hooks.collectFailures(cycle);
  if (failures.length === 0) {
    return {
      cycle, diagnoses: 0, applied: 0, failed: 0,
    };
  }

  let applied = 0;
  let failed = 0;
  for (const failure of failures) {
    const diagnosis = hooks.corrector.diagnoseWorkflowFailure(failure);
    if (diagnosis.operations.length === 0) {
      continue;
    }

    if (dryRun) {
      applied += diagnosis.operations.length;
      continue;
    }

    try {
      const result = await hooks.corrector.applyWorkflowFixes(failure.workflowId, diagnosis.operations);
      if (result.success) {
        applied += diagnosis.operations.length;
      } else {
        failed += result.results.filter(r => !r.success).length;
      }
    } catch {
      failed++;
    }
  }

  return {
    cycle, diagnoses: failures.length, applied, failed,
  };
}

function logCycleEvent(
  options: RunSupersystemOptions,
  type: 'CYCLE_START' | 'CYCLE_END',
  cycle: number,
  extra: Record<string, unknown> = {},
): void {
  if (!options.frictionLogPath) {
    return;
  }

  logFriction({
    type,
    agentId: options.agentId,
    success: true,
    detail: JSON.stringify({cycle, ...extra}),
  }, {path: options.frictionLogPath});
}

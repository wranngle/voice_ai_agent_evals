/**
 * @wranngle/voice-evals/remediation — closed-loop performance evaluation
 * and remediation.
 *
 * Phase 5 MVP:
 *   - proposeFix({llm, agentConfig, failures}) -> FixProposal[]
 *   - applyFix({client, agentId, fix, governance?, dryRun?}) -> ApplyFixResult
 *   - polishLoop({client, agentId, evaluate, llm, ...}) -> PolishLoopResult
 *   - gepa-bridge.ts: contract for the Phase 5.x Python sidecar (GEPA)
 *
 * Deferred to Phase 5.x:
 *   - Postinstall provisioning of the Python venv (uv + gepa + pyrit)
 *   - gepa_run.py JSON-IO subprocess contract
 *   - PyRIT adversarial sidecar (uses same install path)
 *   - persistent governance.yaml state updates on apply
 */

export type {
  AnalyzeCallback,
  ApplyFixOptions,
  ApplyFixResult,
  EvaluateCallback,
  FixProposal,
  FixTarget,
  PolishLoopOptions,
  PolishLoopResult,
  PolishLoopStep,
  ProposeFixOptions,
} from './types';

export {proposeFix} from './proposal';
export {applyFix} from './apply';
export {polishLoop} from './polish-loop';
export {
  GepaUnavailableError,
  getSidecarPaths,
  isGepaAvailable,
  runGepaOptimization,
} from './gepa-bridge';
export type {GepaOptimizationInput, GepaOptimizationResult} from './gepa-bridge';

// Phase D: friction log + cycle stats
export {
  getUnresolvedFrictions, logFriction, readFrictionLog, resolveFriction,
} from './friction-log';
export type {FrictionEvent, FrictionEventType, LogFrictionOptions} from './friction-log';
export {aggregateCycleStats} from './cycle-stats';
export type {CycleStats} from './cycle-stats';

// Phase E: failure-pattern detection (ANALYZE phase)
export {detectPatterns, FAILURE_PATTERNS, getPattern} from './patterns';
export type {
  DetectedPattern, DetectionInput, FailurePattern, FailurePatternId, TranscriptTurn,
} from './patterns';

/**
 * @wranngle/voice-evals/remediation — closed-loop performance evaluation
 * and remediation.
 *
 * Surface:
 *   - proposeFix({llm, agentConfig, failures}) -> FixProposal[]
 *   - applyFix({client, agentId, fix, governance?, dryRun?}) -> ApplyFixResult
 *   - polishLoop({client, agentId, evaluate, llm, ...}) -> PolishLoopResult
 *   - gepa-bridge.ts: thin contract for the Python GEPA sidecar
 *     (`voice-evals doctor --install` provisions the venv; full optimizer
 *     wiring tracked for v1.2 per README phase tracker).
 *   - friction-log.ts: append-only JSONL audit (logFriction +
 *     read/getUnresolved/resolve helpers).
 *   - cycle-stats.ts: aggregateCycleStats(history, result) for
 *     dashboard-friendly polish-loop rollups.
 *   - patterns.ts: 5 FAILURE_PATTERNS + detectPatterns for the
 *     deterministic ANALYZE → PROPOSE shortcut.
 *   - supersystem.ts: runSupersystem orchestrates L1 (polishLoop) + L2
 *     (n8n auto-correct) + L3 (friction log) in one driver.
 *
 * Still deferred:
 *   - PyRIT adversarial sidecar (uses the same Python install path as
 *     GEPA; per README, lands in v1.2).
 *
 * Not a roadmap item, just so the next reader doesn't add it back:
 * **there is no persistent governance file**. Governance is stateless code
 * in src/wrapper/governance.ts (parseAgentName / enforceMutation /
 * assertModelAllowed); the agent's `[PHASE]` prefix + config/model-rankings.json
 * are the only sources of truth. See AGENTS.md § ElevenLabs agent governance.
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
  applyTombstones,
  getUnresolvedFrictions,
  logFriction,
  readFrictionLog,
  resolveFriction,
  resolveFrictionAppend,
} from './friction-log';
export type {
  FrictionEvent, FrictionEventType, LogFrictionOptions, ResolveMatcher,
} from './friction-log';
export {aggregateCycleStats} from './cycle-stats';
export type {CycleStats} from './cycle-stats';

// Phase E: failure-pattern detection (ANALYZE phase)
export {
  detectPatterns, diagnoseFromFailure, FAILURE_PATTERNS, getPattern,
} from './patterns';
export type {
  DetectedPattern, DetectionInput, FailurePattern, FailurePatternId, TranscriptTurn,
} from './patterns';

// Audit 2: supersystem orchestrator (L1 + L2 + L3)
export {runSupersystem} from './supersystem';
export type {
  N8nCycleResult, RunSupersystemOptions, RunSupersystemResult, SupersystemN8nHooks,
} from './supersystem';

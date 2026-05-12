/**
 * @wranngle/voice-evals — audio-native voice AI agent eval, polish, and
 * regression-test factory wrapping ElevenLabs Conversational AI.
 *
 * v1.0 in-progress: the public surface re-exported here will be reshaped
 * substantially in Phases 1-6 (wrapper, scoring, ingestion, regression,
 * remediation). See README.md "v1.0 roadmap" for the target shape.
 *
 * Phase 0 ships the existing eval-harness surface under the new package name
 * so consumers can install `@wranngle/voice-evals` today and migrate as the
 * v1.0 subpath exports (`/wrapper`, `/scoring`, `/scenarios`, `/ingestion`,
 * `/regression`, `/remediation`) land.
 */

export * from './testing/index';
export type * from './extraction/types';
export {verifyElevenLabsSignature} from './security/elevenlabs-signature';

// v1.0 remediation surface (Phase 5+). Canonical subpath: `@wranngle/voice-evals/remediation`.
export {
  GepaUnavailableError,
  applyFix,
  getSidecarPaths,
  isGepaAvailable,
  polishLoop,
  proposeFix,
  runGepaOptimization,
} from './remediation';
export type {
  ApplyFixOptions,
  ApplyFixResult,
  EvaluateCallback,
  FixProposal,
  FixTarget,
  GepaOptimizationInput,
  GepaOptimizationResult,
  PolishLoopOptions,
  PolishLoopResult,
  PolishLoopStep,
  ProposeFixOptions,
} from './remediation';

// v1.0 regression surface (Phase 4+). Canonical subpath: `@wranngle/voice-evals/regression`.
export {
  baselineExists,
  captureBaseline,
  diffAgainstBaseline,
  loadBaseline,
  saveBaseline,
} from './regression';
export type {
  BaselineRun,
  BaselineSnapshot,
  CaptureBaselineOptions,
  DiffDirection,
  DiffOptions,
  DiffResult,
  DimensionDiff,
  TestDiff,
} from './regression';

// v1.0 ingestion surface (Phase 3+). Canonical subpath: `@wranngle/voice-evals/ingestion`.
export {
  CANONICAL_PERSONAS,
  buildPersonaSystemPrompt,
  getPersona,
  importPostCallWebhook,
  listPersonas,
  proposeTestCases,
} from './ingestion';
export type {
  ElevenLabsPostCallPayload,
  ImportedTestCases,
  IngestionOptions,
  LlmCompleteCallback,
  Persona,
  PersonaTraits,
  ProposedTestCase,
} from './ingestion';

// v1.0 scoring surface (Phase 2+). Canonical subpath: `@wranngle/voice-evals/scoring`.
export {
  aggregate,
  compose,
  contains,
  detectBargeIn,
  detectSpeechSegments,
  equals,
  llmRubric,
  not,
  notAsync,
  parseWav,
  regex,
  rmsEnvelope,
  scoreBargeIn,
  scoreVoiceActivity,
  weighted,
} from './scoring';
export type {
  Assertion,
  AsyncAssertion,
  BargeInOptions,
  BargeInResult,
  Caller,
  DimensionScore,
  LlmJudgeCallback,
  RunOutcome,
  Scorer,
  SegmentationOptions,
  SpeechSegment,
  Status,
  Task,
  WavInfo,
} from './scoring';

// v1.0 wrapper surface (Phase 1+). Re-exported here for convenience; the
// canonical subpath is `@wranngle/voice-evals/wrapper`.
export {
  createVoiceEvalsClient,
  GovernanceError,
  PHASES,
  assertModelAllowed,
  cleanProperty,
  cleanTools,
  enforceMutation,
  hasMutualExclusionViolation,
  isPhase,
  parseAgentName,
} from './wrapper';
export type {
  AgentSummary,
  AgentTool,
  AgentWithConfig,
  AgentsApi,
  GovernanceOptions,
  ModelRankings,
  ParsedAgentName,
  Phase,
  ToolProperty,
  ToolsApi,
  VerifyElevenLabsSignature,
  VoiceEvalsClient,
  VoiceEvalsClientOptions,
  WebhooksApi,
} from './wrapper';

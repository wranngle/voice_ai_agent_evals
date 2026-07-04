/**
 * @wranngle/voice-evals: research-stage eval and regression harness for
 * ElevenLabs voice agents. This file is the library entry point, re-exporting
 * the scoring, ingestion, security, and n8n-corrector surfaces.
 *
 * Not published to npm; consume from source. See README.md for the honest
 * feature status, including which parts are stubs.
 */

export * from './testing/index';
export type * from './ingestion/extraction/types';
export {createReplayCache, verifyElevenLabsSignature} from './security/elevenlabs-signature';
export type {ReplayCache} from './security/elevenlabs-signature';

// v1.1 n8n corrector surface (Phase F). Canonical subpath: `@wranngle/voice-evals/n8n`.
export {
  WORKFLOW_FIXES,
  addErrorHandling,
  addRetryLogic,
  addTimeout,
  applyOperation,
  createN8nCorrector,
  fixWebhookData,
  NODE_LEVEL_PROPS,
} from './n8n';
export type {
  N8nConnectionMap,
  N8nConnectionTarget,
  N8nCorrectorClient,
  N8nCorrectorOptions,
  N8nNode,
  N8nNodeName,
  N8nWorkflow,
  NodeChanges,
  NodeOperation,
  WorkflowDiagnosis,
  WorkflowFailureContext,
  WorkflowFixId,
} from './n8n';

// v1.1 factory surface (Phase B+). Canonical subpath: `@wranngle/voice-evals/factory`.
export {
  cartesian,
  expand,
  expandAll,
  expandTemplate,
  generatedTestsToCreatePayloads,
  generatedToCreatePayload,
  kWise,
  loadIndustries,
  loadTemplates,
  loadVariants,
  pairwise,
  sample,
} from './factory';
export type {
  ChatHistoryTurn,
  ExpandOptions,
  ExpansionContext,
  ExpansionStrategy,
  FactoryContext,
  GeneratedTest,
  Industry,
  Template,
  TestExample,
  Variant,
  VariantBucket,
} from './factory';

// v1.0 remediation surface (Phase 5+). Canonical subpath: `@wranngle/voice-evals/remediation`.
export {
  FAILURE_PATTERNS,
  GepaUnavailableError,
  aggregateCycleStats,
  applyFix,
  detectPatterns,
  diagnoseFromFailure,
  getPattern,
  getSidecarPaths,
  getUnresolvedFrictions,
  isGepaAvailable,
  logFriction,
  polishLoop,
  proposeFix,
  readFrictionLog,
  resolveFriction,
  resolveFrictionAppend,
  runGepaOptimization,
  runSupersystem,
} from './remediation';
export type {
  AnalyzeCallback,
  ApplyFixOptions,
  ApplyFixResult,
  CycleStats,
  DetectedPattern,
  DetectionInput,
  EvaluateCallback,
  FailurePattern,
  FailurePatternId,
  FixProposal,
  FixTarget,
  FrictionEvent,
  FrictionEventType,
  GepaOptimizationInput,
  GepaOptimizationResult,
  LogFrictionOptions,
  PolishLoopOptions,
  PolishLoopResult,
  PolishLoopStep,
  ProposeFixOptions,
  RunSupersystemOptions,
  RunSupersystemResult,
  SupersystemN8nHooks,
  TranscriptTurn,
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
  designAssertions,
  getPersona,
  importPostCallWebhook,
  listPersonas,
  proposeTestCases,
} from './ingestion';
export type {
  DesignedAssertion,
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
  // judges
  arenaJudge,
  evaluateDag,
  gEvalJudge,
  leaf,
  lynxJudge,
  regexBranch,
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
  // judge types
  ArenaOptions,
  DagDecisionNode,
  DagLeafNode,
  DagNode,
  DagResult,
  GEvalOptions,
  PairwiseJudgeCallback,
  PairwiseResult,
  PairwiseVerdict,
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

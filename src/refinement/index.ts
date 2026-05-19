/**
 * @wranngle/voice-evals/refinement — public surface of the Refinement
 * orchestrator. See pitch deck at proof/pitch.html for the strategic frame.
 */

export {renderComplianceArtifact} from './compliance';
export {enrich, enrichFromAgentPrompt} from './enrich';
export {detectFailures, loadCatalog} from './failure-detector';
export {inferBusinessContextFromAgent, runLivePersonaCalls} from './live-adapter';
export {runRefinement} from './orchestrator';
export {CANONICAL_PERSONA_IDS, getPersonaCalls} from './persona-fixtures';
export {buildPromptDiffs} from './prompt-diff';
export {renderEventForConsole, SessionLog} from './session-log';
export {fillSystemPrompt, loadVerticalTemplates, selectTemplate} from './template-selector';
export type {
  DetectedFailure,
  EnrichmentResult,
  EnrichmentSource,
  FailureDetectorSpec,
  FailureModeCatalog,
  FailureModeEntry,
  FailureModeId,
  PersonaCall,
  PromptDiff,
  RefinementSession,
  RefineOptions,
  SessionEvent,
  TranscriptTurn,
  VerticalTemplate,
} from './types';

/**
 * @wranngle/voice-evals/ingestion — LLM data layer.
 *
 * Three ingestion paths (Phase 3 MVP):
 *   - `importPostCallWebhook(payload)` — deterministic. ElevenLabs post-call
 *     webhook payload -> TestCase[]. Use for "trace-to-test" workflows where
 *     every live call seeds a regression test.
 *   - `proposeTestCases(transcript, {llm})` — LLM-driven. TestChain Proposer.
 *     Reads a free-form conversation transcript, emits ProposedTestCase[]
 *     for human review.
 *   - persona generator — `CANONICAL_PERSONAS`, `getPersona`, `buildPersonaSystemPrompt`
 *     for adversarial / persona-driven test expansion (apply N personas to
 *     M scenarios -> N×M variant test suite).
 *
 * Deferred to Phase 3.x: the Designer step (proposed scenarios -> structured
 * assertion specs), adversarial bridge to PyRIT (lives in Phase 5 with the
 * Python sidecar), persona derivation from production call samples via LLM.
 */

export type {
  ElevenLabsPostCallPayload,
  ImportedTestCases,
  IngestionOptions,
  LlmCompleteCallback,
  ProposedTestCase,
} from './types';

export {importPostCallWebhook} from './post-call-import';
export {proposeTestCases} from './llm-data-layer';
export {designAssertions} from './designer';
export type {DesignedAssertion} from './designer';
export type {Persona, PersonaTraits} from './persona-generator';
export {
  CANONICAL_PERSONAS,
  buildPersonaSystemPrompt,
  getPersona,
  listPersonas,
} from './persona-generator';

// Phase D: random scenario generator
export {generateRandomScenarios} from './random-scenarios';
export type {
  GenerateRandomScenariosOptions, RandomScenario,
} from './random-scenarios';

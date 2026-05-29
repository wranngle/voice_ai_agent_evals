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
 * Phase 3.x extensions (also shipped):
 *   - Designer step (proposed scenarios -> structured assertion specs) —
 *     `designAssertions` from `./designer.ts`.
 *   - Random scenario generator — `generateRandomScenarios` from
 *     `./random-scenarios.ts`.
 *
 * Still deferred: adversarial bridge to PyRIT (uses the same Python sidecar
 * install path as GEPA; per README, lands in v1.2 with the GEPA optimizer
 * wiring), persona derivation from production call samples via LLM.
 */

export type {
  ElevenLabsPostCallPayload,
  ImportedTestCases,
  IngestionOptions,
  LlmCompleteCallback,
  ProposedTestCase,
} from './types';

export {LATENCY_LEG_NAMES} from '../types/latency';
export type {
  LatencyLeg,
  LatencyLegName,
  LatencyWaterfall,
} from '../types/latency';

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

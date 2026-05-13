/**
 * @wranngle/voice-evals/factory — combinatorial test factory.
 *
 * Generate thousands of ElevenLabs Tests by expanding YAML templates across
 * variable dimensions (industries × variants × scenarios × …). Then upload
 * + execute + report via the Tests API wrapper at `@wranngle/voice-evals/tests-api`.
 *
 * Ported from `wranngle/voice_ai_agents/supersystem/test-factory/` (archive
 * at commit 6e5ea66). The YAML templates under `templates/factory/` are
 * verbatim copies from the archive.
 */

export type {
  ChatHistoryTurn,
  ExpandOptions,
  ExpansionContext,
  ExpansionStrategy,
  GeneratedTest,
  Industry,
  Template,
  TestExample,
  Variant,
  VariantBucket,
} from './types';

export {
  cartesian, expand, pairwise, sample,
} from './expand';
export type {FactoryContext} from './templates';
export {
  expandAll, expandTemplate, loadIndustries, loadTemplates, loadVariants, resolveInheritance,
} from './templates';
export {generatedTestsToCreatePayloads, generatedToCreatePayload} from './to-elevenlabs';

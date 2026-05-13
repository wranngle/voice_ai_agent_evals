#!/usr/bin/env bun
/**
 * examples/factory-end-to-end.ts — generate, translate, then either upload
 * or print the test payloads.
 *
 * Run:
 *   bun examples/factory-end-to-end.ts            # prints payloads to stdout
 *   ELEVENLABS_API_KEY=... bun examples/factory-end-to-end.ts --upload AGENT_ID
 *
 * No mocks. The combinatorial expansion runs offline; the upload step
 * touches the real ElevenLabs Tests API only when --upload is passed.
 */

// Inside this repo we import from ../src directly so the example is
// runnable without installing the package against itself. In a consumer
// project, replace these with: import {...} from '@wranngle/voice-evals/factory';
import {
  expandAll,
  generatedToCreatePayload,
  loadIndustries,
  loadTemplates,
  loadVariants,
  type FactoryContext,
} from '../src/factory';

const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? 'templates/factory';

async function main() {
  const industries = loadIndustries(`${TEMPLATES_DIR}/industries.yaml`);
  const variants = loadVariants(`${TEMPLATES_DIR}/variants.yaml`);
  const templates = loadTemplates(`${TEMPLATES_DIR}/base-scenarios.yaml`);
  const context: FactoryContext = {industries, ...variants};

  const tests = expandAll(templates, context, {strategy: 'pairwise', seed: 1});
  console.log(`Generated ${tests.length} tests across ${templates.length} templates.`);

  const uploadIdx = process.argv.indexOf('--upload');
  if (uploadIdx === -1) {
    // Print the first 3 payloads as a sanity check.
    for (const t of tests.slice(0, 3)) {
      console.log(JSON.stringify(generatedToCreatePayload(t), null, 2));
    }

    return;
  }

  const agentId = process.argv[uploadIdx + 1];
  if (!agentId) {
    console.error('error: --upload <agentId> required');
    process.exit(1);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('error: ELEVENLABS_API_KEY required to --upload');
    process.exit(1);
  }

  const {ElevenLabsClient} = await import('@elevenlabs/elevenlabs-js');
  const {createVoiceEvalsClient} = await import('../src/wrapper');
  const raw = new ElevenLabsClient({apiKey});
  const client = createVoiceEvalsClient({
    client: raw,
    modelRankings: {
      default: 'gemini-3-flash-preview',
      recommended: ['gemini-3-flash-preview'],
      banned: ['gpt-4o-mini', 'gpt-5-mini', 'gemini-2.0-flash-001'],
    },
  });

  let uploaded = 0;
  for (const t of tests) {
    try {
      const remote = await client.tests.create(generatedToCreatePayload(t));
      uploaded++;
      console.log(`  ${remote.id} ← ${t.id}`);
    } catch (error: unknown) {
      console.error(`  ✗ ${t.id}: ${(error as Error).message}`);
    }
  }

  console.log(`Uploaded ${uploaded}/${tests.length} to ${agentId}.`);
}

await main();

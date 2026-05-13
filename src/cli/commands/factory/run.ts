/**
 * `voice-evals factory run --agent-id ID [--count N]` — end-to-end pipeline.
 *
 *   1. generate -> in-memory GeneratedTest[]
 *   2. upload   -> creates each test via client.tests.create
 *   3. execute  -> client.tests.runBatch + pollInvocation
 *   4. report   -> pass/fail summary
 *
 * Skips writing intermediate files — purely in-memory unless --keep-artifacts
 * is set (in which case a manifest + the GeneratedTest[] JSON land in cwd).
 */

import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  expandAll, generatedToCreatePayload, loadIndustries, loadTemplates, loadVariants, type ExpansionStrategy, type GeneratedTest,
} from '../../../factory';
import type {TestSummary} from '../../../wrapper/tests';
import type {VoiceEvalsClient} from '../../../wrapper/types';
import {buildClientFromEnv} from './client-builder';
import {printInvocationSummary} from './execute';
import type {UploadManifestEntry} from './upload';

export type FactoryRunOptions = {
  agentId: string;
  count?: number;
  strategy?: ExpansionStrategy;
  templatesDir?: string;
  seed?: number;
  keepArtifacts?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

const DEFAULT_TEMPLATES_DIR = 'templates/factory';

export async function runFactoryRun(options: FactoryRunOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.agentId) {
    out('error: voice-evals factory run --agent-id <id> required');
    return 1;
  }

  let client: VoiceEvalsClient;
  try {
    client = options.client ?? buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  const dir = options.templatesDir ?? DEFAULT_TEMPLATES_DIR;
  let tests: GeneratedTest[];
  try {
    const industries = loadIndustries(join(dir, 'industries.yaml'));
    const variants = loadVariants(join(dir, 'variants.yaml'));
    const templates = loadTemplates(join(dir, 'base-scenarios.yaml'));
    const context = {...variants, industries};
    tests = expandAll(templates, context, {
      strategy: options.strategy ?? 'sample',
      seed: options.seed ?? 1,
      sampleCount: options.count,
    });
  } catch (error: unknown) {
    out(`error: template expansion failed: ${(error as Error).message}`);
    return 1;
  }

  const limited = options.count !== undefined && tests.length > options.count
    ? tests.slice(0, options.count)
    : tests;

  out(`Generated ${limited.length} test(s) (strategy=${options.strategy ?? 'sample'}).`);

  const manifest: UploadManifestEntry[] = [];
  let failed = 0;
  for (const t of limited) {
    try {
      const created: TestSummary = await client.tests.create(generatedToCreatePayload(t));
      manifest.push({generatedId: t.id, remoteId: created.id, name: t.name});
    } catch (error: unknown) {
      out(`  ✗ ${t.id}: ${(error as Error).message}`);
      failed++;
    }
  }

  out(`Uploaded ${manifest.length}/${limited.length}${failed > 0 ? ` (${failed} failed)` : ''}.`);

  if (options.keepArtifacts) {
    writeFileSync('factory-tests.json', JSON.stringify(limited, null, 2));
    writeFileSync('factory-manifest.json', JSON.stringify(manifest, null, 2));
    out('Artifacts: factory-tests.json, factory-manifest.json');
  }

  if (manifest.length === 0) {
    out('No tests were successfully uploaded — skipping execute.');
    return 1;
  }

  const remoteIds = manifest.map(m => m.remoteId);
  const {invocationId} = await client.tests.runBatch(options.agentId, remoteIds);
  out(`Invocation: ${invocationId}`);

  const result = await client.tests.pollInvocation(invocationId, {
    intervalMs: options.intervalMs,
    timeoutMs: options.timeoutMs,
  });
  printInvocationSummary(result, out);
  return result.stats.failed === 0 && failed === 0 ? 0 : 1;
}

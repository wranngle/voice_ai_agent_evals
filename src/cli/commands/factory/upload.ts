/**
 * `voice-evals factory upload --input FILE` — upload generated tests to the
 * ElevenLabs portal. Reads a JSON array of GeneratedTest, translates each
 * to TestsCreateRequestBody, calls `client.tests.create()` once per test
 * (serial, to respect rate limits).
 *
 * --clean-first first lists+deletes all tests for the agent so the upload
 * starts from a known state. Use carefully on shared agents.
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {type GeneratedTest, generatedToCreatePayload} from '../../../factory';
import type {TestSummary} from '../../../wrapper/tests';
import type {VoiceEvalsClient} from '../../../wrapper/types';
import {buildClientFromEnv} from './client-builder';

export type FactoryUploadOptions = {
  input: string;
  agentId?: string;
  cleanFirst?: boolean;
  manifestPath?: string;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

export type UploadManifestEntry = {
  generatedId: string;
  remoteId: string;
  name: string;
};

export async function runFactoryUpload(options: FactoryUploadOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.input) {
    out('error: voice-evals factory upload --input <file> required');
    return 1;
  }

  if (!existsSync(options.input)) {
    out(`error: input file not found: ${options.input}`);
    return 1;
  }

  let tests: GeneratedTest[];
  try {
    const parsed = JSON.parse(readFileSync(options.input, 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new TypeError('expected a JSON array of GeneratedTest');
    }

    tests = parsed as GeneratedTest[];
  } catch (error: unknown) {
    out(`error: failed to parse ${options.input}: ${(error as Error).message}`);
    return 1;
  }

  let client: VoiceEvalsClient;
  try {
    client = options.client ?? buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  if (options.cleanFirst) {
    if (!options.agentId) {
      out('error: --clean-first requires --agent-id (refusing to bulk-delete unscoped tests)');
      return 1;
    }

    const existing = await client.tests.list({agentId: options.agentId} as Parameters<typeof client.tests.list>[0]);
    out(`Deleting ${existing.length} existing test(s) for ${options.agentId}…`);
    for (const t of existing) {
      await client.tests.delete(t.id);
    }
  }

  const manifest: UploadManifestEntry[] = [];
  let uploaded = 0;
  let failed = 0;
  for (const t of tests) {
    const payload = generatedToCreatePayload(t);
    try {
      const created: TestSummary = await client.tests.create(payload);
      manifest.push({generatedId: t.id, remoteId: created.id, name: t.name});
      uploaded++;
    } catch (error: unknown) {
      out(`  ✗ ${t.id}: ${(error as Error).message}`);
      failed++;
    }
  }

  out(`Uploaded ${uploaded}/${tests.length}${failed > 0 ? ` (${failed} failed)` : ''}.`);

  if (options.manifestPath) {
    writeFileSync(options.manifestPath, JSON.stringify(manifest, null, 2));
    out(`Manifest written to ${options.manifestPath}`);
  }

  return failed === 0 ? 0 : 1;
}

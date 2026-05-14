/**
 * `voice-evals factory upload --input FILE` — upload generated tests to the
 * ElevenLabs portal. Reads a JSON array of GeneratedTest, translates each
 * to TestsCreateRequestBody, calls `client.tests.create()` once per test
 * (serial, to respect rate limits).
 *
 * --clean-first scopes deletion through a prior upload manifest passed via
 * --clean-manifest <path> — the Tests API does NOT scope by agent, so
 * `tests.list({agentId})` was silently ignored before and would wipe every
 * test the key could see. If --clean-manifest is omitted, --clean-first
 * is rejected. Use `factory cleanup --all` for explicit unscoped wipes.
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {type GeneratedTest, generatedToCreatePayload} from '../../../factory';
import type {TestSummary} from '../../../wrapper/tests';
import type {VoiceEvalsClient} from '../../../wrapper/types';
import {buildClientFromEnv} from './client-builder';
import {createTracer} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.upload');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type FactoryUploadOptions = {
  input: string;
  agentId?: string;
  cleanFirst?: boolean;
  /** Manifest from a prior upload (factory upload --manifest-path) used to scope --clean-first. */
  cleanManifest?: string;
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
    if (!options.cleanManifest) {
      out('error: --clean-first requires --clean-manifest <path> (Tests API does not scope by agent;');
      out('       use `voice-evals factory cleanup --all --yes` if you really want an unscoped wipe)');
      return 1;
    }

    if (!existsSync(options.cleanManifest)) {
      out(`error: --clean-manifest not found: ${options.cleanManifest}`);
      return 1;
    }

    let toDelete: string[];
    try {
      const parsed = JSON.parse(readFileSync(options.cleanManifest, 'utf8')) as UploadManifestEntry[];
      if (!Array.isArray(parsed)) {
        throw new TypeError('manifest must be a JSON array of {remoteId} entries');
      }

      toDelete = parsed
        .map(entry => entry.remoteId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch (error: unknown) {
      out(`error: failed to read --clean-manifest: ${(error as Error).message}`);
      return 1;
    }

    out(`Deleting ${toDelete.length} prior test(s) listed in ${options.cleanManifest}…`);
    for (const id of toDelete) {
      await client.tests.delete(id);
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

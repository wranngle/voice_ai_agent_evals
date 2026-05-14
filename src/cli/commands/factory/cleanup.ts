/**
 * `voice-evals factory cleanup --manifest FILE` — delete the tests recorded
 * in a prior upload manifest.
 *
 * The ElevenLabs Tests API does NOT scope tests by agent — a Test is an
 * independent entity that can be invoked against any agent. The old
 * `--agent-id` filter passed to `tests.list({agentId})` was silently
 * ignored by the SDK and `cleanup` would wipe every test the API key
 * could see. Cleanup now requires either:
 *   - `--manifest <path>`: the JSON manifest written by `factory upload
 *     --manifest-path <path>`. Deletes exactly those `remoteId`s.
 *   - `--all`: explicit opt-in to delete every test visible to the API
 *     key. Requires `--yes` to proceed.
 *
 * `--agent-id` is still accepted for audit-trail clarity but no longer
 * scopes the operation.
 */

import {existsSync, readFileSync} from 'node:fs';
import type {VoiceEvalsClient} from '../../../wrapper/types';
import type {UploadManifestEntry} from './upload';
import {buildClientFromEnv} from './client-builder';
import {createTracer} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.cleanup');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type FactoryCleanupOptions = {
  agentId?: string;
  manifest?: string;
  all?: boolean;
  yes?: boolean;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

export async function runFactoryCleanup(options: FactoryCleanupOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.manifest && !options.all) {
    out('error: voice-evals factory cleanup requires --manifest <file> or --all');
    out('       (Tests API does not scope by agent; --agent-id alone is unsafe)');
    return 1;
  }

  if (options.all && !options.yes) {
    out('error: --all wipes every test visible to the API key. Re-run with --yes to confirm.');
    return 1;
  }

  let client: VoiceEvalsClient;
  try {
    client = options.client ?? buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  let targetIds: string[];
  let scopeLabel: string;
  if (options.manifest) {
    if (!existsSync(options.manifest)) {
      out(`error: manifest not found: ${options.manifest}`);
      return 1;
    }

    try {
      const parsed = JSON.parse(readFileSync(options.manifest, 'utf8')) as UploadManifestEntry[];
      if (!Array.isArray(parsed)) {
        throw new TypeError('manifest must be a JSON array of {remoteId} entries');
      }

      targetIds = parsed
        .map(entry => entry.remoteId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch (error: unknown) {
      out(`error: failed to read manifest ${options.manifest}: ${(error as Error).message}`);
      return 1;
    }

    scopeLabel = `manifest ${options.manifest}${options.agentId ? ` (agent ${options.agentId})` : ''}`;
  } else {
    const visible = await client.tests.list();
    targetIds = visible.map(t => t.id);
    scopeLabel = `--all (every test visible to the API key)`;
  }

  out(`Found ${targetIds.length} test(s) to delete via ${scopeLabel}…`);

  let deleted = 0;
  let failed = 0;
  for (const id of targetIds) {
    try {
      await client.tests.delete(id);
      deleted++;
    } catch (error: unknown) {
      out(`  ✗ ${id}: ${(error as Error).message}`);
      failed++;
    }
  }

  out(`Deleted ${deleted}/${targetIds.length}${failed > 0 ? ` (${failed} failed)` : ''}.`);
  return failed === 0 ? 0 : 1;
}

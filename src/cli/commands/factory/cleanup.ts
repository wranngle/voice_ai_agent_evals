/**
 * `voice-evals factory cleanup --agent-id ID` — bulk-delete every test
 * visible to the API key for a given agent. Requires explicit --agent-id
 * to avoid accidental cross-agent wipes.
 */

import type {VoiceEvalsClient} from '../../../wrapper/types';
import {buildClientFromEnv} from './client-builder';
import {createTracer} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.cleanup');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type FactoryCleanupOptions = {
  agentId: string;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

export async function runFactoryCleanup(options: FactoryCleanupOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.agentId) {
    out('error: voice-evals factory cleanup --agent-id <id> required');
    return 1;
  }

  let client: VoiceEvalsClient;
  try {
    client = options.client ?? buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  const existing = await client.tests.list({agentId: options.agentId} as Parameters<typeof client.tests.list>[0]);
  out(`Found ${existing.length} test(s) to delete for ${options.agentId}…`);

  let deleted = 0;
  let failed = 0;
  for (const t of existing) {
    try {
      await client.tests.delete(t.id);
      deleted++;
    } catch (error: unknown) {
      out(`  ✗ ${t.id}: ${(error as Error).message}`);
      failed++;
    }
  }

  out(`Deleted ${deleted}/${existing.length}${failed > 0 ? ` (${failed} failed)` : ''}.`);
  return failed === 0 ? 0 : 1;
}

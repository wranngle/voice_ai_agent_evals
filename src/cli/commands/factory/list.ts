/**
 * `voice-evals factory list` — list every test visible to the API key.
 *
 * The ElevenLabs Tests API does NOT scope tests by agent (a Test is an
 * independent entity that can be run against any agent), so list cannot
 * filter server-side. `--agent-id` is accepted only as an audit label
 * surfaced in the header line and has no effect on the returned set.
 */

import type {VoiceEvalsClient} from '../../../wrapper/types';
import {createTracer, traced} from '../../../internal/jsonl-trace';
import {buildClientFromEnv} from './client-builder';

const trace = createTracer('cli.factory.list');

export type FactoryListOptions = {
  agentId?: string;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

export async function runFactoryList(options: FactoryListOptions): Promise<number> {
  return traced(trace, undefined, async () => runFactoryListInner(options));
}

async function runFactoryListInner(options: FactoryListOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  let client: VoiceEvalsClient;
  try {
    client = options.client ?? buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  const tests = await client.tests.list();
  const scopeNote = options.agentId
    ? ` (Tests API does not scope by agent; --agent-id ${options.agentId} is informational only)`
    : '';
  out(`Found ${tests.length} test(s)${scopeNote}.`);
  for (const t of tests) {
    out(`  ${t.id}\t${t.type ?? '-'}\t${t.name ?? '(unnamed)'}`);
  }

  return 0;
}

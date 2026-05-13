/**
 * `voice-evals factory list [--agent-id ID]` — list portal-visible tests.
 *
 * If --agent-id is provided, list tests scoped to that agent. Otherwise
 * list all tests visible to the API key.
 */

import type {VoiceEvalsClient} from '../../../wrapper/types';
import {buildClientFromEnv} from './client-builder';

export type FactoryListOptions = {
  agentId?: string;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

export async function runFactoryList(options: FactoryListOptions): Promise<number> {
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

  const tests = await client.tests.list({
    ...(options.agentId ? {agentId: options.agentId} : {}),
  } as Parameters<typeof client.tests.list>[0]);

  out(`Found ${tests.length} test(s)${options.agentId ? ` for agent ${options.agentId}` : ''}.`);
  for (const t of tests) {
    out(`  ${t.id}\t${t.type ?? '-'}\t${t.name ?? '(unnamed)'}`);
  }

  return 0;
}

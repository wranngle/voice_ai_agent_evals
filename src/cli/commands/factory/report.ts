/**
 * `voice-evals factory report --invocation-id ID` — print a pass/fail
 * report for a given test invocation. Useful for async workflows where
 * `execute --async` returned an id earlier.
 */

import type {VoiceEvalsClient} from '../../../wrapper/types';
import {buildClientFromEnv} from './client-builder';
import {printInvocationSummary} from './execute';
import {createTracer} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.report');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type FactoryReportOptions = {
  invocationId: string;
  intervalMs?: number;
  timeoutMs?: number;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

export async function runFactoryReport(options: FactoryReportOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.invocationId) {
    out('error: voice-evals factory report --invocation-id <id> required');
    return 1;
  }

  let client: VoiceEvalsClient;
  try {
    client = options.client ?? buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  const result = await client.tests.pollInvocation(options.invocationId, {
    intervalMs: options.intervalMs,
    timeoutMs: options.timeoutMs,
  });

  out(`Invocation: ${result.id}`);
  printInvocationSummary(result, out);
  return result.stats.failed === 0 ? 0 : 1;
}

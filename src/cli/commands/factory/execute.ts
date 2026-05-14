/**
 * `voice-evals factory execute --agent-id ID --tests <ids…>` — run a batch
 * of tests against an agent. Calls `client.tests.runBatch()` to get an
 * invocationId, then polls until completion (or --async to return the id
 * immediately).
 *
 * --manifest <file> can be used in place of --tests to consume the JSON
 * manifest written by `factory upload`.
 */

import {existsSync, readFileSync} from 'node:fs';
import type {TestInvocationResult} from '../../../wrapper/tests';
import type {VoiceEvalsClient} from '../../../wrapper/types';
import {buildClientFromEnv} from './client-builder';
import type {UploadManifestEntry} from './upload';
import {createTracer} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.execute');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type FactoryExecuteOptions = {
  agentId: string;
  testIds?: string[];
  manifestPath?: string;
  asyncMode?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  client?: VoiceEvalsClient;
  out?: (line: string) => void;
};

export async function runFactoryExecute(options: FactoryExecuteOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.agentId) {
    out('error: voice-evals factory execute --agent-id <id> required');
    return 1;
  }

  const ids = collectTestIds(options, out);
  if (ids === undefined) {
    return 1;
  }

  if (ids.length === 0) {
    out('error: no test ids resolved — pass --tests <ids> or --manifest <file>');
    return 1;
  }

  let client: VoiceEvalsClient;
  try {
    client = options.client ?? buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  out(`Executing ${ids.length} test(s) against ${options.agentId}…`);
  const {invocationId} = await client.tests.runBatch(options.agentId, ids);
  out(`Invocation: ${invocationId}`);

  if (options.asyncMode) {
    out('Returned async (use `factory report --invocation-id` to poll).');
    return 0;
  }

  const result: TestInvocationResult = await client.tests.pollInvocation(invocationId, {
    intervalMs: options.intervalMs,
    timeoutMs: options.timeoutMs,
  });

  printInvocationSummary(result, out);
  return result.stats.failed === 0 ? 0 : 1;
}

function collectTestIds(
  options: FactoryExecuteOptions,
  out: (line: string) => void,
): string[] | undefined {
  if (options.testIds && options.testIds.length > 0) {
    return options.testIds;
  }

  if (options.manifestPath) {
    if (!existsSync(options.manifestPath)) {
      out(`error: manifest file not found: ${options.manifestPath}`);
      return undefined;
    }

    try {
      const parsed = JSON.parse(readFileSync(options.manifestPath, 'utf8')) as UploadManifestEntry[];
      return parsed.map(e => e.remoteId);
    } catch (error: unknown) {
      out(`error: failed to parse manifest: ${(error as Error).message}`);
      return undefined;
    }
  }

  return [];
}

export function printInvocationSummary(
  result: TestInvocationResult,
  out: (line: string) => void,
): void {
  const {stats} = result;
  out(`Total: ${stats.total}  Passed: ${stats.passed}  Failed: ${stats.failed}  Pending: ${stats.pending}`);
  if (stats.failed > 0) {
    out('');
    out('Failures:');
    for (const tr of result.testRuns.filter(r => r.status === 'failed')) {
      out(`  ✗ ${tr.testId}\t${tr.testName ?? ''}`);
    }
  }
}

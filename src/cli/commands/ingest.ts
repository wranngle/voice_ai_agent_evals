/**
 * `voice-evals ingest <transcript-file>` — extract structured tests from
 * arbitrary conversational data.
 *
 * Demonstrates the LLM data layer (Phase 3). Reads a text transcript,
 * pipes it through the TestChain Proposer (transcript → ProposedTestCase[])
 * then the Designer (draft assertions → DesignedAssertion[]), and prints
 * the result so the operator can decide what to keep.
 *
 * Requires the user's voice-evals.config.{ts,mjs} to export an `llm`
 * (LlmCompleteCallback).
 */

import {existsSync, readFileSync} from 'node:fs';
import {designAssertions} from '../../ingestion/designer';
import {proposeTestCases} from '../../ingestion/llm-data-layer';
import type {LlmCompleteCallback, ProposedTestCase} from '../../ingestion/types';
import {loadConfig} from './config-loader';
import {createTracer} from '../../internal/jsonl-trace';

const trace = createTracer('cli.ingest');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type IngestOptions = {
  path: string;
  /** Override the LLM callback (skip config load) — for tests. */
  llm?: LlmCompleteCallback;
  /** Inject transcript text directly (skip the filesystem read) — for tests. */
  text?: string;
  /** Stream output here. */
  out?: (line: string) => void;
  /** Override cwd for config loading. */
  cwd?: string;
};

export async function runIngest(options: IngestOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  let transcript: string;
  if (options.text === undefined) {
    if (!options.path) {
      out('error: voice-evals ingest requires a path to a transcript file');
      out('usage: voice-evals ingest <transcript-file>');
      return 1;
    }

    if (!existsSync(options.path)) {
      out(`error: file not found: ${options.path}`);
      return 1;
    }

    transcript = readFileSync(options.path, 'utf8');
  } else {
    transcript = options.text;
  }

  let llm: LlmCompleteCallback;
  if (options.llm) {
    llm = options.llm;
  } else {
    try {
      const config = await loadConfig(options.cwd);
      if (typeof config.llm !== 'function') {
        out('error: voice-evals.config must export `llm: LlmCompleteCallback`');
        out('See `voice-evals init` for a starter template.');
        return 1;
      }

      llm = config.llm as LlmCompleteCallback;
    } catch (error) {
      out(`error: ${(error as Error).message}`);
      return 1;
    }
  }

  out('Proposing test cases from transcript…');
  let proposed: ProposedTestCase[];
  try {
    proposed = await proposeTestCases(transcript, {llm});
  } catch (error) {
    out(`error: proposer LLM call failed: ${(error as Error).message}`);
    return 1;
  }

  if (proposed.length === 0) {
    out('No proposed test cases. (LLM returned empty or malformed output.)');
    return 0;
  }

  out(`Proposed ${proposed.length} test case(s):`);
  out('');

  for (const tc of proposed) {
    out(`  • ${tc.suggested_id}`);
    out(`    name:    ${tc.name}`);
    out(`    intent:  ${tc.intent}`);
    out(`    first:   ${tc.simulated_user.first_message}`);
    if (tc.persona) {
      out(`    persona: ${tc.persona}`);
    }

    out('    drafts:');
    for (const a of tc.draft_assertions) {
      out(`      - ${a}`);
    }

    try {
      const designed = await designAssertions(tc, {llm});
      if (designed.length > 0) {
        out('    designed:');
        for (const a of designed) {
          out(`      • ${JSON.stringify(a)}`);
        }
      }
    } catch (error) {
      out(`    (designer call failed: ${(error as Error).message})`);
    }

    out('');
  }

  return 0;
}

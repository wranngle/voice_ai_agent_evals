/**
 * `voice-evals factory` — dispatcher for the test-factory subcommands.
 *
 *   generate   expand templates to N tests (JSON)
 *   upload     POST those tests to the ElevenLabs portal
 *   list       list portal tests for an agent
 *   cleanup    bulk-delete tests for an agent
 *   execute    runBatch + poll an invocation
 *   report     summarize a known invocationId
 *   run        full pipeline (generate -> upload -> execute -> report)
 *
 * Each command is a thin wrapper over `src/factory/` + `src/wrapper/tests`.
 */

import type {ExpansionStrategy} from '../../../factory';
import {createTracer, traced} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.index');

export type FactoryDispatchOptions = {
  argv: readonly string[];
  out?: (line: string) => void;
};

export async function dispatchFactory(options: FactoryDispatchOptions): Promise<number> {
  return traced(trace, undefined, async () => dispatchFactoryInner(options));
}

async function dispatchFactoryInner(options: FactoryDispatchOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const subcommand = options.argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    out('voice-evals factory <subcommand>');
    out('');
    out('  generate [--strategy cartesian|pairwise|sample] [--count N] [--seed N]');
    out('           [--templates <dir>] [--output <file>]');
    out('  upload   --input <file> [--agent-id <id>] [--clean-first --clean-manifest <file>] [--manifest <file>]');
    out('  list     [--agent-id <id>]');
    out('  cleanup  (--manifest <file> | --all --yes) [--agent-id <id>]');
    out('  execute  --agent-id <id> (--tests <id…> | --manifest <file>) [--async]');
    out('  report   --invocation-id <id>');
    out('  run      --agent-id <id> [--count N] [--strategy …] [--keep-artifacts]');
    return 0;
  }

  switch (subcommand) {
    case 'generate': {
      const {runFactoryGenerate} = await import('./generate');
      return runFactoryGenerate({
        strategy: readStrategyFlag(options.argv),
        count: readNumberFlag(options.argv, '--count'),
        seed: readNumberFlag(options.argv, '--seed'),
        templatesDir: readStringFlag(options.argv, '--templates'),
        output: readStringFlag(options.argv, '--output'),
        out,
      });
    }

    case 'upload': {
      const {runFactoryUpload} = await import('./upload');
      const input = readStringFlag(options.argv, '--input');
      return runFactoryUpload({
        input: input ?? '',
        agentId: readStringFlag(options.argv, '--agent-id'),
        cleanFirst: options.argv.includes('--clean-first'),
        cleanManifest: readStringFlag(options.argv, '--clean-manifest'),
        manifestPath: readStringFlag(options.argv, '--manifest'),
        out,
      });
    }

    case 'list': {
      const {runFactoryList} = await import('./list');
      return runFactoryList({
        agentId: readStringFlag(options.argv, '--agent-id'),
        out,
      });
    }

    case 'cleanup': {
      const {runFactoryCleanup} = await import('./cleanup');
      return runFactoryCleanup({
        agentId: readStringFlag(options.argv, '--agent-id'),
        manifest: readStringFlag(options.argv, '--manifest'),
        all: options.argv.includes('--all'),
        yes: options.argv.includes('--yes'),
        out,
      });
    }

    case 'execute': {
      const {runFactoryExecute} = await import('./execute');
      return runFactoryExecute({
        agentId: readStringFlag(options.argv, '--agent-id') ?? '',
        testIds: readStringListFlag(options.argv, '--tests'),
        manifestPath: readStringFlag(options.argv, '--manifest'),
        asyncMode: options.argv.includes('--async'),
        intervalMs: readNumberFlag(options.argv, '--interval-ms'),
        timeoutMs: readNumberFlag(options.argv, '--timeout-ms'),
        out,
      });
    }

    case 'report': {
      const {runFactoryReport} = await import('./report');
      return runFactoryReport({
        invocationId: readStringFlag(options.argv, '--invocation-id') ?? '',
        intervalMs: readNumberFlag(options.argv, '--interval-ms'),
        timeoutMs: readNumberFlag(options.argv, '--timeout-ms'),
        out,
      });
    }

    case 'run': {
      const {runFactoryRun} = await import('./run');
      return runFactoryRun({
        agentId: readStringFlag(options.argv, '--agent-id') ?? '',
        count: readNumberFlag(options.argv, '--count'),
        strategy: readStrategyFlag(options.argv),
        templatesDir: readStringFlag(options.argv, '--templates'),
        seed: readNumberFlag(options.argv, '--seed'),
        keepArtifacts: options.argv.includes('--keep-artifacts'),
        intervalMs: readNumberFlag(options.argv, '--interval-ms'),
        timeoutMs: readNumberFlag(options.argv, '--timeout-ms'),
        out,
      });
    }

    default: {
      out(`unknown factory subcommand: ${subcommand}`);
      out('Run `voice-evals factory --help` for the full surface.');
      return 1;
    }
  }
}

function readStringFlag(argv: readonly string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) {
    return undefined;
  }

  return argv[idx + 1];
}

function readNumberFlag(argv: readonly string[], flag: string): number | undefined {
  const raw = readStringFlag(argv, flag);
  if (raw === undefined) {
    return undefined;
  }

  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function readStringListFlag(argv: readonly string[], flag: string): string[] | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) {
    return undefined;
  }

  const out: string[] = [];
  for (let i = idx + 1; i < argv.length; i++) {
    const v = argv[i];
    if (v.startsWith('--')) {
      break;
    }

    out.push(v);
  }

  return out;
}

function readStrategyFlag(argv: readonly string[]): ExpansionStrategy | undefined {
  const raw = readStringFlag(argv, '--strategy');
  if (raw === 'cartesian' || raw === 'pairwise' || raw === 'sample') {
    return raw;
  }

  return undefined;
}

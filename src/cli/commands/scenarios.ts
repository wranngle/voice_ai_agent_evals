/**
 * `voice-evals scenarios generate [--count N] [--seed N] [--output FILE]`
 *
 * Emits N random RandomScenario objects (industry + objection mix) to stdout
 * or --output. Deterministic by --seed.
 */

import {writeFileSync} from 'node:fs';
import {generateRandomScenarios} from '../../ingestion/random-scenarios';
import {createTracer, traced} from '../../internal/jsonl-trace';

const trace = createTracer('cli.scenarios');

export type ScenariosDispatchOptions = {
  argv: readonly string[];
  out?: (line: string) => void;
};

export async function dispatchScenarios(options: ScenariosDispatchOptions): Promise<number> {
  return traced(trace, undefined, async () => dispatchScenariosInner(options));
}

async function dispatchScenariosInner(options: ScenariosDispatchOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const subcommand = options.argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    out('voice-evals scenarios <subcommand>');
    out('');
    out('  generate [--count N] [--seed N] [--ratio 0..1] [--output FILE]');
    out('      Emit N random scenarios (default 25) with seed-deterministic');
    out('      industry × name × volume × interest × objection mixing.');
    return 0;
  }

  if (subcommand !== 'generate') {
    out(`unknown scenarios subcommand: ${subcommand}`);
    return 1;
  }

  const count = readNumberFlag(options.argv, '--count') ?? 25;
  const seed = readNumberFlag(options.argv, '--seed') ?? 1;
  const ratio = readNumberFlag(options.argv, '--ratio');
  const outFile = readStringFlag(options.argv, '--output');

  const scenarios = generateRandomScenarios(count, {
    seed,
    industryRatio: ratio === undefined ? undefined : ratio / 100,
  });

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(scenarios, null, 2));
    out(`Wrote ${scenarios.length} scenario(s) to ${outFile} (seed=${seed}).`);
  } else {
    out(JSON.stringify(scenarios, null, 2));
  }

  return 0;
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

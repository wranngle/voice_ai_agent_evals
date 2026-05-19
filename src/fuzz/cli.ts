#!/usr/bin/env bun
/**
 * CLI entry for `npm run fuzz:inject`. Resolves --seed / --n / --out flags,
 * runs the fuzzer, and prints the attack_class summary table to stdout.
 */

import {resolve} from 'node:path';
import {runFuzz, renderClassTable, type AttackClass} from './inject';

type ParsedArgs = {seed: string; n: number; out: string | undefined; classes: AttackClass[] | undefined; templates: string | undefined};

function parseArgs(argv: string[]): ParsedArgs {
  let seed = '';
  let n = 50;
  let out: string | undefined;
  let templates: string | undefined;
  let classes: AttackClass[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed') {
      seed = argv[++i] ?? '';
    } else if (arg.startsWith('--seed=')) {
      seed = arg.slice('--seed='.length);
    } else if (arg === '--n') {
      n = Number.parseInt(argv[++i] ?? '50', 10);
    } else if (arg.startsWith('--n=')) {
      n = Number.parseInt(arg.slice('--n='.length), 10);
    } else if (arg === '--out') {
      out = argv[++i];
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    } else if (arg === '--templates') {
      templates = argv[++i];
    } else if (arg.startsWith('--templates=')) {
      templates = arg.slice('--templates='.length);
    } else if (arg === '--classes') {
      classes = (argv[++i] ?? '').split(',').filter(Boolean) as AttackClass[];
    } else if (arg.startsWith('--classes=')) {
      classes = arg.slice('--classes='.length).split(',').filter(Boolean) as AttackClass[];
    }
  }

  if (!seed) {
    throw new Error('fuzz: --seed <path-to-scenario.yaml> is required');
  }

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`fuzz: --n must be a positive integer (got ${n})`);
  }

  return {
    seed: resolve(seed), n, out, classes, templates,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runFuzz({
    seedPath: args.seed,
    n: args.n,
    outDir: args.out,
    classes: args.classes,
    templatesPath: args.templates,
  });
  process.stdout.write(`${renderClassTable(report)}\n`);
  process.stdout.write(`\nReport: out/fuzz/${report.runId}/report.json\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`fuzz: ${message}\n`);
  process.exit(1);
});

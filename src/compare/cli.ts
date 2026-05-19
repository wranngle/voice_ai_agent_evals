#!/usr/bin/env bun
/**
 * voice-evals compare CLI.
 *
 *   bun run src/compare/cli.ts \
 *     --runs out/run-a.json,out/run-b.json \
 *     --out  out/compare.html
 *
 * Each --runs entry is a JSON file containing a RunResult object:
 *   {
 *     "agentId": "aria-v1",
 *     "scenario": "refund-flow",
 *     "outcome": { "status": "passed", "score": 0.92, "dimensions": [...], "errors": [] }
 *   }
 *
 * Outputs the rendered HTML to --out (or stdout if --out is "-").
 */

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {compareRuns} from './compare';
import {renderCompareHtml} from './render-html';
import type {RunResult} from './types';

function readFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx + 1 >= argv.length) {
    return undefined;
  }

  return argv[idx + 1];
}

function loadRun(path: string): RunResult {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Partial<RunResult>;
  if (!parsed.agentId || !parsed.scenario || !parsed.outcome) {
    throw new Error(`Invalid RunResult at ${path}: missing agentId / scenario / outcome`);
  }

  return parsed as RunResult;
}

export async function runCompareCli(argv: string[]): Promise<number> {
  const runsCsv = readFlag(argv, '--runs');
  const outPath = readFlag(argv, '--out') ?? '-';
  if (!runsCsv) {
    process.stderr.write('usage: voice-evals compare --runs <path,path,...> [--out <file|->]\n');
    return 2;
  }

  const paths = runsCsv.split(',').map(s => s.trim()).filter(Boolean);
  if (paths.length < 2) {
    process.stderr.write('compare: provide at least 2 --runs paths\n');
    return 2;
  }

  const runs = paths.map(p => loadRun(p));
  const result = compareRuns(runs);
  const html = renderCompareHtml(result);

  if (outPath === '-') {
    process.stdout.write(html);
  } else {
    mkdirSync(dirname(outPath), {recursive: true});
    writeFileSync(outPath, html, 'utf8');
    process.stdout.write(`wrote ${outPath} (${html.length} bytes)\n`);
  }

  return 0;
}

if (import.meta.main) {
  const code = await runCompareCli(process.argv.slice(2));
  if (code !== 0) {
    process.exit(code);
  }
}

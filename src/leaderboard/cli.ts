/**
 * CLI for `npm run leaderboard`. Loads agent run sets from a JSON file
 * (or the bundled demo fixture if `--demo` is passed / no input) and
 * writes the two artifacts under `out/`.
 *
 * Usage:
 *   bun run src/leaderboard/cli.ts                 # uses bundled DEMO_AGENTS
 *   bun run src/leaderboard/cli.ts --in runs.json  # custom agent input array
 *   bun run src/leaderboard/cli.ts --out-dir dist  # override output directory
 */

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {buildLeaderboard} from './aggregate';
import {DEMO_AGENTS} from './fixtures';
import {renderJson, renderMarkdown} from './render';
import type {LeaderboardAgentInput} from './types';

type CliArgs = {
  inPath?: string;
  outDir: string;
};

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {outDir: 'out'};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--in': {
        args.inPath = argv[++i];

        break;
      }

      case '--out-dir': {
        args.outDir = argv[++i];

        break;
      }

      case '--demo': {
        args.inPath = undefined;

        break;
      }

      case '--help':
      case '-h': {
        process.stdout.write('Usage: leaderboard [--in <path>] [--out-dir <dir>] [--demo]\n');
        process.exit(0);

        break;
      }
    // No default
    }
  }

  return args;
}

function loadAgents(inPath: string): LeaderboardAgentInput[] {
  const raw = readFileSync(resolve(inPath), 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new TypeError(`leaderboard: --in file must be a JSON array of agent inputs, got ${typeof parsed}`);
  }

  return parsed as LeaderboardAgentInput[];
}

export function runCli(argv: readonly string[]): void {
  const args = parseArgs(argv);
  const agents = args.inPath ? loadAgents(args.inPath) : DEMO_AGENTS;
  const board = buildLeaderboard(agents);

  const outDir = resolve(args.outDir);
  mkdirSync(outDir, {recursive: true});
  const mdPath = join(outDir, 'leaderboard.md');
  const jsonPath = join(outDir, 'leaderboard.json');
  mkdirSync(dirname(mdPath), {recursive: true});
  writeFileSync(mdPath, renderMarkdown(board), 'utf8');
  writeFileSync(jsonPath, renderJson(board), 'utf8');

  process.stdout.write(`leaderboard: wrote ${board.rows.length} rows -> ${mdPath} + ${jsonPath}\n`);
}

const invokedDirectly
  // Bun / tsx
  = (typeof import.meta.main === 'boolean' && import.meta.main)
  // Node ESM fallback
    || (process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`);

if (invokedDirectly) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`leaderboard: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

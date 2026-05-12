#!/usr/bin/env bun
/**
 * @wranngle/voice-evals CLI entry.
 *
 * Phase 6.x: dispatch new top-level commands to src/cli/commands/*; fall
 * back to the legacy testing CLI for everything else (run, list, validate,
 * report, ingest, clear).
 *
 *   voice-evals doctor                  — sidecar status
 *   voice-evals init                    — scaffold voice-evals.config.ts
 *   voice-evals baseline capture <name> — snapshot current results as baseline
 *   voice-evals baseline diff <name>    — diff current vs named baseline
 *   voice-evals <anything-else>         — delegated to src/testing/cli.ts
 */

// `export {}` makes this a module so top-level await is allowed under tsc.
export {};

const command = process.argv[2];
const exitCode = await dispatch();
if (typeof exitCode === 'number' && exitCode !== 0) {
  process.exit(exitCode);
}

async function dispatch(): Promise<number | undefined> {
  switch (command) {
    case 'doctor': {
      const {runDoctor} = await import('./cli/commands/doctor');
      return runDoctor();
    }

    case 'init': {
      const {runInit} = await import('./cli/commands/init');
      const force = process.argv.includes('--force');
      return runInit({force});
    }

    case 'baseline': {
      const subcommand = process.argv[3];
      const name = process.argv[4];
      const {runBaselineCapture, runBaselineDiff} = await import('./cli/commands/baseline');
      if (subcommand === 'capture') {
        return runBaselineCapture(name);
      }

      if (subcommand === 'diff') {
        return runBaselineDiff(name);
      }

      process.stdout.write('usage: voice-evals baseline {capture|diff} <name>\n');
      return 1;
    }

    default: {
      // Side-effect import: src/testing/cli.ts calls main() at module load.
      await import('./testing/cli');
      return undefined;
    }
  }
}

#!/usr/bin/env bun
/**
 * @wranngle/voice-evals CLI entry.
 *
 * v1.0 top-level surface:
 *   init             scaffold voice-evals.config.{ts,mjs}
 *   demo             60-second end-to-end demo on a synthesized fixture
 *   score <wav>      audio-native scoring (voice-activity + barge-in)
 *   ingest <txt>     transcript → ProposedTestCase[] via LLM data layer
 *   polish <agent>   closed-loop remediation (proposer + apply + iterate)
 *   baseline ...     versioned regression baselines + diff
 *   doctor           Python sidecar status / install
 *   legacy <cmd>     legacy harness (v0.x scenario YAML / .test-data flow)
 *   --help, -h       this help
 */

// `export {}` makes this a module so top-level await is allowed under tsc.
export {};

const command = process.argv[2];
const exitCode = await dispatch();
if (typeof exitCode === 'number' && exitCode !== 0) {
  process.exit(exitCode);
}

async function dispatch(): Promise<number | undefined> {
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    const {runHelp} = await import('./cli/commands/help');
    return runHelp();
  }

  switch (command) {
    case 'doctor': {
      const {runDoctor} = await import('./cli/commands/doctor');
      const install = process.argv.includes('--install');
      const dryRun = process.argv.includes('--dry-run');
      return runDoctor({install, dryRun});
    }

    case 'init': {
      const {runInit} = await import('./cli/commands/init');
      const force = process.argv.includes('--force');
      return runInit({force});
    }

    case 'score': {
      const {runScore} = await import('./cli/commands/score');
      const path = process.argv[3];
      const htmlOut = readStringFlag('--html-out');
      const runId = readStringFlag('--run-id');
      return runScore({path, htmlOut, runId});
    }

    case 'demo': {
      const {runDemo} = await import('./cli/commands/demo');
      return runDemo();
    }

    case 'ingest': {
      const {runIngest} = await import('./cli/commands/ingest');
      const path = process.argv[3];
      return runIngest({path});
    }

    case 'polish': {
      const {runPolish} = await import('./cli/commands/polish');
      const agentId = process.argv[3];
      const dryRun = process.argv.includes('--dry-run');
      const maxIterations = readNumberFlag('--max-iterations');
      const patience = readNumberFlag('--patience');
      return runPolish({
        agentId, dryRun, maxIterations, patience,
      });
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

    case 'factory': {
      const {dispatchFactory} = await import('./cli/commands/factory');
      return dispatchFactory({argv: process.argv.slice(3)});
    }

    case 'agent': {
      const {dispatchAgent} = await import('./cli/commands/agent');
      return dispatchAgent({argv: process.argv.slice(3)});
    }

    case 'friction': {
      const {dispatchFriction} = await import('./cli/commands/friction');
      return dispatchFriction({argv: process.argv.slice(3)});
    }

    case 'n8n': {
      const {dispatchN8n} = await import('./cli/commands/n8n');
      return dispatchN8n({argv: process.argv.slice(3)});
    }

    case 'webhooks': {
      const {dispatchWebhooks} = await import('./cli/commands/webhooks');
      return dispatchWebhooks({argv: process.argv.slice(3)});
    }

    case 'scenarios': {
      const {dispatchScenarios} = await import('./cli/commands/scenarios');
      return dispatchScenarios({argv: process.argv.slice(3)});
    }

    case 'legacy': {
      // Shift argv left so the legacy CLI sees its own subcommand at argv[2].
      process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      await import('./testing/cli');
      return undefined;
    }

    default: {
      process.stdout.write(`unknown command: ${command}\n`);
      process.stdout.write('Run `voice-evals --help` for the full surface.\n');
      return 1;
    }
  }
}

function readNumberFlag(flag: string): number | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }

  const value = Number.parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(value) ? value : undefined;
}

function readStringFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }

  return process.argv[idx + 1];
}

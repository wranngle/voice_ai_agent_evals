#!/usr/bin/env bun
/**
 * @wranngle/voice-evals CLI entry.
 *
 * Top-level surface (v1.0 + v1.1):
 *   init             scaffold voice-evals.config.{ts,mjs}
 *   demo             60-second end-to-end demo on a synthesized fixture
 *   score <wav>      audio-native scoring (voice-activity + barge-in)
 *   ingest <txt>     transcript → ProposedTestCase[] via LLM data layer
 *   polish <agent>   closed-loop remediation (proposer + apply + iterate)
 *   refine ...       business-targeted closed-loop refinement (v1.2 prep)
 *   ceo-demo ...     live multi-scenario × persona showcase (DEV inbound)
 *   baseline ...     versioned regression baselines + diff
 *   compare ...      side-by-side scorecard for N agents (--runs a,b --out f)
 *   doctor           Python sidecar status / install
 *   factory ...      generate / upload / list / cleanup / execute / report / run
 *   agent ...        agents.{list, create, clone, archive, promote} (governance-gated)
 *   friction ...     remediation cycle stats + friction log (summary | dump | stats)
 *   n8n ...          n8n workflow auto-corrector (fix | validate | diagnose)
 *   webhooks ...     ElevenLabs ↔ n8n post-call webhook (provision | rotate | status)
 *   scenarios ...    random scenario generator (list | export)
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
      const jsonLog = readStringFlag('--json-log');
      return runScore({
        path, htmlOut, runId, jsonLogPath: jsonLog,
      });
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

    case 'refine': {
      const {runRefine} = await import('./cli/commands/refine');
      const businessName = readStringFlag('--business-name');
      const websiteUrl = readStringFlag('--website');
      const vertical = readStringFlag('--vertical');
      const sessionId = readStringFlag('--session-id');
      const outDir = readStringFlag('--out-dir');
      const agentId = readStringFlag('--agent-id');
      const mock = process.argv.includes('--mock');
      const noLlm = process.argv.includes('--no-llm');
      const personaCsv = readStringFlag('--personas');
      const personaIds = personaCsv ? personaCsv.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      return runRefine({
        businessName, websiteUrl, vertical, sessionId, outDir, mock, personaIds, agentId, noLlm,
      });
    }

    case 'ceo-demo': {
      const {runCeoDemo} = await import('./cli/commands/ceo-demo');
      const agentIdArg = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : undefined;
      const scenarios = readNumberFlag('--scenarios');
      const concurrency = readNumberFlag('--concurrency');
      return runCeoDemo({agentId: agentIdArg, scenarios, concurrency});
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

    case 'compare': {
      const {runCompareCli} = await import('./compare/cli');
      return runCompareCli(process.argv.slice(3));
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

    case 'legacy':
    // Top-level passthroughs to the legacy testing CLI. Without these, every
    // `bun run testing run -t scenario` / `testing list` / `testing validate`
    // / `testing report` invocation across docs/{deployment, handling-model-
    // updates, extending-the-harness}.md + the package.json `testing:run`/
    // `testing:list`/`testing:validate`/`testing:report` scripts errors with
    // "unknown command". The legacy CLI's help text + 8 referenced doc sites
    // all expect the bare verb. The `legacy <subcmd>` form is kept for
    // explicitness.
    case 'run':
    case 'list':
    case 'validate':
    case 'report': {
      // Shift argv so the legacy CLI sees its own subcommand at argv[2].
      // For 'legacy <sub>' the user already typed the subcommand; drop the
      // 'legacy' word. For the bare passthroughs the verb itself IS the
      // subcommand; keep argv[2..] intact.
      if (command === 'legacy') {
        process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
      }

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

  const value = process.argv[idx + 1];
  return value.startsWith('--') ? undefined : value;
}

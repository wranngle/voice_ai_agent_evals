/**
 * `voice-evals agent <subcommand>` — agent CRUD CLI.
 *
 *   list                     — list agents with [PHASE] parsing
 *   create <name>            — create a new agent (auto [DEV]-prefixed)
 *   clone <id> <name>        — duplicate an agent and rename
 *   archive <id>             — rename with [ARCHIVED] prefix
 *   promote <id> <phase>     — phase transition (DEV->ALPHA->BETA->PROD)
 *
 * All mutations are governance-gated. Promote requires explicit confirmation
 * since it moves an agent to a phase that the wrapper otherwise refuses.
 */

import {createTracer, traced} from '../../internal/jsonl-trace';
import {buildClientFromEnv} from './factory/client-builder';

const trace = createTracer('cli.agent');

export type AgentDispatchOptions = {
  argv: readonly string[];
  out?: (line: string) => void;
};

export async function dispatchAgent(options: AgentDispatchOptions): Promise<number> {
  return traced(trace, undefined, async () => dispatchAgentInner(options));
}

async function dispatchAgentInner(options: AgentDispatchOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const subcommand = options.argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    out('voice-evals agent <subcommand>');
    out('');
    out('  list');
    out('  create <name>');
    out('  clone <source-agent-id> <new-name>');
    out('  archive <agent-id> [--allowed-phases DEV,PROD,...] [--allow-untagged] [--reason <text>]');
    out('  promote <agent-id> <DEV|ALPHA|BETA|PROD> [--approved-by <name>] [--reason <text>]');
    return 0;
  }

  let client;
  try {
    client = buildClientFromEnv();
  } catch (error: unknown) {
    out(`error: ${(error as Error).message}`);
    return 1;
  }

  switch (subcommand) {
    case 'list': {
      const agents = await client.agents.list();
      out(`Found ${agents.length} agent(s).`);
      for (const a of agents) {
        out(`  ${a.id}\t${a.parsedName.phase ?? '-'}\t${a.name}`);
      }

      return 0;
    }

    case 'create': {
      const name = options.argv[1];
      if (!name) {
        out('error: voice-evals agent create <name> required');
        return 1;
      }

      const created = await client.agents.create({name});
      out(`Created: ${created.id}\t${created.name}`);
      return 0;
    }

    case 'clone': {
      const sourceId = options.argv[1];
      const namePrefix = options.argv[2];
      if (!sourceId || !namePrefix) {
        out('error: voice-evals agent clone <source-agent-id> <new-name-prefix> required');
        return 1;
      }

      const cloned = await client.agents.clone(sourceId, {namePrefix});
      out(`Cloned ${sourceId} -> ${cloned.id}\t${cloned.name}`);
      return 0;
    }

    case 'archive': {
      const id = options.argv[1];
      if (!id) {
        out('error: voice-evals agent archive <agent-id> required');
        return 1;
      }

      const allowedPhases = readPhaseListFlag(options.argv, '--allowed-phases');
      const allowUntagged = options.argv.includes('--allow-untagged');
      const reason = readStringFlag(options.argv, '--reason');
      await client.agents.archive(id, {
        ...(allowedPhases ? {allowedPhases} : {}),
        ...(allowUntagged ? {allowUntagged: true} : {}),
        ...(reason ? {reason} : {}),
      });
      out(`Archived: ${id}`);
      return 0;
    }

    case 'promote': {
      const id = options.argv[1];
      const toPhase = options.argv[2] as 'DEV' | 'ALPHA' | 'BETA' | 'PROD' | undefined;
      const approvedBy = readStringFlag(options.argv, '--approved-by');
      const reason = readStringFlag(options.argv, '--reason');
      if (!id || !toPhase) {
        out('error: voice-evals agent promote <agent-id> <DEV|ALPHA|BETA|PROD>');
        return 1;
      }

      if (!approvedBy || !reason) {
        out('error: promote requires --approved-by <name> --reason <text>');
        return 1;
      }

      const promoted = await client.agents.promote(id, toPhase, {approvedBy, reason});
      out(`Promoted ${id} -> [${toPhase}]\t${promoted.name}`);
      return 0;
    }

    default: {
      out(`unknown agent subcommand: ${subcommand}`);
      out('Run `voice-evals agent --help` for the full surface.');
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

const PHASE_VALUES = new Set(['DEV', 'ALPHA', 'BETA', 'PROD', 'ARCHIVED']);

function readPhaseListFlag(argv: readonly string[], flag: string): Array<'DEV' | 'ALPHA' | 'BETA' | 'PROD' | 'ARCHIVED'> | undefined {
  const raw = readStringFlag(argv, flag);
  if (raw === undefined) {
    return undefined;
  }

  const tokens = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const valid = tokens.filter(t => PHASE_VALUES.has(t)) as Array<'DEV' | 'ALPHA' | 'BETA' | 'PROD' | 'ARCHIVED'>;
  return valid.length > 0 ? valid : undefined;
}

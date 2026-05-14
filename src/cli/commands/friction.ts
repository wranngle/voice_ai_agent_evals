/**
 * `voice-evals friction <subcommand>` — JSONL audit-log ops.
 *
 *   tail            — list unresolved friction events
 *   list            — read whole log (resolved + unresolved)
 *   resolve         — append a TOMBSTONE (O(1)) matching pattern/type/timestamp
 */

import {
  getUnresolvedFrictions, readFrictionLog, resolveFrictionAppend,
} from '../../remediation/friction-log';
import {createTracer} from '../../internal/jsonl-trace';

const trace = createTracer('cli.friction');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type FrictionDispatchOptions = {
  argv: readonly string[];
  out?: (line: string) => void;
};

const DEFAULT_PATH = 'data/friction-log.jsonl';

export async function dispatchFriction(options: FrictionDispatchOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const subcommand = options.argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    out('voice-evals friction <subcommand>');
    out('');
    out('  tail   [--path <jsonl>]                       list unresolved events');
    out('  list   [--path <jsonl>]                       list every event');
    out('  resolve [--pattern <id>] [--type <type>]      append a TOMBSTONE');
    out('          [--timestamp <iso>] [--path <jsonl>]');
    return 0;
  }

  const path = readStringFlag(options.argv, '--path') ?? DEFAULT_PATH;

  switch (subcommand) {
    case 'tail': {
      const events = getUnresolvedFrictions(path);
      out(`Found ${events.length} unresolved event(s) in ${path}.`);
      for (const e of events.slice(-50)) {
        out(`  ${e.timestamp}\t${e.type}\t${e.pattern ?? '-'}\t${e.agentId ?? '-'}`);
      }

      return 0;
    }

    case 'list': {
      const events = readFrictionLog(path);
      out(`Found ${events.length} event(s) in ${path}.`);
      for (const e of events) {
        const resolved = e.resolved ? 'RESOLVED' : '       ';
        out(`  ${resolved}\t${e.timestamp}\t${e.type}\t${e.pattern ?? '-'}`);
      }

      return 0;
    }

    case 'resolve': {
      const pattern = readStringFlag(options.argv, '--pattern');
      const type = readStringFlag(options.argv, '--type');
      const timestamp = readStringFlag(options.argv, '--timestamp');
      if (!pattern && !type && !timestamp) {
        out('error: at least one of --pattern, --type, --timestamp is required');
        return 1;
      }

      const tombstone = resolveFrictionAppend({pattern, type, timestamp}, {path});
      out(`Tombstone appended at ${tombstone.timestamp}: matcher=${JSON.stringify({pattern, type, timestamp})}`);
      return 0;
    }

    default: {
      out(`unknown friction subcommand: ${subcommand}`);
      out('Run `voice-evals friction --help` for the full surface.');
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
